import test from "node:test";
import assert from "node:assert/strict";
import { readExistingWorkspaceWallets } from "../app/wallets/existing-workspace";
import { requestWalletBootstrap } from "../app/agent/session-request";

const owner = "did:privy:synthetic-owner";
const wallet = { id: "synthetic-wallet", userId: owner, address: "synthetic-address", chainType: "stellar", network: "stellar:testnet", status: "active" };
test("existing-only workspace loads registered wallets without creating, funding or claiming a balance", async () => {
  const result = await readExistingWorkspaceWallets(owner, async id => { assert.equal(id, owner); return [wallet, {...wallet,id:"foreign-wallet",userId:"did:privy:other"}]; });
  assert.equal(result.wallet?.id, wallet.id); assert.equal(result.wallet?.created, false);
  assert.equal(result.readOnly,true); assert.equal(result.createsWallets,false); assert.equal(result.activatesWallets,false);
  assert.equal(result.account,null); assert.equal(result.activation,"unknown"); assert.equal(result.fundsMoved,false);
  assert(Object.values(result.preparation).every(p => !p.retryable));
});
test("missing or ambiguous registrations never select another owner's wallet or trigger provisioning", async () => {
  const empty=await readExistingWorkspaceWallets(owner,async()=>[{...wallet,userId:"did:privy:other"}]);
  assert.equal(empty.wallet,null); assert.equal(empty.registryStatus,"empty");
  const ambiguous=await readExistingWorkspaceWallets(owner,async()=>[wallet,{...wallet,id:"another-wallet"}]);
  assert.equal(ambiguous.wallet,null); assert.equal(ambiguous.preparation.stellar.status,"conflict");
});
test("existing workspace uses a single GET, no identity refresh or POST",async()=>{
  const calls:string[]=[]; const body=await readExistingWorkspaceWallets(owner,async()=>[wallet]);
  const result=await requestWalletBootstrap(owner,async()=>"synthetic-token",async()=>assert.fail("No provisioned identity refresh"),new AbortController().signal,async(url,init)=>{
    assert.equal(url,"/api/agent/bootstrap");calls.push(init?.method??"");assert.equal(init?.cache,"no-store");return Response.json(body);
  });
  assert.deepEqual(result,body);assert.deepEqual(calls,["GET"]);
});
test("read failures and owner switches cannot fall back to POST provisioning",async()=>{
  for(const [body,status] of [[{error:"existing_wallets_unavailable"},503],[{user:{id:"did:privy:other"},mode:"provisioning-allowed"},200]] as const){
    let calls=0;await assert.rejects(requestWalletBootstrap(owner,async()=>"synthetic-token",async()=>{},new AbortController().signal,async(_url,init)=>{
      assert.equal(++calls,1);assert.equal(init?.method,"GET");return Response.json(body,{status});
    }));assert.equal(calls,1);
  }
});
test("legacy provisioning requires a successful server-selected mode tied to the current owner",async()=>{
  const methods:string[]=[];let refreshed=false;
  await requestWalletBootstrap(owner,async()=>"synthetic-token",async()=>{refreshed=true;},new AbortController().signal,async(_url,init)=>{
    methods.push(init?.method??"");return Response.json(methods.length===1?{user:{id:owner},mode:"provisioning-allowed"}:{user:{id:owner}});
  });assert.deepEqual(methods,["GET","POST"]);assert.equal(refreshed,true);
});
