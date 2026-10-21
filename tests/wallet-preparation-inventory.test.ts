import assert from "node:assert/strict";
import test from "node:test";
import { inspectPreparationInventory, assertIdentitiesPreserved } from "../app/wallets/preparation-inventory";
const user={id:"did:privy:existing",status:"active",normalLogin:false};
const evm={id:"wallet",userId:user.id,address:`0x${"a".repeat(40)}`,chainType:"ethereum"};
test("OAuth-only active profile excluded; existing wallet qualifies",()=>{
 assert.equal(inspectPreparationInventory([user],[],[])[0].excludedReason,"no_onboarding_evidence");
 const row=inspectPreparationInventory([user],[evm],[])[0];
 assert.equal(row.excludedReason,null);assert.deepEqual(row.states,{stellar:"pending",evm:"pending",solana:"pending"});
});
test("complete EVM associations remain complete; duplicate identity conflicts",()=>{
 const bindings=["avalanche:fuji","bnb:testnet","base:sepolia"].map(network=>({walletId:evm.id,userId:user.id,network}));
 assert.equal(inspectPreparationInventory([user],[evm],bindings)[0].states.evm,"complete");
 assert.equal(inspectPreparationInventory([user],[evm,{...evm,id:"other"}],bindings)[0].states.evm,"conflict");
});
test("preservation allows additive wallets, rejects changed owner and presentation",()=>{
 assert.doesNotThrow(()=>assertIdentitiesPreserved([evm],[evm,{...evm,id:"new"}]));
 assert.throws(()=>assertIdentitiesPreserved([evm],[{...evm,userId:"other"}]));
 assert.throws(()=>assertIdentitiesPreserved([evm],[{...evm,address:evm.address.toUpperCase()}]));
});
