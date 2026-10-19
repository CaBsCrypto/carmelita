import test from "node:test";
import assert from "node:assert/strict";
import { decodePilotRootKey, pilotCipher, createPilotStore, PILOT_ID, PILOT_INTENT_HASH, type PilotRow } from "../app/bazaar/pilot-signer-store";
import { createPilotWebHandler } from "../app/bazaar/pilot-signer-web";
import { PILOT_TERMS } from "../app/bazaar/pilot-signer";

test("pilot preserves the existing root key in canonical base64 and base64url forms without rotation",()=>{
  const root=Buffer.alloc(32,251);
  for(const encoded of [root.toString("base64"),root.toString("base64").slice(0,-1),root.toString("base64url"),"\n"+root.toString("base64")+"\r\n"]){
    const decoded=decodePilotRootKey(encoded);assert.deepEqual(decoded,root);
    const original=pilotCipher("did:privy:a",()=>Buffer.from(root));
    assert.deepEqual(pilotCipher("did:privy:a",()=>decodePilotRootKey(encoded)).open(original.seal({test:true})),{test:true});
  }
  for(const bad of [undefined,"",root.toString("hex"),"A".repeat(42),"A".repeat(44),"A".repeat(42)+"B=","!"+root.toString("base64"),"A".repeat(20)+"\n"+"A".repeat(23)])assert.throws(()=>decodePilotRootKey(bad),/encryption_unavailable/);
});

function fixture(failure?:Error){
  const user="did:privy:synthetic",wallet="synthetic-existing-wallet";let row:PilotRow|null=null,writes=0,network=0;
  const store=createPilotStore(async(query,params)=>{
    if(query.startsWith("SELECT"))return row?[row]:[];
    assert(query.startsWith("INSERT INTO public.agent_bazaar_pilot_signer AS journal"));writes++;
    row={operation_id:PILOT_ID,user_id:user,wallet_id:wallet,intent_hash:PILOT_INTENT_HASH,connection_hash:String(params[4]),state:"review",revision:0,nonce_hash:String(params[5]),payload_encrypted:String(params[6]),approval_expires_at:new Date(Date.now()+120000).toISOString(),dispatch_digest:null,claimed_at:null};return [row];
  });
  const handler=createPilotWebHandler({verifyUser:async()=>user,wallet:async()=>wallet,
    owner:async()=>{if(failure)throw failure;return {userId:user,walletId:wallet,address:PILOT_TERMS.payer,agentToken:"S".repeat(43),connectionReferenceHash:"a".repeat(64),
      identity:{role:"agent",network:"stellar:testnet",ownerId:"ow_"+"a".repeat(32),workspaceId:"10000000-0000-4000-8000-000000000001",agentId:"agent_synthetic",generation:1},
      dispatchGuardSupported:true,assertCurrent:async()=>{},signAuthEntry:async()=>assert.fail("No signature")};},store,
    cipher:(id)=>pilotCipher(id,()=>decodePilotRootKey(Buffer.alloc(32,251).toString("base64url"))),
    fetcher:async()=>{network++;assert.fail("No provider, payment or order calls");},enabled:()=>false,now:Date.now});
  const request=(body:unknown)=>new Request("https://carmelita.browns.studio/api/connections/bazaar-native/pilot",{method:"POST",headers:{origin:"https://carmelita.browns.studio",authorization:"Bearer SYNTHETIC","content-type":"application/json"},body:JSON.stringify(body)});
  return {handler,request,effects:()=>({writes,network,row})};
}
test("terms review succeeds with an existing unpadded key while signing and payment remain disabled",async()=>{
  const f=fixture(),r=await f.handler(f.request({action:"review",revision:-1})),body=await r.json();
  assert.equal(r.status,200);assert.equal(body.state,"review");assert.equal(body.revision,0);
  assert.equal(body.terms.amount,"0.01");assert.equal(body.signingEnabled,false);assert.equal(body.ready,false);
  assert.deepEqual({writes:f.effects().writes,network:f.effects().network},{writes:1,network:0});
  assert.equal(f.effects().row?.dispatch_digest,null);assert.equal(f.effects().row?.claimed_at,null);
});
test("review failure reports only allowlisted diagnostics and makes no journal write",async()=>{
  for(const [error,code] of [[new Error("pilot_wallet_not_owned"),"pilot_wallet_not_owned"],[new Error("private credential transport details"),"pilot_review_unavailable"]] as const){
    const f=fixture(error),r=await f.handler(f.request({action:"review",revision:-1})),body=await r.json();
    assert.equal(r.status,409);assert.deepEqual(body.reviewFailure,{stage:"owner-link",code});
    assert.equal(body.automaticRetry,false);assert.equal(f.effects().writes,0);assert.equal(f.effects().network,0);
    assert(!JSON.stringify(body).includes("private credential"));
  }
});
test("disabled signer cannot prepare a challenge or dispatch even with a review nonce",async()=>{
  for(const action of ["challenge","sign"]){const f=fixture();const r=await f.handler(f.request({action,revision:0,nonce:"n".repeat(43),...(action==="sign"?{confirmation:"SIGN 0.01 USDC ON STELLAR TESTNET"}:{})}));
    assert.equal(r.status,409);assert.equal(f.effects().writes,0);assert.equal(f.effects().network,0);assert.equal((await r.json()).reviewFailure,undefined);}
});
