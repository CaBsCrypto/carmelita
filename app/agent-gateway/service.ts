import { createHash, randomUUID } from "node:crypto";
import { getGatewayCapability } from "@/app/agent-gateway/catalog";
import {
  getGatewayStore,
  type GatewayStore,
} from "@/app/agent-gateway/store";
import {
  GATEWAY_API_VERSION,
  GATEWAY_ENVIRONMENT,
  gatewayPlanInputSchema,
  type GatewayPlan,
  type GatewayPlanInput,
} from "@/app/agent-gateway/types";

const PLAN_TTL_MS = 15 * 60_000;
const MAX_PARAMETERS_BYTES = 16 * 1024;

function assertCompatibleNetworkParameters(
  capabilityNetwork: string,
  parameters: Record<string, unknown>,
) {
  if (Object.hasOwn(parameters, "network")) {
    const requested = parameters.network;
    if (typeof requested !== "string" || requested.trim().toLowerCase() !== capabilityNetwork) {
      throw new Error("gateway_network_override_rejected");
    }
  }
  if (Object.hasOwn(parameters, "environment")) {
    const requested = parameters.environment;
    if (typeof requested !== "string" || requested.trim().toLowerCase() !== "testnet") {
      throw new Error("gateway_network_override_rejected");
    }
  }
  if (Object.hasOwn(parameters, "chainId")) {
    const requested = parameters.chainId;
    const normalized = typeof requested === "number"
      ? String(requested)
      : typeof requested === "string"
        ? requested.trim().toLowerCase()
        : "";
    if (!capabilityNetwork.includes("avalanche:fuji") || !["43113", "0xa869"].includes(normalized)) {
      throw new Error("gateway_network_override_rejected");
    }
  }
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(actorId: string, input: GatewayPlanInput) {
  const requirementsSatisfied = [...new Set(
    input.context?.requirementsSatisfied ?? [],
  )].sort();
  return createHash("sha256")
    .update(stable({
      actorId,
      capabilityId: input.capabilityId,
      parameters: input.parameters,
      context: { requirementsSatisfied },
    }))
    .digest("hex");
}

function publicPlan(plan: GatewayPlan) {
  const expired = Date.parse(plan.expiresAt) <= Date.now();
  return expired && plan.status !== "blocked"
    ? { ...plan, status: "expired" as const }
    : plan;
}

export async function createGatewayPlan(
  actorId: string,
  rawInput: unknown,
  store: GatewayStore = getGatewayStore(),
) {
  const input = gatewayPlanInputSchema.parse(rawInput);
  if (Buffer.byteLength(JSON.stringify(input.parameters), "utf8") > MAX_PARAMETERS_BYTES) {
    throw new Error("gateway_parameters_too_large");
  }
  const capability = getGatewayCapability(input.capabilityId);
  assertCompatibleNetworkParameters(capability.network, input.parameters);
  const requestFingerprint = fingerprint(actorId, input);

  const declared = new Set(input.context?.requirementsSatisfied ?? []);
  const blockers = capability.requirements
    .filter((requirement) => requirement !== "privy_session" && !declared.has(requirement));
  if (capability.status === "planned") blockers.unshift("capability_not_available");
  if (capability.operation !== "read") blockers.push("runtime_preflight_required");

  const approvalRequired = capability.approval !== "none";
  const now = Date.now();
  const candidate: GatewayPlan = {
    id: `gwp_${randomUUID()}`,
    apiVersion: GATEWAY_API_VERSION,
    environment: GATEWAY_ENVIRONMENT,
    actorId,
    capabilityId: capability.id,
    status: capability.status === "planned" || blockers.length
      ? "blocked"
      : approvalRequired
        ? "awaiting_approval"
        : "read_only_ready",
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    parameters: input.parameters,
    blockers: [...new Set(blockers)],
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PLAN_TTL_MS).toISOString(),
    safety: {
      nonCustodial: true,
      fundsMoved: false,
      transactionPrepared: false,
      serverSideSigning: false,
      mainnetEnabled: false,
      executionEnabled: false,
    },
    approval: {
      required: approvalRequired,
      method: capability.approval,
      continuationUrl: null,
      reason: approvalRequired
        ? "External agents may plan this action, but the user must continue and approve it inside Carmelita with Privy."
        : null,
    },
  };

  const claimed = await store.claimPlan(candidate);
  return {
    plan: publicPlan(claimed.plan),
    capability,
    replayed: claimed.replayed,
  };
}

export async function readGatewayPlan(
  actorId: string,
  id: string,
  store: GatewayStore = getGatewayStore(),
) {
  const plan = await store.getPlan(actorId, id);
  if (!plan) throw new Error("gateway_plan_not_found");
  return publicPlan(plan);
}

export async function readGatewayReceipt(
  actorId: string,
  planId: string,
  store: GatewayStore = getGatewayStore(),
) {
  const plan = await store.getPlan(actorId, planId);
  if (!plan) throw new Error("gateway_plan_not_found");
  const receipt = await store.getReceipt(actorId, planId);
  return receipt
    ? { available: true as const, receipt }
    : {
        available: false as const,
        planId,
        status: publicPlan(plan).status,
        reason: "No verified execution receipt exists. The v1 gateway never signs or submits transactions server-side.",
      };
}
