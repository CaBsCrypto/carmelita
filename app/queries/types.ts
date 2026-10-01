import { z } from "zod";

export type QueryLocale = "es" | "en" | "pt";
export type QueryScope = "agent:read" | "agent:context" | "agent:conversation";
export type QueryContext = { userId: string; locale: QueryLocale; signal?: AbortSignal };
export type QueryPrincipal = { userId: string; scopes: readonly string[] };

export type QueryDefinition = {
  id: string;
  toolName: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  scope: QueryScope;
  dataScope: string;
  requirements?: readonly string[];
  execute: (input: unknown, context: QueryContext) => Promise<unknown>;
};

export function defineQuery<T extends z.ZodRawShape>(definition: {
  id: string;
  toolName: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject<T>;
  scope: QueryScope;
  dataScope: string;
  requirements?: readonly string[];
  execute: (input: z.infer<z.ZodObject<T>>, context: QueryContext) => Promise<unknown>;
}): QueryDefinition {
  return {
    ...definition,
    execute: (input, context) => definition.execute(definition.inputSchema.parse(input), context),
  };
}

/** Authorization precedes parsing and all provider/owner reads. */
export async function executeQueryDefinition(
  definition: QueryDefinition,
  input: unknown,
  principal: QueryPrincipal | undefined,
  locale: QueryLocale = "es",
): Promise<unknown> {
  if (!principal?.userId?.trim()) throw new Error("mcp_personal_authorization_required");
  if (!principal.scopes.includes(definition.scope)) throw new Error("mcp_insufficient_scope");
  const parsed = definition.inputSchema.parse(input);
  const controller = new AbortController();
  // Give cooperative providers a brief window to return partial/unavailable data
  // before the hard total deadline, including providers which ignore cancellation.
  const cancellation = setTimeout(() => controller.abort(), 19_800);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("read_query_timeout")); }, 20_000);
  });
  try {
    return await Promise.race([definition.execute(parsed, { userId: principal.userId, locale, signal: controller.signal }), deadline]);
  } finally { clearTimeout(cancellation); if (timer) clearTimeout(timer); }
}
