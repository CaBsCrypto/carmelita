import { createHash } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, Operation, Transaction, TransactionBuilder, authorizeEntry, hash, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { Api, parseRawSimulation } from "@stellar/stellar-sdk/rpc";
import { x402AuthEntryDigest } from "@/app/x402/privy-signer";
import { requiredPrivyCredentials } from "@/app/privy-client";

const operationId = "ed6c4530-e76f-49e0-8f39-5ec8578820e2";
const payer = "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ";
export const pilotCanonical = (value: unknown): string => Array.isArray(value) ? "[" + value.map(pilotCanonical).join(",") + "]"
  : value && typeof value === "object" ? "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + pilotCanonical((value as Record<string, unknown>)[key])).join(",") + "}" : JSON.stringify(value);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export type PilotDispatchGate = { assertFreshAction(): void; expiresAt: number; signal: AbortSignal };
export type PilotSignerDependencies = { credentials?: () => { appId: string; appSecret: string }; fetcher?: typeof fetch; now?: () => number; timeoutMs?: number };
type Input = { userId: string; accessToken: string; walletId: string; address: string; paymentId: string };
function fail(code: string): never { throw Error(code); }
function fresh(gate: PilotDispatchGate, now: () => number) {
  if (!gate || typeof gate.assertFreshAction !== "function" || typeof gate.signal?.aborted !== "boolean" || gate.signal.aborted) fail("pilot_dispatch_aborted");
  const time = now();
  if (!Number.isFinite(time) || !Number.isFinite(gate.expiresAt) || gate.expiresAt <= time || gate.expiresAt > time + 120000) fail("pilot_dispatch_approval_expired");
  if (gate.assertFreshAction() !== undefined) fail("pilot_dispatch_guard_must_be_synchronous");
}
/** Finite dedicated SDK client. Exported for transport verification only; this
 * server function is not exposed through a route/MCP. Every permitted request
 * is guarded after the SDK's async JWT/header preparation and before fetch.
 * No wallet create/import/export, arbitrary raw_sign, redirect or retry route.
 */
export function createPilotPrivyClient(input: Input, digest: string, idempotencyKey: string, gate: PilotDispatchGate, dependencies: PilotSignerDependencies = {}) {
  const now = dependencies.now ?? Date.now, fetcher = dependencies.fetcher ?? globalThis.fetch, timeoutMs = dependencies.timeoutMs ?? 5000;
  if (input.paymentId !== operationId || input.address !== payer || !/^did:privy:.+/.test(input.userId) || !/^[A-Za-z0-9_-]{1,200}$/.test(input.walletId) || !input.accessToken || !/^0x[a-f0-9]{64}$/.test(digest) || !new RegExp("^" + operationId + ":auth:[a-f0-9]{32}$").test(idempotencyKey) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) fail("pilot_dispatch_configuration_invalid");
  fresh(gate, now);
  // The SDK otherwise merges these ambient custom headers into all requests.
  if (process.env.PRIVY_API_CUSTOM_HEADERS) fail("pilot_ambient_custom_headers_denied");
  const { appId, appSecret } = (dependencies.credentials ?? requiredPrivyCredentials)();
  let rawDispatched = false, authDispatched = false, listDispatched = false, stopped = false;
  const guardedFetch: typeof fetch = async (target, init) => {
    if (stopped) fail("pilot_dispatch_stopped_no_retry");
    fresh(gate, now);
    const url = new URL(String(target)), method = (init?.method ?? "GET").toUpperCase();
    if (url.origin !== "https://api.privy.io" || url.username || url.password || url.hash) fail("pilot_dispatch_target_denied");
    const headers = new Headers(init?.headers), body = typeof init?.body === "string" ? init.body : "";
    let parsed: Record<string, unknown> = {}; if (body) { if (body.length > 32768) fail("pilot_dispatch_target_denied"); try { parsed = JSON.parse(body); } catch { fail("pilot_dispatch_target_denied"); } }
    const raw = url.pathname === "/v1/wallets/" + input.walletId + "/raw_sign" && method === "POST" && !url.search;
    if (raw) {
      if (rawDispatched || JSON.stringify(parsed) !== JSON.stringify({ params: { hash: digest } }) || headers.get("privy-idempotency-key") !== idempotencyKey || headers.get("privy-request-expiry") !== String(gate.expiresAt)) fail("pilot_raw_sign_scope_or_replay_denied");
    } else if (method === "GET" && url.pathname === "/v1/wallets") {
      if (listDispatched || [...url.searchParams.keys()].some(key => !["user_id", "chain_type", "limit"].includes(key) || url.searchParams.getAll(key).length !== 1) || url.searchParams.get("user_id") !== input.userId || url.searchParams.get("chain_type") !== "stellar" || url.searchParams.get("limit") !== "100") fail("pilot_wallet_list_scope_denied");
    } else if (method === "POST" && url.pathname === "/v1/wallets/authenticate" && !url.search) {
      if (authDispatched || parsed.user_jwt !== input.accessToken || parsed.encryption_type !== "HPKE" || typeof parsed.recipient_public_key !== "string" || Object.keys(parsed).some(key => !["user_jwt", "encryption_type", "recipient_public_key"].includes(key))) fail("pilot_jwt_exchange_scope_denied");
    } else fail("pilot_dispatch_target_denied");
    if (init?.signal?.aborted) fail("pilot_dispatch_aborted");
    const controller = new AbortController(), duration = Math.min(timeoutMs, gate.expiresAt - now());
    if (duration <= 0) fail("pilot_dispatch_approval_expired");
    const signals = [controller.signal, gate.signal]; if (init?.signal) signals.push(init.signal);
    const signal = AbortSignal.any(signals);
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error("pilot_dispatch_timeout_unconfirmed")); }, duration); });
    try {
      // There is no await between this final guard, the local one-use marker,
      // and calling the actual transport. SDK auth/header awaits are upstream.
      fresh(gate, now); if (signal.aborted) fail("pilot_dispatch_aborted");
      if (raw) rawDispatched = true; else if (method === "GET") listDispatched = true; else authDispatched = true;
      const response = await Promise.race([(async () => {
        const result = await fetcher(target, { ...init, signal, redirect: "error", credentials: "omit", cache: "no-store" });
        if (result.redirected || result.status >= 300 && result.status < 400 || result.url && new URL(result.url).origin !== "https://api.privy.io") fail("pilot_dispatch_redirect_denied");
        const reader = result.body?.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
        try { if (reader) for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 65536) fail("pilot_dispatch_response_too_large"); chunks.push(part.value); } }
        finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
        return new Response(Buffer.concat(chunks), { status: result.status, headers: result.headers });
      })(), deadline]);
      if (signal.aborted || now() >= gate.expiresAt) fail("pilot_dispatch_unconfirmed");
      return response;
    } catch { stopped = true; fail("pilot_dispatch_unconfirmed_no_retry"); }
    finally { clearTimeout(timer!); }
  };
  return new PrivyClient({ appId, appSecret, apiUrl: "https://api.privy.io", maxRetries: 0, timeout: timeoutMs, logLevel: "off", logger: { debug() {}, info() {}, warn() {}, error() {} }, authorizationKeyCacheMaxCapacity: 1, fetch: guardedFetch });
}
/** Existing verified owner/session and exact host preimage are prerequisites.
 * Dedicated pilot callback leaves the global signer/client and demo untouched. */
export function createPilotPrivySigner(input: Input, dependencies: PilotSignerDependencies = {}) {
  let attempted = false;
  return { address: payer, async signAuthEntry(authEntry: string, options: { address?: string; networkPassphrase?: string }, gate: PilotDispatchGate) {
    if (attempted) fail("pilot_signer_stopped_no_retry"); attempted = true;
    if (options?.address !== payer || options.networkPassphrase !== Networks.TESTNET || typeof authEntry !== "string" || authEntry.length > 32768 || Buffer.from(authEntry, "base64").toString("base64") !== authEntry) fail("pilot_testnet_preimage_required");
    const digest = "0x" + Buffer.from(x402AuthEntryDigest(authEntry)).toString("hex"), idempotencyKey = operationId + ":auth:" + createHash("sha256").update(authEntry).digest("hex").slice(0, 32);
    const client = createPilotPrivyClient(input, digest, idempotencyKey, gate, dependencies);
    const page = await client.wallets().list({ user_id: input.userId, chain_type: "stellar", limit: 100 });
    let owned = 0; for await (const wallet of page) if (wallet.id === input.walletId && wallet.address === payer && wallet.chain_type === "stellar") owned++;
    if (owned !== 1) fail("pilot_wallet_not_owned");
    fresh(gate, dependencies.now ?? Date.now);
    let result;
    try { result = await client.wallets().rawSign(input.walletId, { params: { hash: digest }, authorization_context: { user_jwts: [input.accessToken] }, idempotency_key: idempotencyKey, request_expiry: gate.expiresAt }); }
    catch { fail("pilot_signature_unconfirmed_no_retry"); }
    if (!/^(?:0x)?[a-fA-F0-9]{128}$/.test(result.signature ?? "")) fail("pilot_signature_unconfirmed_no_retry");
    const signature = Buffer.from(result.signature.replace(/^0x/, ""), "hex");
    if (!Keypair.fromPublicKey(payer).verify(Buffer.from(digest.slice(2), "hex"), signature)) fail("pilot_signature_unconfirmed_no_retry");
    return { signedAuthEntry: signature.toString("base64"), signerAddress: payer };
  } };
}

import { existingBazaarConnectionStore } from "./native-connection-store";

type Wallet = { id: string; userId: string; address: string; chainType: string; network: string; status: string };
type Binding = { userId: string; ownerId: string; workspaceId: string; agentId: string; generation: number; agentSecretReference: string };
type Dependencies = {
  verifyUser(token: string): Promise<string>;
  persistedWallets(userId: string): Promise<Wallet[]>;
  ownedWallets(userId: string): Promise<Array<{ id: string; address: string; chainType: string }>>;
  bindingForUser(userId: string): Promise<Binding | null>;
  agentSecretForUser(userId: string, reference: string): Promise<{ userId: string; ownerId: string; agentAccess: string }>;
};
const defaults: Dependencies = {
  async verifyUser(token) { const { verifyPrivyAccessToken } = await import("@/app/privy-stellar"); return (await verifyPrivyAccessToken(token)).user_id; },
  async persistedWallets(userId) { const { listPersistedUserWallets } = await import("@/app/multichain-account"); return listPersistedUserWallets(userId); },
  async ownedWallets(userId) {
    const { getPrivyClient } = await import("@/app/privy-client");
    const page = await getPrivyClient().wallets().list({ user_id: userId, chain_type: "stellar", limit: 100 });
    const wallets = []; for await (const wallet of page) { if (wallets.length >= 100) throw Error("pilot_wallet_page_limit"); wallets.push({ id: wallet.id, address: wallet.address, chainType: wallet.chain_type }); }
    return wallets;
  },
  bindingForUser: userId => existingBazaarConnectionStore().bindingForUser(userId),
  agentSecretForUser: (userId, reference) => existingBazaarConnectionStore().agentSecretForUser(userId, reference),
};
/** Server-only bridge for a separately authorized owner-controlled client. This
 * is not a route or MCP tool. Caller must obtain an existing user's genuine Privy
 * JWT through their application; connector OAuth/PAT is not signing authority.
 * Dependencies are trusted server test seams, never values supplied by agents.
 */
export async function existingCarmelitaPilotOwner(input: { accessToken: string; walletId: string }, deps: Dependencies = defaults, signerDependencies?: PilotSignerDependencies) {
  if (!input.accessToken?.trim() || input.accessToken.length > 8192 || !input.walletId?.trim() || input.walletId.length > 200) throw Error("pilot_owner_session_required");
  const { accessToken, walletId } = input;
  const userId = await deps.verifyUser(accessToken);
  if (!/^did:privy:.+/.test(userId)) throw Error("pilot_owner_session_required");
  let pinned: Binding | undefined, agentToken: string | undefined;
  async function assertCurrent() {
    if (await deps.verifyUser(accessToken) !== userId) throw Error("pilot_owner_changed");
    const persisted = (await deps.persistedWallets(userId)).filter(wallet => wallet.id === walletId && wallet.userId === userId && wallet.address === payer && wallet.chainType === "stellar" && wallet.network === "stellar:testnet" && wallet.status === "active");
    if (persisted.length !== 1) throw Error("pilot_existing_wallet_required");
    const owned = (await deps.ownedWallets(userId)).filter(wallet => wallet.id === walletId && wallet.address === payer && wallet.chainType === "stellar");
    if (owned.length !== 1) throw Error("pilot_wallet_not_owned");
    const binding = await deps.bindingForUser(userId);
    if (!binding || binding.userId !== userId || !/^ow_[a-f0-9]{32}$/.test(binding.ownerId) || !binding.workspaceId || !binding.agentId || !Number.isSafeInteger(binding.generation) || binding.generation < 1) throw Error("pilot_existing_agent_link_required");
    if (pinned && JSON.stringify(binding) !== JSON.stringify(pinned)) throw Error("pilot_agent_link_changed");
    const secret = await deps.agentSecretForUser(userId, binding.agentSecretReference);
    if (secret.userId !== userId || secret.ownerId !== binding.ownerId || !/^[A-Za-z0-9_-]{43}$/.test(secret.agentAccess) || agentToken && secret.agentAccess !== agentToken) throw Error("pilot_agent_link_changed");
    if (!pinned) { pinned = { ...binding }; agentToken = secret.agentAccess; }
  }
  await assertCurrent();
  const binding = pinned!;
  // Dedicated pilot adapter repeats ownership using a no-retry client; its
  // transport checks the trusted owner gate after SDK header preparation.
  const signer = createPilotPrivySigner({ userId, accessToken, walletId, address: payer, paymentId: operationId }, signerDependencies);
  return Object.freeze({ dispatchGuardSupported: true as const, userId, walletId, address: payer, agentToken: agentToken!, connectionReferenceHash: sha(binding.agentSecretReference),
    identity: Object.freeze({ role: "agent", network: "stellar:testnet", ownerId: binding.ownerId, workspaceId: binding.workspaceId, agentId: binding.agentId, generation: binding.generation }),
    assertCurrent,
    async signAuthEntry(authEntry: string, options: { address?: string; networkPassphrase?: string }, dispatch: PilotDispatchGate) {
      if (options?.address !== payer || options.networkPassphrase !== Networks.TESTNET) throw Error("pilot_testnet_signer_options_required");
      await assertCurrent();
      return signer.signAuthEntry(authEntry, { address: payer, networkPassphrase: Networks.TESTNET }, dispatch);
    },
  });
}

// Immutable reviewed new-pilot intent; client input never supplies these terms.
export const PILOT_TERMS = {
  "version": 1,
  "origin": "https://bazaar.browns.studio",
  "operationId": "ed6c4530-e76f-49e0-8f39-5ec8578820e2",
  "card": {
    "skill": {
      "version": "1",
      "title": "Guion breve de prueba",
      "instructions": "Servicio exclusivamente Stellar Testnet. topic: texto de 1 a 200 caracteres; tone: texto de 1 a 40 caracteres; durationSeconds: entero entre 15 y 30. Crear una orden, pagar mediante HTTP x402 con firma local y consultar el mismo UUID hasta recibir el texto. No repetir el pago o la ejecución para recuperar una respuesta perdida. El proveedor usa un algoritmo, no ejecuta código del comprador y la entrega privada vence a los siete días."
    },
    "version": "bazaar.service-card/v0",
    "id": "guionista-bazaar-production-text-v1",
    "name": "Guion breve algorítmico",
    "description": "Guion breve de texto generado de forma algorítmica para probar compras y entrega privada en Stellar Testnet.",
    "kind": "http",
    "url": "https://ai-video-scriptwriter.vercel.app",
    "routeTemplate": "/v1/marketplace-text",
    "input": [
      {
        "name": "topic",
        "type": "string",
        "required": true
      },
      {
        "name": "tone",
        "type": "string",
        "required": true
      },
      {
        "name": "durationSeconds",
        "type": "number",
        "required": true
      }
    ],
    "network": "stellar:testnet",
    "payment": {
      "scheme": "exact",
      "asset": "USDC",
      "amount": "0.01",
      "destination": "GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C",
      "identity": {
        "kind": "stellar-classic-credit",
        "network": "stellar:testnet",
        "code": "USDC",
        "issuer": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        "sacContract": "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
      },
      "marketplace": {
        "protocol": "x402-stellar-exact-v2",
        "resourceTemplate": "/api/market/orders/{operationId}/x402"
      }
    },
    "provider": {
      "name": "Guionista Bazaar"
    },
    "tags": [
      "text",
      "script",
      "x402",
      "testnet"
    ],
    "delivery": {
      "mode": "async",
      "estimatedDurationMs": 1000,
      "result": {
        "schemaVersion": "seller-text/v1",
        "contentType": "text/plain",
        "terminalStatuses": [
          "delivered",
          "delivery-failed"
        ],
        "hash": {
          "algorithm": "sha256",
          "required": true,
          "scope": "canonical-result"
        }
      },
      "status": {
        "required": true,
        "urlTemplate": "/api/market/orders/{operationId}",
        "pollAfterMs": 60000
      },
      "callback": {
        "supported": false,
        "required": false,
        "authentication": "none"
      },
      "retention": {
        "resultTtlHours": 168,
        "durable": true
      },
      "idempotency": {
        "required": true,
        "key": "Idempotency-Key",
        "replay": "return-original"
      },
      "retry": {
        "retryable": false,
        "maxAttempts": 1,
        "failureSemantics": "terminal-error"
      }
    }
  },
  "cardHash": "fa0890b56563deb08a983fb6e75d020a6105babc0b4bd3a6b834f4468897cefc",
  "input": {
    "topic": "Validar el flujo de un agente que compra un servicio en Bazaar",
    "tone": "claro",
    "durationSeconds": 15
  },
  "inputHash": "7b976102d720675644bfe2a5ae2768afd59d5399f9965fc88067af259898bce1",
  "payer": "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ",
  "maxAtomic": "100000",
  "paymentProtocol": "x402-stellar-exact-v2",
  "phase": "prepared",
  "createdAt": "2026-10-18T06:14:09.266Z"
} as const;
export type PilotChallenge = { x402Version: number; resource: { url: string; mimeType: string }; accepts: Array<{
  scheme: string; network: string; asset: string; amount: string; payTo: string; maxTimeoutSeconds: number;
  extra: { areFeesSponsored: boolean; resourceUrl: string; route: string; method: string; operationId: string; cardHash: string; inputHash: string }
}> };
export type PreparedPilot = { unsignedTransaction: string; expirationLedger: number; authEntry: string; challenge: PilotChallenge };
export const PILOT_RESOURCE = "https://bazaar.browns.studio/api/market/orders/" + operationId + "/x402";
export const PILOT_SPONSORED_FEE_LIMIT = BigInt(1000000);
export function assertPilotTerms() {
  const immutable = Object.fromEntries(["version","origin","operationId","card","cardHash","input","inputHash","payer","maxAtomic","paymentProtocol","createdAt"].map(key => [key, PILOT_TERMS[key as keyof typeof PILOT_TERMS]]));
  if (sha(pilotCanonical({ ...immutable, phase: "prepared" })) !== "668880738c6be6fde10b371a47c26c7474cc02dde964a1329116b6e15f88c6c5") fail("pilot_terms_changed");
}
export function assertPilotChallenge(value: unknown): PilotChallenge {
  assertPilotTerms(); const challenge = value as PilotChallenge, r = challenge?.accepts?.[0];
  if (challenge?.x402Version !== 2 || challenge.accepts?.length !== 1 || challenge.resource?.url !== PILOT_RESOURCE
    || challenge.resource.mimeType !== "application/json" || r?.scheme !== "exact" || r.network !== "stellar:testnet"
    || r.asset !== PILOT_TERMS.card.payment.identity.sacContract || r.amount !== "100000" || r.payTo !== PILOT_TERMS.card.payment.destination
    || !Number.isInteger(r.maxTimeoutSeconds) || r.maxTimeoutSeconds < 1 || r.maxTimeoutSeconds > 300 || r.extra?.areFeesSponsored !== true
    || r.extra.resourceUrl !== PILOT_RESOURCE || r.extra.route !== new URL(PILOT_RESOURCE).pathname || r.extra.method !== "POST"
    || r.extra.operationId !== operationId || r.extra.cardHash !== PILOT_TERMS.cardHash || r.extra.inputHash !== PILOT_TERMS.inputHash) fail("pilot_challenge_changed");
  return challenge;
}
function transfer(call: xdr.InvokeContractArgs) {
  if (Address.fromScAddress(call.contractAddress()).toString() !== PILOT_TERMS.card.payment.identity.sacContract
    || call.functionName().toString() !== "transfer" || call.args().length !== 3 || scValToNative(call.args()[0]) !== payer
    || scValToNative(call.args()[1]) !== PILOT_TERMS.card.payment.destination || scValToNative(call.args()[2]) !== BigInt(100000)) fail("pilot_transfer_changed");
}
/** Validate transaction AND signed Soroban preimage, not wrapper metadata. */
export function assertPilotPreimage(prepared: PreparedPilot) {
  assertPilotChallenge(prepared.challenge);
  if (!Number.isSafeInteger(prepared.expirationLedger) || prepared.expirationLedger < 1 || typeof prepared.authEntry !== "string"
    || prepared.authEntry.length > 32768 || prepared.unsignedTransaction.length > 65536) fail("pilot_preimage_invalid");
  const tx = new Transaction(prepared.unsignedTransaction, Networks.TESTNET), op = tx.operations[0];
  if (tx.source !== "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" || tx.signatures.length || tx.operations.length !== 1
    || BigInt(tx.fee) > PILOT_SPONSORED_FEE_LIMIT || op.type !== "invokeHostFunction" || op.source || op.func.switch().name !== "hostFunctionTypeInvokeContract"
    || op.auth?.length !== 1) fail("pilot_transaction_invalid");
  transfer(op.func.invokeContract()); const entry = op.auth[0];
  if (entry.rootInvocation().subInvocations().length || entry.rootInvocation().function().switch().name !== "sorobanAuthorizedFunctionTypeContractFn") fail("pilot_invocation_invalid");
  transfer(entry.rootInvocation().function().contractFn());
  if (entry.credentials().switch().name !== "sorobanCredentialsAddress") fail("pilot_signer_invalid");
  const credentials = entry.credentials().address();
  if (Address.fromScAddress(credentials.address()).toString() !== payer || credentials.signature().switch().name !== "scvVoid"
    || credentials.signatureExpirationLedger() !== 0) fail("pilot_signer_invalid");
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({
    networkId: hash(Buffer.from(Networks.TESTNET)), nonce: credentials.nonce(), invocation: entry.rootInvocation(), signatureExpirationLedger: prepared.expirationLedger }));
  if (preimage.toXDR("base64") !== prepared.authEntry) fail("pilot_preimage_changed");
  return sha(prepared.authEntry);
}
/** Only two unsigned simulation RPCs supplied by the fixed server controller. */
export async function preparePilotUnsigned(challenge: PilotChallenge, rpc: (method: "getLatestLedger" | "simulateTransaction", params: Record<string, unknown>) => Promise<unknown>): Promise<PreparedPilot> {
  const requirements = assertPilotChallenge(challenge).accepts[0], latest = await rpc("getLatestLedger", {}) as { sequence: number };
  if (!Number.isSafeInteger(latest.sequence) || latest.sequence < 1 || latest.sequence > 0xffffffff - 60) fail("pilot_ledger_invalid");
  const expirationLedger = latest.sequence + Math.ceil(requirements.maxTimeoutSeconds / 5);
  const raw = new TransactionBuilder(new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .setTimeout(requirements.maxTimeoutSeconds).addOperation(new Contract(requirements.asset).call("transfer", nativeToScVal(payer,{type:"address"}),
      nativeToScVal(requirements.payTo,{type:"address"}), nativeToScVal(requirements.amount,{type:"i128"}))).build();
  const simulation = parseRawSimulation(await rpc("simulateTransaction", { transaction: raw.toXDR() }) as Parameters<typeof parseRawSimulation>[0]);
  if (!Api.isSimulationSuccess(simulation) || Api.isSimulationRestore(simulation) || !simulation.result) fail("pilot_simulation_rejected");
  const data = simulation.transactionData.build(), declared = BigInt(data.resourceFee().toString()), minimum = BigInt(simulation.minResourceFee);
  const resourceFee = declared > minimum ? declared : minimum;
  if (resourceFee < BigInt(0) || resourceFee + BigInt(BASE_FEE) > PILOT_SPONSORED_FEE_LIMIT) fail("pilot_simulation_rejected");
  data.resourceFee(xdr.Int64.fromString(resourceFee.toString()));
  const tx = TransactionBuilder.cloneFrom(raw, {fee:BASE_FEE,sorobanData:data}).clearOperations()
    .addOperation(Operation.invokeHostFunction({func:(raw.operations[0] as Operation.InvokeHostFunction).func,auth:simulation.result.auth})).build();
  const op = tx.operations[0]; if (op.type !== "invokeHostFunction" || op.auth?.length !== 1) fail("pilot_authorization_count_invalid");
  const entry = op.auth[0]; if (entry.credentials().switch().name !== "sorobanCredentialsAddress") fail("pilot_signer_invalid");
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(new xdr.HashIdPreimageSorobanAuthorization({networkId:hash(Buffer.from(Networks.TESTNET)),
    nonce:entry.credentials().address().nonce(), invocation:entry.rootInvocation(), signatureExpirationLedger:expirationLedger}));
  const prepared = { unsignedTransaction:tx.toXDR(), expirationLedger, authEntry:preimage.toXDR("base64"), challenge };
  assertPilotPreimage(prepared); return prepared;
}
export async function bindPilotSignature(prepared: PreparedPilot, signedAuthEntry: string) {
  assertPilotPreimage(prepared);
  const signature = Buffer.from(signedAuthEntry,"base64");
  if (signature.length !== 64 || signature.toString("base64") !== signedAuthEntry || !Keypair.fromPublicKey(payer).verify(hash(Buffer.from(prepared.authEntry,"base64")),signature)) fail("pilot_signature_invalid");
  const tx = new Transaction(prepared.unsignedTransaction,Networks.TESTNET), op = tx.operations[0];
  if (op.type !== "invokeHostFunction" || op.auth?.length !== 1) fail("pilot_transaction_invalid");
  const signed = await authorizeEntry(op.auth[0], async preimage => { if (preimage.toXDR("base64") !== prepared.authEntry) fail("pilot_preimage_changed"); return signature; },prepared.expirationLedger,Networks.TESTNET);
  const envelope = tx.toEnvelope(); envelope.v1().tx().operations()[0].body().invokeHostFunctionOp().auth([signed]);
  return new Transaction(envelope,Networks.TESTNET).toXDR();
}

