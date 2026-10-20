import test from "node:test";
import assert from "node:assert/strict";
import { types as postgresTypes } from "@neondatabase/serverless";
import { encodePaymentResponseHeader, decodePaymentSignatureHeader } from "@x402/core/http";
import { createHandoffHandler, HANDOFF_CONFIRMATION, RECOVERY_CONFIRMATION } from "@/app/bazaar/pilot-handoff-web";
import { createHandoffStore, handoffCipher, type HandoffRow } from "@/app/bazaar/pilot-handoff-store";
import { validateSignedPilot, paymentFromSignedSimulation, paymentHeader, observeOrder, authorizationDeadline } from "@/app/bazaar/pilot-handoff";
import { PILOT_ID, PILOT_INTENT_HASH, pilotCipher, pilotHash, type PilotRow } from "@/app/bazaar/pilot-signer-store";
import { PILOT_RESOURCE, PILOT_TERMS, pilotCanonical } from "@/app/bazaar/pilot-signer";
// Test-only loader replaces the immutable payer/hash with a synthetic keypair.
// No production bypass/verifier exists. All XDR and Ed25519 operations are real.
import { preparedFixture, simulation, orderFixture } from "./bazaar-pilot-handoff-fixture";

const fixtureTest=(name:string,fn:()=>Promise<void>)=>test(name,{skip:process.env.CARMELITA_M6_FIXTURE!=="synthetic-key-only"},fn);
const userId="did:privy:synthetic-owner",walletId="synthetic-wallet",identity={role:"agent",network:"stellar:testnet",ownerId:"ow_"+"a".repeat(32),workspaceId:"11111111-1111-4111-8111-111111111111",agentId:"ag_synthetic",generation:1} as const;
const connectionReferenceHash="b".repeat(64),connection=pilotHash(pilotCanonical({userId,walletId,...identity,connectionReferenceHash}));
const key=()=>Buffer.alloc(32,11),cipher=handoffCipher(userId,key),signerCipher=pilotCipher(userId,key);
const origin="https://carmelita.browns.studio/api/connections/bazaar-native/pilot/handoff";
test("handoff route cannot accept another operation or implicit payment authorization",async()=>{
  const disabled=createHandoffHandler();
  assert.equal((await disabled(new Request(origin+"?operationId=31c97193-be74-4b9d-b0a3-f3890b0a41e8"))).status,403);
  assert.equal((await disabled(new Request(origin))).status,401);
});
function request(action?:string,revision=-1,nonce?:string) {return new Request(origin,{method:action?"POST":"GET",headers:{Authorization:"Bearer synthetic.session",...(action?{Origin:"https://carmelita.browns.studio","Content-Type":"application/json"}:{})},...(action?{body:JSON.stringify({action,revision,confirmation:action.includes("recover")?RECOVERY_CONFIRMATION:HANDOFF_CONFIRMATION,...(nonce?{nonce}:{})})}:{})});}
async function harness(options:{lost?:"claim"|"dispatch"|"finish"|"submit";enabled?:boolean;badReceipt?:boolean;advance?:"simulation"|"ownership";recoveryPhase?:string;nativeStatus?:401|404}={}) {
  const prepared=await preparedFixture();let now=Date.now(),row:HandoffRow|null=null,ownership=0,linkChanged=false;const calls:string[]=[],statements:Array<{sql:string;params:unknown[]}>=[];
  const store=createHandoffStore(async(sql,params)=>{
    statements.push({sql,params});if (sql.startsWith("SELECT")) return row&&params[1]===row.user_id?[structuredClone(row)]:[];
    if (sql.startsWith("INSERT")) {if (row) return [];row={operation_id:PILOT_ID,user_id:String(params[1]),wallet_id:String(params[2]),intent_hash:PILOT_INTENT_HASH,connection_hash:String(params[4]),state:"approved",revision:0,nonce_hash:String(params[5]),approval_expires_at:new Date(now+120000).toISOString(),payload_encrypted:String(params[6]),payload_hash:null,recovery_count:0};return [structuredClone(row)];}
    assert.ok(row);if (params[0]!==PILOT_ID||params[1]!==row.user_id||params[2]!==row.wallet_id||params[3]!==row.intent_hash||params[4]!==row.connection_hash||params[5]!==row.revision) return [];
    if (sql.includes("SET state=$8")) {if (row.state!==params[8]||row.nonce_hash!==params[6]||Date.parse(row.approval_expires_at)<=now) return [];row.state=params[7] as HandoffRow["state"];row.revision++;if(options.lost==="claim")throw Error("LOST_CLAIM_ACK");}
    else if (sql.includes("SET state='submit-claimed'")) {if(row.state!=="simulation-claimed"||row.payload_hash||Date.parse(row.approval_expires_at)<=now)return [];row.state="submit-claimed";row.revision++;row.payload_encrypted=String(params[6]);row.payload_hash=String(params[7]);if(options.lost==="dispatch")throw Error("LOST_DISPATCH_ACK");}
    else if (sql.includes("SET state='observed'")) {if(row.state!==params[6])return [];row.state="observed";row.revision++;row.payload_encrypted=String(params[7]);if(options.lost==="finish")throw Error("LOST_FINISH_ACK");}
    else if (sql.includes("SET state='recovery-approved'")) {if(row.state!==params[6])return [];if(row.recovery_count!==0)return [];row.recovery_count=1;row.state="recovery-approved";row.revision++;row.nonce_hash=String(params[7]);row.approval_expires_at=new Date(now+120000).toISOString();}else throw Error("UNEXPECTED_SQL");
    return [structuredClone(row)];
  });
  const signerRow:PilotRow={operation_id:PILOT_ID,user_id:userId,wallet_id:walletId,intent_hash:PILOT_INTENT_HASH,connection_hash:connection,state:"signed",revision:9,nonce_hash:"d".repeat(64),approval_expires_at:new Date(now+120000).toISOString(),payload_encrypted:signerCipher.seal(prepared),dispatch_digest:pilotHash(prepared.authEntry),claimed_at:new Date(now).toISOString()};
  const handler=createHandoffHandler({verifyUser:async token=>token==="other.session"?"did:privy:other":userId,wallet:async()=>walletId,owner:async()=>({userId,walletId,identity,agentToken:"z".repeat(43),connectionReferenceHash,assertCurrent:async()=>{if(linkChanged)throw Error("LINK_CHANGED");ownership++;if(options.advance==="ownership"&&ownership===2)now=authorizationDeadline(prepared)+1;}}),store,
    signer:{read:async()=>signerRow} as never,cipher:()=>cipher,signerCipher:()=>signerCipher,now:()=>now,enabled:()=>options.enabled!==false,
    fetcher:async(target,init)=>{const url=String(target);calls.push(url);assert.notEqual(url.includes("31c97193-be74-4b9d-b0a3-f3890b0a41e8"),true);assert.notEqual(url.includes("reconcile"),true);
      if (url.endsWith("/api/account/identity")) return Response.json(identity);
      if (url==="https://soroban-testnet.stellar.org/") {const body=JSON.parse(String(init?.body));assert.equal(body.method,"simulateTransaction");assert.equal(body.params.transaction,prepared.signedAuthorizationTransaction);if(options.advance==="simulation")now=authorizationDeadline(prepared)+1;return Response.json({jsonrpc:"2.0",id:1,result:simulation(body.params.transaction,"600000",1001)});}
      if (url===PILOT_RESOURCE) {assert.equal(init?.method,"POST");assert.equal(init?.body,"{}");const packet=decodePaymentSignatureHeader(new Headers(init?.headers).get("payment-signature")!);assert.equal(Object.keys(packet.payload).join(","),"transaction");assert.equal(pilotCanonical(packet.accepted),pilotCanonical(prepared.challenge.accepts[0]));
        if(options.nativeStatus)return Response.json({error:{code:"UNAUTHORIZED"}},{status:options.nativeStatus});if(options.lost==="submit")throw Error("LOST_PAYMENT_ACK");const order=orderFixture(identity.ownerId),receipt={success:true,network:"stellar:testnet" as const,payer:PILOT_TERMS.payer,transaction:options.badReceipt?"e".repeat(64):order.transactionHash!};return Response.json({order,statusUrl:PILOT_TERMS.origin+"/api/market/orders/"+PILOT_ID},{headers:{"payment-response":encodePaymentResponseHeader(receipt)}});}
      if(url===PILOT_TERMS.origin+"/api/market/orders/"+PILOT_ID){assert.equal(init?.method,"GET");return Response.json({order:orderFixture(identity.ownerId,options.recoveryPhase??"delivered")});}throw Error("UNEXPECTED_TRANSPORT");},
  });
  async function call(action?:string,revision=-1,nonce?:string) {const res=await handler(request(action,revision,nonce));return {status:res.status,body:await res.json()};}
  return {handler,call,calls,statements,store,prepared,changeLink(){linkChanged=true;},get row(){return row;}};
}
fixtureTest("real SDK synthetic payer/preimage/signature, exact x402 packet and fee/sponsorship perimeter",async()=>{
  const p=await preparedFixture();await validateSignedPilot(p);const packet=paymentFromSignedSimulation(p,simulation(p.signedAuthorizationTransaction,"999900",1001),Date.now());
  assert.deepEqual(decodePaymentSignatureHeader(paymentHeader(packet)),packet);assert.equal(Object.keys(packet.payload).join(","),"transaction");
  assert.throws(()=>paymentFromSignedSimulation(p,simulation(p.signedAuthorizationTransaction,"999901",1001),Date.now()),/fee_limit/);
  assert.throws(()=>paymentFromSignedSimulation(p,simulation(p.signedAuthorizationTransaction,"100",p.expirationLedger),Date.now()),/expired/);
  await assert.rejects(validateSignedPilot({...p,signedAuthorizationTransaction:p.unsignedTransaction}));
  const changed=structuredClone(p);changed.challenge.accepts[0].extra.areFeesSponsored=false;await assert.rejects(validateSignedPilot(changed));
});
fixtureTest("owner route signed simulation -> sole signed POST -> receipt/delivery, journal rejects replay",async()=>{
  const h=await harness(),approval=await h.call("approve");assert.equal(approval.status,200);assert.equal(h.calls.length,0);
  const [a,b]=await Promise.all([h.call("submit",approval.body.revision,approval.body.nonce),h.call("submit",approval.body.revision,approval.body.nonce)]);
  assert.equal([a,b].filter(r=>r.status===200).length,1);const done=[a,b].find(r=>r.status===200)!;assert.equal(done.body.observation.receiptObserved,true);assert.equal(done.body.observation.deliveryObserved,true);
  assert.equal(h.calls.filter(s=>s===PILOT_RESOURCE).length,1);assert.equal(h.calls.filter(s=>s==="https://soroban-testnet.stellar.org/").length,1);
  assert.equal(h.calls.filter(s=>s.endsWith("/api/account/identity")).length,0);
  const snapshot=await h.call();assert.equal(snapshot.body.state,"observed");assert.equal(JSON.stringify(snapshot).includes("signedAuthorizationTransaction"),false);assert.equal(JSON.stringify(snapshot).includes("z".repeat(43)),false);
  assert.equal((await h.call("submit",snapshot.body.revision,approval.body.nonce)).status,409);
});
fixtureTest("lost SQL claim/dispatch ACK never dispatches payment; lost finish/status cannot resubmit",async()=>{
  for(const lost of ["claim","dispatch","finish"] as const){const h=await harness({lost}),a=await h.call("approve"),sent=await h.call("submit",a.body.revision,a.body.nonce);assert.equal(sent.status,409);
    assert.equal(h.calls.filter(s=>s===PILOT_RESOURCE).length,lost==="finish"?1:0);const state=await h.call();assert.equal((await h.call("submit",state.body.revision,a.body.nonce)).status,409);}
});
fixtureTest("lost payment ACK: explicit new read nonce recovers delivery without signing/resending",async()=>{
  const h=await harness({lost:"submit"}),a=await h.call("approve");assert.equal((await h.call("submit",a.body.revision,a.body.nonce)).status,409);
  assert.equal(h.row?.state,"submit-claimed");const read=await h.call("approve-recovery",h.row!.revision);assert.equal(read.status,200);const before=h.calls.length;
  const recovered=await h.call("recover",read.body.revision,read.body.nonce);assert.equal(recovered.status,200);assert.equal(h.calls.length-before,1);assert.equal(recovered.body.observation.deliveryObserved,true);assert.equal(recovered.body.observation.receiptObserved,false);
  assert.equal(recovered.body.paymentReadOnly,true);assert.equal(recovered.body.mayResumeDelivery,true);assert.equal(recovered.body.readOnly,undefined);
  assert.equal(h.calls.filter(s=>s===PILOT_RESOURCE).length,1);assert.equal(h.calls.some(s=>s.includes("reconcile")),false); const recoveredCallCount=h.calls.length; assert.equal((await h.call("approve-recovery",h.row!.revision)).status,409); assert.equal(h.calls.length,recoveredCallCount);
});
fixtureTest("HTTP success or unpaid recovery never proves payment; disabled/expired action sends nothing",async()=>{
  const bad=await harness({badReceipt:true}),a=await bad.call("approve");assert.equal((await bad.call("submit",a.body.revision,a.body.nonce)).status,409);assert.equal(bad.row?.state,"submit-claimed");
  for(const advance of ["simulation","ownership"] as const){const h=await harness({advance}),r=await h.call("approve");assert.equal((await h.call("submit",r.body.revision,r.body.nonce)).status,409);assert.equal(h.calls.filter(s=>s===PILOT_RESOURCE).length,0);}
  const disabled=await harness({enabled:false}),r=await disabled.call("approve");assert.equal((await disabled.call("submit",r.body.revision,r.body.nonce)).status,409);assert.equal(disabled.calls.length,0);
  const unpaid=await harness({lost:"submit",recoveryPhase:"awaiting-payment"}),u=await unpaid.call("approve");await unpaid.call("submit",u.body.revision,u.body.nonce);const q=await unpaid.call("approve-recovery",unpaid.row!.revision),v=await unpaid.call("recover",q.body.revision,q.body.nonce);assert.equal(v.body.observation.paymentObserved,false);assert.equal(v.body.state,"observed");
});
fixtureTest("owner isolation, authenticated cipher, exact SQL scope and protected original rejection",async()=>{
  const sealed=cipher.seal({synthetic:true});assert.deepEqual(cipher.open(sealed),{synthetic:true});assert.throws(()=>handoffCipher("did:privy:other",key).open(sealed));assert.throws(()=>signerCipher.open(sealed));
  const h=await harness(),a=await h.call("approve");const other=await h.store.read("did:privy:other");assert.equal(other,null);
  const realDate=postgresTypes.getTypeParser(1184)(h.row!.approval_expires_at.replace("T"," ").replace("Z","+00"));assert.ok(realDate instanceof Date);
  const dateStore=createHandoffStore(async()=>[{...h.row!,approval_expires_at:realDate}]),dateRow=await dateStore.read(userId);assert.equal(dateRow!.approval_expires_at,h.row!.approval_expires_at);
  await assert.rejects(createHandoffStore(async()=>[{...h.row!,approval_expires_at:new Date(NaN)}]).read(userId));
  await assert.rejects(h.store.claim("did:privy:other",h.row!,a.body.nonce));
  const original=orderFixture();original.operationId="31c97193-be74-4b9d-b0a3-f3890b0a41e8";assert.throws(()=>observeOrder({order:original},identity.ownerId,Date.now()));
  assert.throws(()=>observeOrder({order:orderFixture()},"ow_"+"f".repeat(32),Date.now()));
  const privateStatus=await h.handler(new Request(origin,{headers:{Authorization:"Bearer other.session"}})),otherStatus=await privateStatus.json();assert.equal(otherStatus.state,"not-prepared");assert.equal(otherStatus.observation,undefined);
  const badOrigin=new Request(origin+"?token=never",{headers:{Authorization:"Bearer synthetic.session"}});assert.equal((await h.handler(badOrigin)).status,403);
  await h.call("submit",a.body.revision,a.body.nonce);const claims=h.statements.filter(s=>s.sql.includes("SET state=$8"));assert.match(claims[0].sql,/nonce_hash=\$7 AND state=\$9 AND approval_expires_at>clock_timestamp/);assert.equal(claims[0].params[0],PILOT_ID);
});

fixtureTest("native token rejection stays claimed without a redundant identity GET or retry",async()=>{
  for(const nativeStatus of [401,404] as const){const h=await harness({nativeStatus}),a=await h.call("approve");
    const r=await h.call("submit",a.body.revision,a.body.nonce);assert.equal(r.status,409);assert.equal(h.row?.state,"submit-claimed");
    assert.equal(h.calls.filter(x=>x.endsWith("/api/account/identity")).length,0);assert.equal(h.calls.filter(x=>x===PILOT_RESOURCE).length,1);
    const n=h.calls.length;assert.equal((await h.call("submit",h.row!.revision,a.body.nonce)).status,409);assert.equal(h.calls.length,n);
  }
});
fixtureTest("changed local owner link blocks all native traffic before financial dispatch",async()=>{
  const h=await harness(),a=await h.call("approve");h.changeLink();assert.equal((await h.call("submit",a.body.revision,a.body.nonce)).status,409);
  assert.equal(h.calls.length,0);
});
