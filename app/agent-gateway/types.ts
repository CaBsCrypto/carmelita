import { z } from "zod";

export const GATEWAY_API_VERSION = "2026-08-03" as const;
export const GATEWAY_ENVIRONMENT = "testnet" as const;

export const gatewayCapabilityStatusSchema = z.enum([
  "live",
  "ready_to_test",
  "planned",
]);
export type GatewayCapabilityStatus = z.infer<
  typeof gatewayCapabilityStatusSchema
>;

export const gatewayOperationSchema = z.enum([
  "read",
  "prepare",
  "financial",
  "cross_chain",
]);
export type GatewayOperation = z.infer<typeof gatewayOperationSchema>;

export const gatewayNetworkSchema = z.enum([
  "stellar:testnet",
  "avalanche:fuji",
  "avalanche:fuji+stellar:testnet",
  "offchain:testnet",
]);
export type GatewayNetwork = z.infer<typeof gatewayNetworkSchema>;

export type GatewayCapability = {
  id: string;
  version: typeof GATEWAY_API_VERSION;
  title: string;
  description: string;
  provider: string;
  category: string;
  status: GatewayCapabilityStatus;
  operation: GatewayOperation;
  network: GatewayNetwork;
  approval: "none" | "privy_single" | "privy_dual" | "user_confirmation";
  requiresApproval: boolean;
  requirements: readonly string[];
  evidence: string;
  nextAction: string;
  execution: {
    exposedByGateway: false;
    mode: "read_only" | "prepare_then_approve";
  };
};

export const gatewayPlanInputSchema = z
  .object({
    capabilityId: z.string().trim().min(3).max(120),
    idempotencyKey: z.string().trim().min(8).max(128),
    parameters: z.record(z.string(), z.unknown()).default({}),
    context: z
      .object({
        requirementsSatisfied: z.array(z.string().trim().min(1).max(80)).max(30),
      })
      .strict()
      .optional(),
  })
  .strict();
export type GatewayPlanInput = z.infer<typeof gatewayPlanInputSchema>;

export const gatewayPlanStatusSchema = z.enum([
  "read_only_ready",
  "awaiting_approval",
  "blocked",
  "expired",
]);
export type GatewayPlanStatus = z.infer<typeof gatewayPlanStatusSchema>;

export type GatewayPlan = {
  id: string;
  apiVersion: typeof GATEWAY_API_VERSION;
  environment: typeof GATEWAY_ENVIRONMENT;
  actorId: string;
  capabilityId: string;
  status: GatewayPlanStatus;
  idempotencyKey: string;
  requestFingerprint: string;
  parameters: Record<string, unknown>;
  blockers: string[];
  createdAt: string;
  expiresAt: string;
  safety: {
    nonCustodial: true;
    fundsMoved: false;
    transactionPrepared: false;
    serverSideSigning: false;
    mainnetEnabled: false;
    executionEnabled: false;
  };
  approval: {
    required: boolean;
    method: GatewayCapability["approval"];
    continuationUrl: null;
    reason: string | null;
  };
};

export type GatewayReceipt = {
  id: string;
  planId: string;
  actorId: string;
  capabilityId: string;
  network: GatewayNetwork;
  status: "verified";
  transactionHash: string | null;
  evidence: Record<string, unknown>;
  createdAt: string;
};
