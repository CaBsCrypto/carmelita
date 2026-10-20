import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilotWebHandler} from '@/app/bazaar/pilot-signer-web';
import {PILOT_TERMS,PILOT_RESOURCE,pilotCanonical} from '@/app/bazaar/pilot-signer';
import {PILOT_ID,PILOT_INTENT_HASH,pilotHash,pilotCipher,type PilotRow} from '@/app/bazaar/pilot-signer-store';
import {challenge,simulation,orderFixture,preparedFixture} from './bazaar-pilot-handoff-fixture';
const identity={role:'agent',network:'stellar:testnet',ownerId:'ow_'+'a'.repeat(32),workspaceId:'11111111-1111-4111-8111-111111111111',agentId:'ag_synthetic',generation:1};
const userId='did:privy:synthetic-owner',walletId='synthetic-wallet',connectionReferenceHash='b'.repeat(64),nonce='c'.repeat(43);
const connection=pilotHash(pilotCanonical({userId,walletId,...identity,connectionReferenceHash}));
async function harness(options:{sign?:boolean;identityFailure?:'401'|'generation';badOwner?:boolean;badChallenge?:boolean;changedLink?:boolean;lostClaim?:boolean}={}) {
 const cipher=pilotCipher(userId,()=>Buffer.alloc(32,11)),calls:string[]=[],claims:string[]=[];
 let row:PilotRow={operation_id:PILOT_ID,user_id:userId,wallet_id:walletId,intent_hash:PILOT_INTENT_HASH,connection_hash:connection,state:options.sign?'challenge-bound':'review',revision:0,nonce_hash:pilotHash(nonce),approval_expires_at:new Date(Date.now()+120000).toISOString(),payload_encrypted:cipher.seal(options.sign?await preparedFixture():{}),dispatch_digest:null,claimed_at:null};
 const handler=createPilotWebHandler({verifyUser:async()=>userId,wallet:async()=>walletId,
  owner:async()=>({userId,walletId,identity,connectionReferenceHash,agentToken:'z'.repeat(43),assertCurrent:async()=>{if(options.changedLink)throw Error('pilot_agent_link_changed');},signAuthEntry:async()=>{throw Error('REAL_SIGN_FORBIDDEN');}} as never),
  store:{read:async()=>structuredClone(row),claim:async(_u:string,before:PilotRow,_n:string,kind:string)=>{assert.equal(row.revision,before.revision);assert.equal(row.state,kind==='challenge'?'review':'challenge-bound');row={...row,state:kind==='challenge'?'challenge-claimed':'dispatch-claimed',revision:row.revision+1};claims.push(kind);if(options.lostClaim)throw Error('LOST_CLAIM_ACK');return structuredClone(row);},finish:async(_u:string,_b:PilotRow,state:PilotRow['state'],encrypted:string,hash:string)=>{row={...row,state,payload_encrypted:encrypted,nonce_hash:hash,revision:row.revision+1};return row;}} as never,
  cipher:()=>cipher,enabled:()=>true,now:Date.now,
  fetcher:async(target,init)=>{const url=String(target);calls.push(url);assert(!url.includes('31c97193-be74-4b9d-b0a3-f3890b0a41e8'));
   if(url.endsWith('/api/account/identity'))return options.identityFailure==='401'?Response.json({}, {status:401}):Response.json({...identity,generation:options.identityFailure==='generation'?2:1});
   if(url===PILOT_TERMS.origin+'/api/market/orders/'+PILOT_ID)return Response.json({order:orderFixture(options.badOwner?'ow_'+'f'.repeat(32):identity.ownerId,'awaiting-payment')});
   if(url===PILOT_RESOURCE){const packet=structuredClone(challenge);if(options.badChallenge)packet.accepts[0].amount='99999';return Response.json(packet,{status:402,headers:{'payment-required':Buffer.from(JSON.stringify(packet)).toString('base64')}});}
   assert.equal(url,'https://soroban-testnet.stellar.org/');const request=JSON.parse(String(init?.body));return Response.json({jsonrpc:'2.0',id:1,result:request.method==='getLatestLedger'?{sequence:1000}:simulation(request.params.transaction)});
  },
 });
 async function call(){return handler(new Request('https://carmelita.browns.studio/api/connections/bazaar-native/pilot',{method:'POST',headers:{Origin:'https://carmelita.browns.studio',Authorization:'Bearer synthetic.session','Content-Type':'application/json'},body:JSON.stringify({action:options.sign?'sign':'challenge',revision:0,nonce,...(options.sign?{confirmation:'SIGN 0.01 USDC ON STELLAR TESTNET'}:{})})}));}
 return {call,calls,claims,get row(){return row;}};
}
test('challenge uses native authenticated order/challenge, without standalone identity or real signature',async()=>{
 const h=await harness();const r=await h.call();assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal(h.row.state,'challenge-bound');assert.equal(h.calls.length,4);assert(!h.calls.some(s=>s.endsWith('/api/account/identity')));assert.equal((await h.call()).status,409);assert.equal(h.calls.length,4);
});
test('foreign native owner and altered challenge stop before ledger and signature',async()=>{
 for(const options of [{badOwner:true},{badChallenge:true}]){const h=await harness(options);assert.equal((await h.call()).status,409);assert(!h.calls.some(s=>s.includes('soroban-testnet')));assert.equal(h.row.state,'challenge-claimed');}
});
test('signing retains independent exact identity proof before any RPC/wallet action',async()=>{
 for(const identityFailure of ['401','generation'] as const){const h=await harness({sign:true,identityFailure});assert.equal((await h.call()).status,409);assert.deepEqual(h.calls,[PILOT_TERMS.origin+'/api/account/identity']);assert.equal(h.claims.length,0);}
});
test('changed local identity and uncertain durable claim never dispatch or retry',async()=>{
 const changed=await harness({changedLink:true});assert.equal((await changed.call()).status,409);assert.equal(changed.calls.length,0);
 const lost=await harness({lostClaim:true});assert.equal((await lost.call()).status,409);assert.equal(lost.calls.length,0);assert.equal((await lost.call()).status,409);assert.equal(lost.calls.length,0);
});
