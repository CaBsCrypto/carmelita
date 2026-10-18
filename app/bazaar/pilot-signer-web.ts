import { randomBytes } from "node:crypto";
import { Networks, Transaction } from "@stellar/stellar-sdk";
import { assertPilotPreimage, assertPilotTerms, assertPilotChallenge, bindPilotSignature, existingCarmelitaPilotOwner,
  PILOT_RESOURCE, PILOT_TERMS, pilotCanonical, preparePilotUnsigned, type PreparedPilot } from "./pilot-signer";
import { createPilotStore, PILOT_ID, PILOT_INTENT_HASH, pilotCipher, pilotHash, type PilotRow } from "./pilot-signer-store";

const origin = "https://carmelita.browns.studio", path = "/api/connections/bazaar-native/pilot";
const confirmation = "SIGN 0.01 USDC ON STELLAR TESTNET";
type Owner = Awaited<ReturnType<typeof existingCarmelitaPilotOwner>>;
type Deps = {
  verifyUser(token: string): Promise<string>;
  wallet(userId: string): Promise<string>;
  owner(token: string, walletId: string): Promise<Owner>;
  store: ReturnType<typeof createPilotStore>;
  cipher: typeof pilotCipher;
  fetcher: typeof fetch;
  enabled(): boolean;
  now(): number;
};
const defaults: Deps = {
  async verifyUser(token) { const { verifyPrivyAccessToken } = await import("@/app/privy-stellar"); return (await verifyPrivyAccessToken(token)).user_id; },
  async wallet(userId) { const { listPersistedUserWallets } = await import("@/app/multichain-account");
    const wallets = (await listPersistedUserWallets(userId)).filter(w => w.userId === userId && w.address === PILOT_TERMS.payer
      && w.chainType === "stellar" && w.network === "stellar:testnet" && w.status === "active");
    if (wallets.length !== 1) throw Error("pilot_existing_wallet_required"); return wallets[0].id;
  },
  owner: (token, walletId) => existingCarmelitaPilotOwner({accessToken:token,walletId}),
  store: createPilotStore(), cipher: pilotCipher, fetcher: globalThis.fetch,
  enabled: () => process.env.CARMELITA_BAZAAR_PILOT_SIGNING_ENABLED === "true", now: Date.now,
};
type Json = Record<string, unknown>;
function object(value: unknown): Json { if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("pilot_input_invalid"); return value as Json; }
function exact(value: Json, keys: string[]) { if (Object.keys(value).sort().join(",") !== keys.sort().join(",")) throw Error("pilot_input_invalid"); }
function publicState(row: PilotRow | null) { return row ? { state:row.state,revision:row.revision,approvalExpiresAt:new Date(row.approval_expires_at).toISOString(),signatureStored:row.state === "signed" } : {state:"not-prepared",revision:-1,signatureStored:false}; }
function response(value: unknown, status = 200) { return Response.json(value,{status,headers:{"Cache-Control":"no-store","Pragma":"no-cache"}}); }
async function json(response: Response, max: number, signal: AbortSignal) {
  if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) throw Error("pilot_response_invalid");
  const reader = response.body?.getReader(); if (!reader) throw Error("pilot_response_invalid");
  const parts: Uint8Array[] = []; let bytes = 0;
  try { for (;;) { const part = await reader.read(); signal.throwIfAborted(); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > max) throw Error("pilot_response_too_large"); parts.push(part.value); }
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(parts))) as unknown;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); parts.forEach(p => p.fill(0)); }
}
function transport(deps: Deps, owner: Owner, signal: AbortSignal) {
  let identityUsed = false, orderUsed = false, challengeUsed = false, ledgerUsed = false, simulationUsed = false;
  async function fetchOnce(url: string, method: "GET" | "POST", body?: string, agent = false) {
    const result = await deps.fetcher(url,{method,headers:{Accept:"application/json",...(body !== undefined ? {"Content-Type":"application/json"} : {}),
      ...(agent ? {Authorization:"Bearer "+owner.agentToken} : {})},...(body !== undefined ? {body} : {}),signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),
      redirect:"error",credentials:"omit",cache:"no-store"});
    if (result.redirected || result.headers.has("location") || result.url && result.url !== url) throw Error("pilot_redirect_denied"); return result;
  }
  return {
    async identity() {
      if (identityUsed) throw Error("pilot_no_retry"); identityUsed = true;
      const res = await fetchOnce(PILOT_TERMS.origin+"/api/account/identity","GET",undefined,true);
      if (res.status !== 200) throw Error("pilot_native_identity_unconfirmed"); const i = object(await json(res,32768,signal));
      if (i.role !== "agent" || i.network !== "stellar:testnet" || i.ownerId !== owner.identity.ownerId || i.workspaceId !== owner.identity.workspaceId
        || i.agentId !== owner.identity.agentId || i.generation !== owner.identity.generation) throw Error("pilot_native_identity_changed");
    },
    async challenge() {
      if (orderUsed || challengeUsed) throw Error("pilot_no_retry"); orderUsed = true;
      const res = await fetchOnce(PILOT_TERMS.origin+"/api/market/orders/"+PILOT_ID,"GET",undefined,true);
      if (res.status !== 200) throw Error("pilot_new_order_required"); const o = object(object(await json(res,65536,signal)).order);
      if (o.operationId !== PILOT_ID || o.buyerOwnerId !== owner.identity.ownerId || o.sellerOwnerId === owner.identity.ownerId || o.phase !== "awaiting-payment"
        || o.payer !== PILOT_TERMS.payer || o.destination !== PILOT_TERMS.card.payment.destination || o.amount !== "0.01"
        || o.paymentProtocol !== "x402-stellar-exact-v2" || o.cardHash !== PILOT_TERMS.cardHash || o.inputHash !== PILOT_TERMS.inputHash
        || pilotHash(pilotCanonical(o.card)) !== PILOT_TERMS.cardHash || pilotCanonical(o.input) !== pilotCanonical(PILOT_TERMS.input)
        || pilotCanonical(o.settlement) !== pilotCanonical(PILOT_TERMS.card.payment.identity)) throw Error("pilot_order_changed");
      challengeUsed = true;
      const required = await fetchOnce(PILOT_RESOURCE,"POST","{}",true);
      if (required.status !== 402) throw Error("pilot_expected_payment_required"); const header = required.headers.get("payment-required");
      if (!header || header.length > 32768) throw Error("pilot_challenge_invalid");
      let packet: unknown; try { packet = JSON.parse(Buffer.from(header,"base64").toString("utf8")); } catch { throw Error("pilot_challenge_invalid"); }
      const body = await json(required,65536,signal); if (pilotCanonical(packet) !== pilotCanonical(body)) throw Error("pilot_challenge_conflict");
      return assertPilotChallenge(body);
    },
    async rpc(method: "getLatestLedger" | "simulateTransaction", params: Json) {
      if (method === "getLatestLedger" ? ledgerUsed || Object.keys(params).length !== 0 : simulationUsed || !ledgerUsed || Object.keys(params).join(",") !== "transaction") throw Error("pilot_rpc_scope_denied");
      if (method === "getLatestLedger") ledgerUsed = true; else simulationUsed = true;
      const res = await fetchOnce("https://soroban-testnet.stellar.org/","POST",JSON.stringify({jsonrpc:"2.0",id:1,method,params}));
      if (res.status !== 200) throw Error("pilot_rpc_unconfirmed"); const body = object(await json(res,262144,signal));
      if (body.jsonrpc !== "2.0" || body.id !== 1 || body.error || !body.result) throw Error("pilot_rpc_unconfirmed"); return body.result;
    },
  };
}
/** Web-owner only. No generic XDR/approval, create-order, payment or MCP surface. */
export function createPilotWebHandler(deps: Deps = defaults) {
  return async (request: Request) => {
    const url = new URL(request.url);
    if (url.origin !== origin || url.pathname !== path || url.search || url.hash || !["GET","POST"].includes(request.method)
      || request.method === "POST" && request.headers.get("origin") !== origin
      || request.headers.get("origin") && request.headers.get("origin") !== origin) return response({error:"pilot_origin_denied"},403);
    const bearer = request.headers.get("authorization") ?? "";
    if (!/^Bearer [A-Za-z0-9._~-]{1,4096}$/.test(bearer)) return response({error:"pilot_session_required"},401);
    let userId: string;
    try { userId = await deps.verifyUser(bearer.slice(7)); if (!/^did:privy:.+/.test(userId)) throw Error(); }
    catch { return response({error:"pilot_session_required"},401); }
    let claimed: PilotRow | undefined;
    try {
      assertPilotTerms();
      if (request.method === "GET") {
        let state: ReturnType<typeof publicState> = publicState(null), schemaReady = false;
        try { state = publicState(await deps.store.read(userId)); schemaReady = true; } catch { /* fail closed; no schema creation */ }
        return response({operationId:PILOT_ID,intentHash:PILOT_INTENT_HASH,amount:"0.01",asset:"USDC",network:"stellar:testnet",marketplaceFee:"0",
          signingEnabled:deps.enabled(),schemaReady,ready:false,mode:deps.enabled() ? "owner-controlled" : "disabled",...state,
          createsOrders:false,submitsPayments:false,automaticRetry:false});
      }
      if (request.headers.has("content-encoding") || !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw Error("pilot_input_invalid");
      const body = object(await json(new Response(request.body,{headers:{"content-type":"application/json"}}),4096,AbortSignal.any([request.signal,AbortSignal.timeout(10000)])));
      const action = body.action;
      if (!["review","challenge","sign"].includes(String(action))) throw Error("pilot_input_invalid");
      if (action === "review") exact(body,["action","revision"]);
      else exact(body,action === "sign" ? ["action","revision","nonce","confirmation"] : ["action","revision","nonce"]);
      if (!Number.isSafeInteger(body.revision) || Number(body.revision) < -1 || Number(body.revision) > 100000) throw Error("pilot_input_invalid");
      if (action !== "review" && (!deps.enabled() || body.revision === -1)) throw Error("pilot_signing_disabled");
      if (action !== "review" && (typeof body.nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.nonce))) throw Error("pilot_input_invalid");
      if (action === "sign" && body.confirmation !== confirmation) throw Error("pilot_explicit_confirmation_required");
      const walletId = await deps.wallet(userId), owner = await deps.owner(bearer.slice(7),walletId);
      if (owner.userId !== userId || owner.walletId !== walletId) throw Error("pilot_owner_changed");
      const connection = pilotHash(pilotCanonical({userId,walletId,...owner.identity,connectionReferenceHash:owner.connectionReferenceHash})), cipher = deps.cipher(userId);
      const before = await deps.store.read(userId);
      if (before && (before.wallet_id !== walletId || before.connection_hash !== connection || before.revision !== body.revision)
        || !before && body.revision !== -1) throw Error("pilot_state_changed");
      if (action === "review") {
        const nonce = randomBytes(32).toString("base64url");
        const row = before?.state === "challenge-bound" ? await deps.store.approve(userId,before,pilotHash(nonce))
          : await deps.store.review(userId,walletId,connection,pilotHash(nonce),cipher.seal({intentHash:PILOT_INTENT_HASH,identity:owner.identity}),Number(body.revision));
        return response({...publicState(row),nonce,terms:{operationId:PILOT_ID,payer:PILOT_TERMS.payer,payTo:PILOT_TERMS.card.payment.destination,amount:"0.01",asset:"USDC",network:"stellar:testnet",marketplaceFee:"0"},signingEnabled:deps.enabled(),ready:false});
      }
      if (!before) throw Error("pilot_review_required");
      const channel = transport(deps,owner,AbortSignal.any([request.signal,AbortSignal.timeout(45000)]));
      await channel.identity(); await owner.assertCurrent();
      if (!deps.enabled()) throw Error("pilot_signing_disabled");
      if (action === "challenge") {
        claimed = await deps.store.claim(userId,before,body.nonce as string,"challenge");
        const challenge = await channel.challenge(), prepared = await preparePilotUnsigned(challenge,channel.rpc);
        await owner.assertCurrent(); const nonce = randomBytes(32).toString("base64url");
        const row = await deps.store.finish(userId,claimed,"challenge-bound",cipher.seal(prepared),pilotHash(nonce)); claimed = undefined;
        return response({...publicState(row),nonce,authorizationFingerprint:assertPilotPreimage(prepared),ready:false,submitsPayments:false});
      }
      const prepared = cipher.open(before.payload_encrypted) as PreparedPilot, digest = assertPilotPreimage(prepared);
      // Reapproval never extends the exact unsigned authorization's lifetime.
      // One read-only current ledger prevents signing an already expired auth.
      const latest = await channel.rpc("getLatestLedger",{}) as {sequence:number};
      const maxTime = new Transaction(prepared.unsignedTransaction,Networks.TESTNET).timeBounds?.maxTime;
      if (!Number.isSafeInteger(latest.sequence) || latest.sequence < 1 || latest.sequence >= prepared.expirationLedger
        || !maxTime || !/^\d+$/.test(maxTime) || Number(maxTime)*1000 <= deps.now()) throw Error("pilot_unsigned_authorization_expired");
      await owner.assertCurrent();
      claimed = await deps.store.claim(userId,before,body.nonce as string,"dispatch",digest);
      const expiresAt = Math.min(new Date(claimed.approval_expires_at).getTime(),Number(maxTime)*1000);
      const signal = AbortSignal.any([request.signal,AbortSignal.timeout(Math.max(1,Math.min(120000,expiresAt-deps.now())))]);
      const result = await owner.signAuthEntry(prepared.authEntry,{address:PILOT_TERMS.payer,networkPassphrase:Networks.TESTNET},{expiresAt,signal,
        assertFreshAction() { if (!deps.enabled() || signal.aborted || deps.now() >= expiresAt) throw Error("pilot_dispatch_approval_expired"); }});
      const signedAuthorizationTransaction = await bindPilotSignature(prepared,result.signedAuthEntry);
      const row = await deps.store.finish(userId,claimed,"signed",cipher.seal({...prepared,signedAuthorizationTransaction}),claimed.nonce_hash); claimed = undefined;
      return response({...publicState(row),ready:false,submitsPayments:false,requiresSeparatePaymentIntegration:true});
    } catch {
      // A lost claim/finish ACK can already have committed: never replay or reset.
      // Even a pre-dispatch failure after the durable claim permanently stops signing.
      return response({error:claimed ? "pilot_action_uncertain_no_retry" : "pilot_action_not_confirmed",readStatusBeforeAnyNextAction:true,automaticRetry:false},409);
    }
  };
}
