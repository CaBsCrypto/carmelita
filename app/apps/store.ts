import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "@/db";
import type { AppChange, AppChannel, AppDefinition, AppInstallation, BazaarEnrollment } from "./types";

export type AppMutation =
  | { operation: "prepare"; change: AppChange }
  | { operation: "confirm"; changeId: string; channel: AppChannel; tokenHash: string; now: string }
  | { operation: "cancel"; changeId: string; channel: AppChannel }
  | { operation: "claim"; installationId: string; generation: number; intent: BazaarEnrollment; leaseToken: string; leaseExpiresAt: string; now: string }
  | { operation: "save"; installationId: string; generation: number; leaseToken: string; enrollment: BazaarEnrollment; now: string }
  | { operation: "fail"; installationId: string; generation: number; leaseToken: string; error: string; now: string };
export type AppMutationResult = { change?: AppChange; installation?: AppInstallation; enrollment?: BazaarEnrollment; claimed?: boolean };
export interface AppStore {
  definition(appId: string): Promise<AppDefinition | null>;
  saveDefinition(definition: AppDefinition, expectedRevision: number): Promise<AppDefinition>;
  installations(userId: string): Promise<AppInstallation[]>;
  installation(userId: string, appId: string): Promise<AppInstallation | null>;
  enrollment(userId: string, appId: string): Promise<BazaarEnrollment | null>;
  change(userId: string, changeId: string): Promise<AppChange | null>;
  mutate(userId: string, mutation: AppMutation): Promise<AppMutationResult>;
}
export type AppsSqlExecutor = (query: string, parameters: unknown[]) => Promise<Record<string, unknown>[]>;
function databaseExecutor(): AppsSqlExecutor {
  return async (query, parameters) => {
    const url = getDatabaseUrl(); if (!url) throw new Error("database_not_configured");
    return neon(url).query(query, parameters) as Promise<Record<string, unknown>[]>;
  };
}
function storeError(error: unknown): never {
  const match = error instanceof Error ? error.message.match(/\bapp_[a-z_]{1,80}\b/) : null;
  throw new Error(match?.[0] ?? (error instanceof Error && error.message === "database_not_configured" ? error.message : "app_store_unavailable"));
}
/** All mutations run inside one PostgreSQL function/transaction. No schema DDL on reads. */
export function createSqlAppStore(execute: AppsSqlExecutor = databaseExecutor()): AppStore {
  async function read<T>(query: string, params: unknown[]) {
    try { return (await execute(query, params)).map(row => row.data as T); } catch (error) { return storeError(error); }
  }
  return {
    async definition(appId) { return (await read<AppDefinition>("SELECT data FROM personal_app_definitions WHERE id=$1", [appId]))[0] ?? null; },
    async saveDefinition(definition, expectedRevision) {
      const rows = await read<AppDefinition>(expectedRevision === 0
        ? "INSERT INTO personal_app_definitions(id,data) VALUES($1,$2::jsonb) ON CONFLICT(id) DO NOTHING RETURNING data"
        : "UPDATE personal_app_definitions SET data=$2::jsonb WHERE id=$1 AND (data->>'approvalRevision')::int=$3 RETURNING data",
        expectedRevision === 0 ? [definition.id, JSON.stringify(definition)] : [definition.id, JSON.stringify(definition), expectedRevision]);
      if (!rows[0]) throw new Error("app_review_conflict"); return rows[0];
    },
    installations: userId => read<AppInstallation>("SELECT data FROM personal_app_installations WHERE user_id=$1 ORDER BY app_id", [userId]),
    async installation(userId, appId) { return (await read<AppInstallation>("SELECT data FROM personal_app_installations WHERE user_id=$1 AND app_id=$2", [userId, appId]))[0] ?? null; },
    async enrollment(userId, appId) { return (await read<BazaarEnrollment>("SELECT data FROM personal_app_enrollments WHERE user_id=$1 AND app_id=$2", [userId, appId]))[0] ?? null; },
    async change(userId, changeId) { return (await read<AppChange>("SELECT data FROM personal_app_changes WHERE user_id=$1 AND id=$2", [userId, changeId]))[0] ?? null; },
    async mutate(userId, mutation) {
      try { const rows = await execute("SELECT personal_apps_mutate($1,$2::jsonb) AS data", [userId, JSON.stringify(mutation)]);
        if (!rows[0]?.data) throw new Error("app_store_unavailable"); return rows[0].data as AppMutationResult;
      } catch (error) { return storeError(error); }
    },
  };
}
