import { randomBytes } from "node:crypto";
import { existingHandoffOwner } from "./pilot-handoff-owner";
import { authorizationDeadline, observeOrder, paymentFromSignedSimulation, paymentHeader, storedObservation, validateSignedPilot, type Observation, type SignedPilot } from "./pilot-handoff";
import { createHandoffStore, handoffCipher, type HandoffRow } from "./pilot-handoff-store";
import { PILOT_RESOURCE, PILOT_TERMS, pilotCanonical } from "./pilot-signer";
import { createPilotStore, PILOT_ID, PILOT_INTENT_HASH, pilotCipher, pilotHash } from "./pilot-signer-store";

const origin="https://carmelita.browns.studio",path="/api/connections/bazaar-native/pilot/handoff";
export const HANDOFF_CONFIRMATION="SUBMIT 0.01 USDC ON STELLAR TESTNET ONCE";
export const RECOVERY_CONFIRMATION="CHECK SAME TESTNET ORDER AND ALLOW DELIVERY RECOVERY WITHOUT PAYING AGAIN";
type Owner=Awaited<ReturnType<typeof existingHandoffOwner>>;
type Deps={verifyUser(token:string):Promise<string>;wallet(userId:string):Promise<string>;owner(token:string,walletId:string):Promise<Owner>;
  signer:ReturnType<typeof createPilotStore>;store:ReturnType<typeof createHandoffStore>;cipher:typeof handoffCipher;signerCipher:typeof pilotCipher;
  fetcher:typeof fetch;enabled():boolean;now():number};
const defaults:Deps={
  async verifyUser(token) { const {verifyPrivyAccessToken}=await import("@/app/privy-stellar");return (await verifyPrivyAccessToken(token)).user_id; },
  async wallet(userId) { const {listPersistedUserWallets}=await import("@/app/multichain-account");const wallets=(await listPersistedUserWallets(userId)).filter(w=>w.userId===userId&&w.address===PILOT_TERMS.payer&&w.chainType==="stellar"&&w.network==="stellar:testnet"&&w.status==="active");if (wallets.length!==1) throw Error("handoff_existing_wallet_required");return wallets[0].id; },
  owner:existingHandoffOwner,signer:createPilotStore(),store:createHandoffStore(),cipher:handoffCipher,signerCipher:pilotCipher,fetcher:globalThis.fetch,
  enabled:()=>process.env.CARMELITA_BAZAAR_PILOT_HANDOFF_ENABLED==="true",now:Date.now,
};
type Json=Record<string,unknown>;
function object(value:unknown):Json { if (!value||typeof value!=="object"||Array.isArray(value)) throw Error("handoff_input_invalid");return value as Json; }
function exact(value:Json,keys:string[]) { if (Object.keys(value).sort().join(",")!==keys.sort().join(",")) throw Error("handoff_input_invalid"); }
function response(value:unknown,status=200) { return Response.json(value,{status,headers:{"Cache-Control":"no-store",Pragma:"no-cache"}}); }
async function json(res:Response,max:number,signal:AbortSignal) {
  if (!/^application\/json(?:;|$)/i.test(res.headers.get("content-type")??"")) throw Error("handoff_response_invalid");
  const reader=res.body?.getReader(),parts:Uint8Array[]=[];let bytes=0;if (!reader) throw Error("handoff_response_invalid");
  try { for (;;) { const part=await reader.read();signal.throwIfAborted();if (part.done) break;bytes+=part.value.byteLength;if (bytes>max) throw Error("handoff_response_too_large");parts.push(part.value); }return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(parts))) as unknown; }
  finally { await reader.cancel().catch(()=>{});reader.releaseLock();parts.forEach(p=>p.fill(0)); }
}
function publicState(row:HandoffRow|null,observation?:Observation) { return {state:row?.state??"not-prepared",revision:row?.revision??-1,
  ...(row?{approvalExpiresAt:new Date(row.approval_expires_at).toISOString()}:{}),...(observation?{observation}:{}),
  paymentDispatchMayHaveOccurred:!!row?.payload_hash,recoveryAvailable:!!row&&row.recovery_count===0&&["submit-claimed","observed"].includes(row.state),automaticRetry:false,livePurchaseValidated:false}; }
function channel(deps:Deps,owner:Owner,signal:AbortSignal) {
  const used=new Set<string>();
  async function once(kind:string,url:string,method:"GET"|"POST",body?:string,signature?:string,gate?:()=>void) {
    if (used.has(kind)) throw Error("handoff_no_retry");
    const headers=new Headers({Accept:"application/json",...(body!==undefined?{"Content-Type":"application/json"}:{}),...(kind!=="simulation"?{Authorization:"Bearer "+owner.agentToken}:{})});
    if (signature) headers.set("payment-signature",signature);
    // Last synchronous expiry/flag/abort check after all asynchronous ownership,
    // SQL, simulation and header construction; no await before actual dispatch.
    gate?.();signal.throwIfAborted();used.add(kind);
    const res=await deps.fetcher(url,{method,headers,...(body!==undefined?{body}:{}),signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),redirect:"error",credentials:"omit",cache:"no-store"});
    if (res.redirected||res.headers.has("location")||res.url&&res.url!==url) throw Error("handoff_redirect_denied");return res;
  }
  return {
    async identity() { const res=await once("identity",PILOT_TERMS.origin+"/api/account/identity","GET");if (res.status!==200) throw Error("handoff_identity_unconfirmed");const i=object(await json(res,32768,signal));
      for (const key of ["role","network","ownerId","workspaceId","agentId","generation"] as const) if (i[key]!==owner.identity[key]) throw Error("handoff_identity_changed"); },
    async simulation(p:SignedPilot,gate:()=>void) { const res=await once("simulation","https://soroban-testnet.stellar.org/","POST",JSON.stringify({jsonrpc:"2.0",id:1,method:"simulateTransaction",params:{transaction:p.signedAuthorizationTransaction}}),undefined,gate);
      if (res.status!==200) throw Error("handoff_simulation_unconfirmed");const b=object(await json(res,262144,signal));if (b.jsonrpc!=="2.0"||b.id!==1||b.error||!b.result) throw Error("handoff_simulation_unconfirmed");return b.result; },
    async submit(signature:string,gate:()=>void) { const res=await once("payment",PILOT_RESOURCE,"POST","{}",signature,gate);if (![200,202].includes(res.status)) throw Error("handoff_payment_unconfirmed");const body=await json(res,65536,signal),header=res.headers.get("payment-response");
      if (!header) throw Error("handoff_payment_receipt_required");return observeOrder(body,owner.identity.ownerId,deps.now(),header); },
    async recover(gate:()=>void) { const res=await once("recovery",PILOT_TERMS.origin+"/api/market/orders/"+PILOT_ID,"GET",undefined,undefined,gate);if (res.status!==200) throw Error("handoff_recovery_unconfirmed");return observeOrder(await json(res,65536,signal),owner.identity.ownerId,deps.now()); },
  };
}
/** Web-owner endpoint. No create/challenge/sign/renew/reconcile endpoint exists
 * here. A durable claim can only be followed by a single payment dispatch. */
export function createHandoffHandler(deps:Deps=defaults) {
  return async(request:Request)=>{
    const url=new URL(request.url);
    if (url.origin!==origin||url.pathname!==path||url.search||url.hash||!["GET","POST"].includes(request.method)
      || request.method==="POST"&&request.headers.get("origin")!==origin || request.headers.has("origin")&&request.headers.get("origin")!==origin) return response({error:"handoff_origin_denied"},403);
    const bearer=request.headers.get("authorization")??"";if (!/^Bearer [A-Za-z0-9._~-]{1,4096}$/.test(bearer)) return response({error:"handoff_session_required"},401);
    let userId:string;try { userId=await deps.verifyUser(bearer.slice(7));if (!/^did:privy:.+/.test(userId)) throw Error(); }catch { return response({error:"handoff_session_required"},401); }
    let claimed:HandoffRow|undefined;
    try {
      const cipher=deps.cipher(userId);
      if (request.method==="GET") { const row=await deps.store.read(userId);let observation:Observation|undefined;
        if (row?.state==="observed") { const payload=object(cipher.open(row.payload_encrypted));observation=storedObservation(payload.observation); }
        return response({...publicState(row,observation),handoffEnabled:deps.enabled(),schemaReady:true,ready:false,operationId:PILOT_ID,intentHash:PILOT_INTENT_HASH}); }
      if (request.headers.has("content-encoding")||!/^application\/json(?:;|$)/i.test(request.headers.get("content-type")??"")) throw Error("handoff_input_invalid");
      const body=object(await json(new Response(request.body,{headers:{"Content-Type":"application/json"}}),4096,AbortSignal.any([request.signal,AbortSignal.timeout(10000)])));
      const action=String(body.action);if (!["approve","submit","approve-recovery","recover"].includes(action)) throw Error("handoff_input_invalid");
      exact(body,["action","revision","confirmation",...(["submit","recover"].includes(action)?["nonce"]:[])]);
      if (!Number.isSafeInteger(body.revision)||Number(body.revision)<-1||Number(body.revision)>100000
        || body.confirmation!==(["approve-recovery","recover"].includes(action)?RECOVERY_CONFIRMATION:HANDOFF_CONFIRMATION)
        || ["submit","recover"].includes(action)&&(typeof body.nonce!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(body.nonce))) throw Error("handoff_explicit_confirmation_required");
      if (action==="submit"&&!deps.enabled()) throw Error("handoff_disabled");
      const walletId=await deps.wallet(userId),owner=await deps.owner(bearer.slice(7),walletId);
      if (owner.userId!==userId||owner.walletId!==walletId) throw Error("handoff_owner_changed");
      const connection=pilotHash(pilotCanonical({userId,walletId,...owner.identity,connectionReferenceHash:owner.connectionReferenceHash}));
      const before=await deps.store.read(userId);
      if (before&&(before.wallet_id!==walletId||before.connection_hash!==connection||before.revision!==body.revision)||!before&&body.revision!==-1) throw Error("handoff_state_changed");
      if (action==="approve-recovery") { if (!before) throw Error("handoff_read_recovery_unavailable");const nonce=randomBytes(32).toString("base64url"),row=await deps.store.approveRecovery(userId,before,pilotHash(nonce));return response({...publicState(row),nonce,handoffEnabled:deps.enabled(),paymentReadOnly:true,mayResumeDelivery:true}); }
      if (action==="approve") {
        if (before) throw Error("handoff_existing_dispatch_must_not_repeat");
        const signed=await deps.signer.read(userId);
        if (!signed||signed.state!=="signed"||signed.wallet_id!==walletId||signed.connection_hash!==connection) throw Error("handoff_existing_signature_required");
        const p=await validateSignedPilot(deps.signerCipher(userId).open(signed.payload_encrypted));
        if (deps.now()>=authorizationDeadline(p)) throw Error("handoff_authorization_expired");
        const nonce=randomBytes(32).toString("base64url"),row=await deps.store.approve(userId,walletId,connection,pilotHash(nonce),cipher.seal({prepared:p,signerRevision:signed.revision}));
        return response({...publicState(row),nonce,handoffEnabled:deps.enabled(),ready:false});
      }
      if (!before) throw Error("handoff_approval_required");
      const recovering=action==="recover",signal=AbortSignal.any([request.signal,AbortSignal.timeout(45000)]),transport=channel(deps,owner,signal);
      // Do not perform any Bazaar I/O for a consumed nonce or wrong state.
      if (before.state!==(recovering?"recovery-approved":"approved")||before.nonce_hash!==pilotHash(body.nonce as string)) throw Error("handoff_no_retry");
      const approvalExpires=new Date(before.approval_expires_at).getTime();
      if (!Number.isFinite(approvalExpires)||deps.now()>=approvalExpires) throw Error("handoff_approval_expired");
      const payload=object(cipher.open(before.payload_encrypted));
      const prepared=recovering?undefined:await validateSignedPilot(payload.prepared);
      const expiresAt=recovering?approvalExpires:Math.min(approvalExpires,authorizationDeadline(prepared!));
      const fresh=()=>{ if ((!recovering&&!deps.enabled())||signal.aborted||deps.now()>=expiresAt) throw Error("handoff_approval_expired"); };
      fresh();await owner.assertCurrent();fresh();
      claimed=await deps.store.claim(userId,before,body.nonce as string,recovering);
      // A duplicate caller can lose this CAS, but cannot spend an additional
      // native identity read. Unknown identity after the claim stays locked.
      await transport.identity();await owner.assertCurrent();fresh();
      if (recovering) {
        const observation=await transport.recover(fresh);
        if (payload.observation) {
          const prior=storedObservation(payload.observation);
          if (prior.paymentObserved&&(!observation.paymentObserved||prior.transactionHash!==observation.transactionHash)) throw Error("handoff_recovery_payment_changed");
          // Preserve the already recorded receipt proof for this SAME payment.
          // A read without a receipt never invents one or clears a prior proof.
          if (prior.receiptObserved&&prior.transactionHash===observation.transactionHash) observation.receiptObserved=true;
        }
        const row=await deps.store.finish(userId,claimed,cipher.seal({...payload,observation}));claimed=undefined;
        return response({...publicState(row,observation),paymentReadOnly:true,mayResumeDelivery:true,handoffEnabled:deps.enabled()});
      }
      const raw=await transport.simulation(prepared!,fresh),packet=paymentFromSignedSimulation(prepared!,raw,deps.now()),signature=paymentHeader(packet);
      await owner.assertCurrent();fresh();
      claimed=await deps.store.dispatch(userId,claimed,cipher.seal({...payload,packet}),pilotHash(pilotCanonical(packet)));
      const observation=await transport.submit(signature,fresh),row=await deps.store.finish(userId,claimed,cipher.seal({...payload,packet,observation}));claimed=undefined;
      return response({...publicState(row,observation),handoffEnabled:deps.enabled()});
    } catch { return response({error:claimed?"handoff_uncertain_no_retry":"handoff_action_not_confirmed",readOwnerStatus:true,automaticRetry:false,ready:false},409); }
  };
}
