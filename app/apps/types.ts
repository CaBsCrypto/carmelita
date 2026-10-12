export type AppChannel = "web" | "chatgpt";
export type AppAction = "add" | "remove";
export type AppApprovalStatus = "awaiting_review" | "approved" | "suspended";
export type AppPermission = "catalog:read" | "consumption:read";

/** Reviewed code adapters only. A submitted URL or skill cannot define an adapter. */
export type AppDefinition = {
  id: "bazaar";
  name: string;
  version: string;
  adapter: "bazaar-v1";
  description: string;
  permissions: AppPermission[];
  definitionHash: string;
  approval: AppApprovalStatus;
  approvalRevision: number;
  evidence: string | null;
};
export type AppInstallation = {
  id: string;
  userId: string;
  appId: string;
  definition: AppDefinition;
  status: "preparing" | "active" | "removed" | "error";
  generation: number;
  changeId: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
export type OwnApp = Omit<AppInstallation, "userId" | "changeId"> & {
  remoteStatus: "pending" | "linked" | "revocation_pending" | "revoked";
};
export type AppChange = {
  id: string;
  userId: string;
  appId: string;
  action: AppAction;
  channel: AppChannel;
  idempotencyKey: string;
  definition: AppDefinition;
  expectedGeneration: number;
  status: "prepared" | "confirmed" | "cancelled";
  tokenHash: string;
  tokenEncrypted: string;
  createdAt: string;
  expiresAt: string;
};
export type PublicAppChange = Omit<AppChange, "userId" | "idempotencyKey" | "tokenHash" | "tokenEncrypted" | "expectedGeneration">;
export type BazaarEnrollment = {
  userId: string;
  appId: "bazaar";
  creationId: string;
  recoveryCredentialEncrypted: string;
  webCredentialEncrypted: string;
  readCredentialEncrypted: string;
  ownerId: string | null;
  workspaceId: string | null;
  agentId: string | null;
  grants: BazaarGrant[];
  generation: number;
  credentialGeneration: number;
  managementId: string;
  status: "prepared" | "active" | "revocation_pending" | "revoked" | "error";
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  error: string | null;
};
export type BazaarEnrollmentIntent = {
  creationId: string;
  recoveryCredential: string;
  webCredential: string;
  readCredential: string;
  generation: number;
};
export type BazaarGrant = {
  clientId: "carmelita-web" | "carmelita-chatgpt";
  grantId: string;
  revision: number;
  scopes: string[];
  revoked: boolean;
};
export type BazaarEnrollmentReceipt = {
  ownerId: string;
  workspaceId: string;
  agentId: string;
  generation: number;
  grants: BazaarGrant[];
};
export type BazaarCredential = Omit<BazaarEnrollmentReceipt, "grants"> & {
  credential: string; channel: AppChannel; clientId: BazaarGrant["clientId"]; grantId: string;
  grantRevision: number; scopes: string[];
};
export interface BazaarProvisioner {
  enroll(intent: BazaarEnrollmentIntent): Promise<BazaarEnrollmentReceipt>;
  lookup(input: { recoveryCredential: string; creationId: string }): Promise<BazaarEnrollmentReceipt | null>;
  status(input: { recoveryCredential: string; workspaceId: string }): Promise<BazaarEnrollmentReceipt>;
  revoke(input: { recoveryCredential: string; workspaceId: string; clientId: BazaarGrant["clientId"]; changeId: string; expectedRevision: number }): Promise<BazaarGrant>;
  rotate(input: { recoveryCredential: string; workspaceId: string; clientId: BazaarGrant["clientId"]; changeId: string; expectedRevision: number; accessHash: string }): Promise<BazaarGrant>;
  identity(input: { credential: string; channel: AppChannel }): Promise<Omit<BazaarEnrollmentReceipt, "grants"> & { grant: BazaarGrant }>;
}
export interface SecretCodec { encrypt(value: string): string; decrypt(value: string): string }
