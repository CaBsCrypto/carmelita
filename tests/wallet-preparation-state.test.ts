import assert from "node:assert/strict";
import test from "node:test";
import { outcomeState, retryDelaySeconds, safePreparationCode } from "../app/wallets/preparation-state";
test("preparation permits initial attempt plus five bounded retries",()=>{
 assert.deepEqual([1,2,3,4,5,6].map(retryDelaySeconds),[60,300,900,3600,14400,null]);
 assert.equal(outcomeState(6,{status:"transient",code:"provider_timeout"}).status,"review");
 assert.equal(outcomeState(6,{status:"transient"}).retryable,true);
});
test("conflicts and review cannot silently become retryable",()=>{
 for(const status of ["conflict","review","complete"] as const) assert.equal(outcomeState(1,{status}).retryable,false);
 assert.equal(outcomeState(1,{status:"complete"}).code,null);
});
test("raw provider text cannot reach stored error code",()=>{
 assert.equal(safePreparationCode("secret provider response"),"preparation_failed");
 assert.equal(safePreparationCode("identity_conflict"),"identity_conflict");
});
