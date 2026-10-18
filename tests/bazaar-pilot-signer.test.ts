import test from "node:test";
import assert from "node:assert/strict";
import { Address, Networks, SorobanDataBuilder, Transaction, xdr } from "@stellar/stellar-sdk";
import { assertPilotChallenge, assertPilotPreimage, assertPilotTerms, bindPilotSignature, PILOT_RESOURCE, PILOT_TERMS, preparePilotUnsigned } from "../app/bazaar/pilot-signer";
import { createPilotStore, PILOT_ID, PILOT_INTENT_HASH, pilotCipher, pilotHash, type PilotRow } from "../app/bazaar/pilot-signer-store";

const challenge = {x402Version:2,resource:{url:PILOT_RESOURCE,mimeType:"application/json"},accepts:[{scheme:"exact",network:"stellar:testnet",
  asset:PILOT_TERMS.card.payment.identity.sacContract,amount:"100000",payTo:PILOT_TERMS.card.payment.destination,maxTimeoutSeconds:60,
  extra:{areFeesSponsored:true,resourceUrl:PILOT_RESOURCE,route:new URL(PILOT_RESOURCE).pathname,method:"POST",operationId:PILOT_ID,cardHash:PILOT_TERMS.cardHash,inputHash:PILOT_TERMS.inputHash}}]};
async function unsigned(total:number) {
  return preparePilotUnsigned(challenge,async(method,params) => {
    if (method === "getLatestLedger") return {sequence:1000};
    const op = new Transaction(String(params.transaction),Networks.TESTNET).operations[0];
    assert.equal(op.type,"invokeHostFunction"); if (op.type !== "invokeHostFunction") throw Error();
    const entry = new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({
      address:new Address(PILOT_TERMS.payer).toScAddress(),nonce:xdr.Int64.fromString("42"),signatureExpirationLedger:0,signature:xdr.ScVal.scvVoid()})),
      rootInvocation:new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(op.func.invokeContract()),subInvocations:[]})});
    const fee = String(total-100);
    return {latestLedger:1000,minResourceFee:fee,transactionData:new SorobanDataBuilder().setResourceFee(fee).build().toXDR("base64"),results:[{auth:[entry.toXDR("base64")],xdr:xdr.ScVal.scvVoid().toXDR("base64")}]};
  });
}
test("Bazaar pilot keeps frozen intent, exact USDC terms and mandatory sponsorship",() => {
  assertPilotTerms(); assertPilotChallenge(challenge);
  for (const mutate of [(r:typeof challenge.accepts[0])=>{r.amount="100001";},(r:typeof challenge.accepts[0])=>{r.extra.areFeesSponsored=false;},
    (r:typeof challenge.accepts[0])=>{r.extra.operationId="31c97193-be74-4b9d-b0a3-f3890b0a41e8";}]) {
    const changed = structuredClone(challenge); mutate(changed.accepts[0]); assert.throws(()=>assertPilotChallenge(changed));
  }
});
test("Bazaar pilot validates native SDK unsigned preimage and sponsored fee perimeter without signing",async() => {
  for (const total of [50000,587252,1000000]) { const p = await unsigned(total); assert.equal(new Transaction(p.unsignedTransaction,Networks.TESTNET).fee,String(total)); assertPilotPreimage(p); }
  await assert.rejects(unsigned(1000001),/simulation_rejected/);
  const p = await unsigned(587252), env = new Transaction(p.unsignedTransaction,Networks.TESTNET).toEnvelope();
  env.v1().tx().sourceAccount(xdr.MuxedAccount.keyTypeEd25519(new Address(PILOT_TERMS.payer).toScAddress().accountId().ed25519()));
  assert.throws(()=>assertPilotPreimage({...p,unsignedTransaction:new Transaction(env,Networks.TESTNET).toXDR()}),/transaction_invalid/);
  await assert.rejects(bindPilotSignature(p,Buffer.alloc(64).toString("base64")),/signature_invalid/);
});
test("Bazaar pilot journal uses isolated authenticated encryption and exact owner SQL CAS",async() => {
  const key = ()=>Buffer.alloc(32,9), cipher = pilotCipher("did:privy:synthetic-a",key), sealed = cipher.seal({synthetic:true});
  assert.deepEqual(cipher.open(sealed),{synthetic:true}); assert.throws(()=>pilotCipher("did:privy:synthetic-b",key).open(sealed));
  const statements:Array<{query:string;params:unknown[]}> = [], store = createPilotStore(async(query,params)=>{statements.push({query,params}); return [];});
  const row:PilotRow = {operation_id:PILOT_ID,user_id:"did:privy:synthetic-a",wallet_id:"synthetic-wallet",intent_hash:PILOT_INTENT_HASH,connection_hash:"a".repeat(64),
    state:"challenge-bound",revision:2,nonce_hash:"b".repeat(64),approval_expires_at:new Date().toISOString(),payload_encrypted:sealed,dispatch_digest:null,claimed_at:null};
  await assert.rejects(store.claim(row.user_id,row,"N".repeat(43),"dispatch","c".repeat(64)),/conflict/);
  assert.equal(statements.length,1); assert.equal(statements[0].params[0],PILOT_ID); assert.equal(statements[0].params[1],row.user_id); assert.equal(statements[0].params[6],pilotHash("N".repeat(43)));
  assert.match(statements[0].query,/approval_expires_at>clock_timestamp\(\)/); assert.match(statements[0].query,/revision=\$6 AND nonce_hash=\$7 AND state=\$10/);
});
