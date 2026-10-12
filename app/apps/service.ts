import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { encryptConnectorSecret, decryptConnectorSecret } from "@/app/connectors/notion-oauth";
import { BAZAAR_CLIENT_SCOPES, createBazaarProvisioner, validateBazaarGrants } from "./bazaar-profile";
import { publicAppDefinition, readRegisteredApp } from "./registry";
import { createSqlAppStore, type AppStore } from "./store";
import type { AppChange, AppChannel, AppDefinition, AppInstallation, BazaarCredential, BazaarEnrollment, BazaarEnrollmentReceipt,
  BazaarProvisioner, OwnApp, PublicAppChange, SecretCodec } from "./types";

const changeInput = z.object({ appId: z.literal("bazaar"), action: z.enum(["add", "remove"]),
  idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/) }).strict();
const confirmationInput = z.object({ changeId: z.string().uuid(), confirmationToken: z.string().regex(/^appc_[A-Za-z0-9_-]{43}$/) }).strict();
const channelSchema = z.enum(["web", "chatgpt"]);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const codec: SecretCodec = { encrypt: encryptConnectorSecret, decrypt: decryptConnectorSecret };
function owner(userId: string) {
  if (!/^did:privy:[^\s]{1,490}$/.test(userId)) throw new Error("app_owner_invalid");
}
function publicDefinition(definition: AppDefinition) {
  // The public view never includes private reviewer identity or evidence URLs.
  return { ...publicAppDefinition(definition), evidence: null };
}
function publicChange({ userId: _owner, tokenHash: _hash, tokenEncrypted: _secret,
  idempotencyKey: _key, expectedGeneration: _generation, ...change }: AppChange): PublicAppChange {
  void [_owner, _hash, _secret, _key, _generation]; return { ...change, definition: publicDefinition(change.definition) };
}
function ownApp(installation: AppInstallation, enrollment: BazaarEnrollment | null): OwnApp {
  const { userId: _owner, changeId: _change, ...app } = installation; void [_owner, _change];
  return { ...app, definition: publicDefinition(app.definition), remoteStatus: enrollment?.status === "active" ? "linked" :
    enrollment?.status === "revocation_pending" ? "revocation_pending" : installation.status === "removed" && (!enrollment || enrollment.status === "revoked") ? "revoked" : "pending" };
}
function managementId(changeId: string, clientId: string, action: string) {
  const hex = digest(`${changeId}:${clientId}:${action}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function safeError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return /^app_[a-z_]{1,80}$/.test(code) ? code : "app_bazaar_unavailable";
}
function sameReceipt(enrollment: BazaarEnrollment, receipt: BazaarEnrollmentReceipt, allowPending = false) {
  if (enrollment.ownerId !== null && (enrollment.ownerId !== receipt.ownerId || enrollment.workspaceId !== receipt.workspaceId ||
    enrollment.agentId !== receipt.agentId || enrollment.generation !== receipt.generation)) throw new Error("app_bazaar_owner_mismatch");
  if (!(allowPending && receipt.grants.length === 0)) validateBazaarGrants(receipt.grants);
}
export function createAppService(deps: { store?: AppStore; codec?: SecretCodec; provisioner?: BazaarProvisioner; now?: () => number } = {}) {
  const store = deps.store ?? createSqlAppStore(), secrets = deps.codec ?? codec;
  const provisioner = deps.provisioner ?? createBazaarProvisioner(), now = deps.now ?? Date.now;
  const timestamp = () => new Date(now()).toISOString();
  async function view(userId: string, installation: AppInstallation | null) {
    return installation ? ownApp(installation, await store.enrollment(userId, installation.appId)) : null;
  }
  function intent(userId: string, installation: AppInstallation): BazaarEnrollment {
    return { userId, appId: "bazaar", creationId: randomUUID(), recoveryCredentialEncrypted: secrets.encrypt(token()),
      webCredentialEncrypted: secrets.encrypt(token()), readCredentialEncrypted: secrets.encrypt(token()),
      ownerId: null, workspaceId: null, agentId: null, grants: [], generation: 1,
      credentialGeneration: installation.generation, managementId: installation.changeId,
      status: "prepared", leaseToken: null, leaseExpiresAt: null, error: null };
  }
  async function resume(userId: string, installation: AppInstallation): Promise<AppInstallation> {
    if (installation.status === "preparing" || installation.status === "error") {
      const current = await readRegisteredApp(installation.appId, store);
      if (current.approval !== "approved" || current.definitionHash !== installation.definition.definitionHash) throw new Error("app_not_approved");
    }
    const leaseToken = randomUUID();
    const claimed = await store.mutate(userId, { operation: "claim", installationId: installation.id,
      generation: installation.generation, intent: intent(userId, installation), leaseToken,
      now: timestamp(), leaseExpiresAt: new Date(now() + 120_000).toISOString() });
    if (!claimed.claimed || !claimed.enrollment) return claimed.installation ?? installation;
    let enrollment = claimed.enrollment;
    async function save() {
      const saved = await store.mutate(userId, { operation: "save", installationId: installation.id,
        generation: installation.generation, leaseToken, enrollment, now: timestamp() });
      if (!saved.claimed) throw new Error("app_installation_changed");
      enrollment = saved.enrollment!; return saved.installation!;
    }
    function accept(receipt: BazaarEnrollmentReceipt, allowPending = false) {
      sameReceipt(enrollment, receipt, allowPending);
      enrollment = { ...enrollment, ownerId: receipt.ownerId, workspaceId: receipt.workspaceId, agentId: receipt.agentId,
        generation: receipt.generation, grants: receipt.grants };
    }
    try {
      if (installation.status === "removed") {
        const recovered = enrollment.ownerId === null
          ? await provisioner.lookup({ recoveryCredential: secrets.decrypt(enrollment.recoveryCredentialEncrypted), creationId: enrollment.creationId })
          : await provisioner.status({ recoveryCredential: secrets.decrypt(enrollment.recoveryCredentialEncrypted), workspaceId: enrollment.workspaceId! });
        if (recovered) {
          accept(recovered, true); enrollment.status = "revocation_pending"; await save();
          if (recovered.grants.length === 0) {
            enrollment = { ...enrollment, leaseToken: null, leaseExpiresAt: null, error: "app_bazaar_recovery_pending" };
            return await save();
          }
          for (const grant of [...enrollment.grants]) {
            if (grant.revoked) continue;
            const revoked = await provisioner.revoke({ recoveryCredential: secrets.decrypt(enrollment.recoveryCredentialEncrypted),
              workspaceId: enrollment.workspaceId!, clientId: grant.clientId,
              changeId: managementId(enrollment.managementId, grant.clientId, "revoke"), expectedRevision: grant.revision });
            if (!revoked.revoked) throw new Error("app_bazaar_response_invalid");
            enrollment.grants = enrollment.grants.map(item => item.clientId === revoked.clientId ? revoked : item); await save();
          }
        } else if (enrollment.credentialGeneration < installation.generation) {
          // A previous enrollment request may still finish after this lookup.
          // Local access is removed now; remote absence is not a cancellation.
          enrollment = { ...enrollment, status: "revocation_pending", leaseToken: null, leaseExpiresAt: null,
            error: "app_bazaar_recovery_pending" };
          return await save();
        }
        enrollment = { ...enrollment, status: "revoked", leaseToken: null, leaseExpiresAt: null, error: null };
        return await save();
      }
      if (enrollment.ownerId === null || enrollment.grants.length === 0) {
        accept(await provisioner.enroll({ creationId: enrollment.creationId, recoveryCredential: secrets.decrypt(enrollment.recoveryCredentialEncrypted),
          webCredential: secrets.decrypt(enrollment.webCredentialEncrypted), readCredential: secrets.decrypt(enrollment.readCredentialEncrypted), generation: enrollment.generation }));
      } else {
        accept(await provisioner.status({ recoveryCredential: secrets.decrypt(enrollment.recoveryCredentialEncrypted), workspaceId: enrollment.workspaceId! }));
      }
      if (enrollment.credentialGeneration !== installation.generation) {
        enrollment = { ...enrollment, webCredentialEncrypted: secrets.encrypt(token()), readCredentialEncrypted: secrets.encrypt(token()),
          credentialGeneration: installation.generation, managementId: installation.changeId };
      }
      // Receipt and any replacement credentials are persisted before rotation.
      await save();
      for (const clientId of ["carmelita-web", "carmelita-chatgpt"] as const) {
        let grant = enrollment.grants.find(item => item.clientId === clientId)!;
        const credential = secrets.decrypt(clientId === "carmelita-web" ? enrollment.webCredentialEncrypted : enrollment.readCredentialEncrypted);
        let needsRotation = grant.revoked;
        if (!needsRotation) {
          try {
            const identity = await provisioner.identity({ credential, channel: clientId === "carmelita-web" ? "web" : "chatgpt" });
            sameReceipt(enrollment, { ...identity, grants: enrollment.grants });
            validateBazaarGrants(enrollment.grants.map(item => item.clientId === clientId ? identity.grant : item));
            if (identity.grant.grantId !== grant.grantId || identity.grant.revision !== grant.revision || identity.grant.revoked) throw new Error("app_bazaar_owner_mismatch");
          } catch (error) {
            if (!(error instanceof Error) || error.message !== "app_bazaar_not_authorized") throw error;
            needsRotation = true;
          }
        }
        if (needsRotation) {
          grant = await provisioner.rotate({ recoveryCredential: secrets.decrypt(enrollment.recoveryCredentialEncrypted), workspaceId: enrollment.workspaceId!,
            clientId, changeId: managementId(enrollment.managementId, clientId, "rotate"), expectedRevision: grant.revision, accessHash: digest(credential) });
          if (grant.revoked || grant.clientId !== clientId) throw new Error("app_bazaar_response_invalid");
          enrollment.grants = enrollment.grants.map(item => item.clientId === clientId ? grant : item); await save();
        }
      }
      validateBazaarGrants(enrollment.grants);
      enrollment = { ...enrollment, status: "active", leaseToken: null, leaseExpiresAt: null, error: null };
      return await save();
    } catch (error) {
      const result = await store.mutate(userId, { operation: "fail", installationId: installation.id,
        generation: installation.generation, leaseToken, error: safeError(error), now: timestamp() });
      if (safeError(error) === "app_installation_changed" && result.installation?.status === "removed") {
        // A human already confirmed removal while the enrollment awaited its
        // receipt. Compensate that late completion against the current removal.
        return resume(userId, result.installation);
      }
      return result.installation ?? installation;
    }
  }
  async function assertActive(userId: string, appId: string) {
    owner(userId); const definition = await readRegisteredApp(appId, store), installation = await store.installation(userId, appId);
    if (definition.approval !== "approved") throw new Error("app_not_approved");
    if (!installation || installation.status !== "active" || installation.definition.definitionHash !== definition.definitionHash) throw new Error("app_installation_required");
    return installation;
  }
  return {
    async listAvailableApps() { return { apps: [publicAppDefinition(await readRegisteredApp("bazaar", store))] }; },
    async listOwnApps(userId: string) { owner(userId); return { apps: await Promise.all((await store.installations(userId)).map(async app => (await view(userId, app))!)) }; },
    async prepareAppChange(userId: string, input: z.input<typeof changeInput>, channel: AppChannel) {
      owner(userId); channelSchema.parse(channel); const parsed = changeInput.parse(input);
      const definition = await readRegisteredApp(parsed.appId, store), installation = await store.installation(userId, parsed.appId);
      if (parsed.action === "add" && definition.approval !== "approved") throw new Error("app_not_approved");
      if (parsed.action === "remove" && !installation) throw new Error("app_installation_required");
      const confirmationToken = `appc_${token()}`;
      const change: AppChange = { id: randomUUID(), userId, ...parsed, channel, definition: parsed.action === "remove" ? installation!.definition : definition,
        expectedGeneration: installation?.generation ?? 0, status: "prepared", tokenHash: digest(confirmationToken),
        tokenEncrypted: secrets.encrypt(confirmationToken), createdAt: timestamp(), expiresAt: new Date(now() + 600_000).toISOString() };
      const saved = (await store.mutate(userId, { operation: "prepare", change })).change!;
      if (saved.appId !== change.appId || saved.action !== change.action || saved.channel !== channel || saved.definition.definitionHash !== change.definition.definitionHash) throw new Error("app_idempotency_conflict");
      return { change: publicChange(saved), confirmationToken: secrets.decrypt(saved.tokenEncrypted) };
    },
    async confirmAppChange(userId: string, input: z.input<typeof confirmationInput>, channel: AppChannel) {
      owner(userId); channelSchema.parse(channel); const parsed = confirmationInput.parse(input);
      const result = await store.mutate(userId, { operation: "confirm", changeId: parsed.changeId, channel, tokenHash: digest(parsed.confirmationToken), now: timestamp() });
      let installation = result.installation ?? null;
      if (installation && installation.changeId === parsed.changeId && (installation.status === "preparing" || installation.status === "removed")) installation = await resume(userId, installation);
      return { change: publicChange(result.change!), app: await view(userId, installation) };
    },
    async cancelAppChange(userId: string, input: { changeId: string }, channel: AppChannel) {
      owner(userId); channelSchema.parse(channel); z.string().uuid().parse(input.changeId);
      const result = await store.mutate(userId, { operation: "cancel", changeId: input.changeId, channel });
      return { change: publicChange(result.change!) };
    },
    async retryAppConnection(userId: string, appId: "bazaar") {
      owner(userId); if (appId !== "bazaar") throw new Error("app_not_registered");
      const installation = await store.installation(userId, appId); if (!installation) throw new Error("app_installation_required");
      if (installation.status === "active") throw new Error("app_already_active");
      const enrollment = await store.enrollment(userId, appId);
      if (installation.status === "removed" && enrollment?.status !== "revocation_pending") throw new Error("app_retry_not_needed");
      return { app: await view(userId, await resume(userId, installation)) };
    },
    assertOwnAppActive: assertActive,
    async readOwnBazaarCredential(userId: string, channel: AppChannel = "chatgpt"): Promise<BazaarCredential> {
      channelSchema.parse(channel); const installation = await assertActive(userId, "bazaar"), enrollment = await store.enrollment(userId, "bazaar");
      if (!enrollment || enrollment.status !== "active" || !enrollment.ownerId || !enrollment.workspaceId || !enrollment.agentId || enrollment.credentialGeneration !== installation.generation) throw new Error("app_installation_required");
      const clientId = channel === "web" ? "carmelita-web" : "carmelita-chatgpt";
      const grant = enrollment.grants.find(item => item.clientId === clientId); if (!grant || grant.revoked) throw new Error("app_installation_required");
      validateBazaarGrants(enrollment.grants);
      const credential = secrets.decrypt(channel === "web" ? enrollment.webCredentialEncrypted : enrollment.readCredentialEncrypted);
      const verified = await provisioner.identity({ credential, channel });
      sameReceipt(enrollment, { ...verified, grants: enrollment.grants });
      if (verified.grant.clientId !== clientId || verified.grant.grantId !== grant.grantId || verified.grant.revision !== grant.revision || verified.grant.revoked ||
        verified.grant.scopes.length !== BAZAAR_CLIENT_SCOPES[clientId].length || new Set(verified.grant.scopes).size !== BAZAAR_CLIENT_SCOPES[clientId].length || verified.grant.scopes.some(scope => !(BAZAAR_CLIENT_SCOPES[clientId] as readonly string[]).includes(scope))) throw new Error("app_bazaar_scope_invalid");
      // Recheck after the remote await so removing an app blocks new consumers immediately.
      const current = await assertActive(userId, "bazaar"); if (current.generation !== installation.generation) throw new Error("app_installation_changed");
      return { ownerId: enrollment.ownerId, workspaceId: enrollment.workspaceId, agentId: enrollment.agentId, generation: enrollment.generation,
        clientId, grantId: grant.grantId, grantRevision: grant.revision, scopes: [...grant.scopes], credential, channel };
    },
  };
}
const defaultService = createAppService();
export const listAvailableApps = defaultService.listAvailableApps;
export const listOwnApps = defaultService.listOwnApps;
export const prepareAppChange = defaultService.prepareAppChange;
export const confirmAppChange = defaultService.confirmAppChange;
export const cancelAppChange = defaultService.cancelAppChange;
export const retryAppConnection = defaultService.retryAppConnection;
export const assertOwnAppActive = defaultService.assertOwnAppActive;
export const readOwnBazaarCredential = defaultService.readOwnBazaarCredential;
