import assert from "node:assert/strict";
import test from "node:test";
import { assertBridgeAsset, buildBridgeResearchPlan, describeBridgeRoute, listBridgeRoutes } from "../app/cctp/routes";

const evm = "0x2BAa52Fa82FbFd5d103EB30181Bd0Fa11a04c0d0";
const stellar = "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ";
const solana = "EP4e2aK9EWRNAQvJTgAJ5tQ7qwuiUAfrZozyGFPsesqk";

test("catalogue separates documented routes, partial implementation and blocked BNB in both directions", () => {
  const routes = listBridgeRoutes();
  assert.equal(routes.length, 8);
  assert.equal(new Set(routes.map((route) => route.id)).size, 8);
  assert.equal(routes.filter((route) => route.status === "blocked").length, 2);
  assert.equal(routes.filter((route) => route.status === "implemented_partial").length, 1);
  assert.ok(routes.every((route) => !route.executionEnabled && !route.acceptedOnchain));
  assert.equal(describeBridgeRoute("stellar:testnet", "avalanche:fuji").status, "verified_documentation");
});

test("catalogue rejects Mainnet, arbitrary RPC and non-Stellar routes", () => {
  for (const source of ["base:mainnet", "https://rpc.example", "43113"]) {
    assert.throws(() => describeBridgeRoute(source, "stellar:testnet"));
  }
  assert.throws(() => describeBridgeRoute("base:sepolia", "solana:devnet"));
  assert.throws(() => describeBridgeRoute("stellar:testnet", "stellar:testnet"));
});

test("asset identity rejects same symbol with wrong issuer, USYC and all BNB USDC claims", () => {
  const asset = describeBridgeRoute("base:sepolia", "stellar:testnet").source.asset!;
  assert.doesNotThrow(() => assertBridgeAsset("base:sepolia", "USDC", asset.identifier.toLowerCase()));
  assert.throws(() => assertBridgeAsset("base:sepolia", "USDC", evm));
  assert.throws(() => assertBridgeAsset("base:sepolia", "USYC", asset.identifier));
  assert.throws(() => assertBridgeAsset("bnb:testnet", "USDC", asset.identifier));
  assert.throws(() => assertBridgeAsset("stellar:testnet", "USDC", stellar));
});

test("both directions preserve precise wire units without pretending fees are zero", () => {
  for (const network of ["avalanche:fuji", "base:sepolia", "solana:devnet"]) {
    for (const incoming of [true, false]) {
      const address = network === "solana:devnet" ? solana : evm;
      const plan = buildBridgeResearchPlan({
        source: incoming ? network : "stellar:testnet", destination: incoming ? "stellar:testnet" : network,
        sourceAddress: incoming ? address : stellar, destinationAddress: incoming ? stellar : address,
        amount: "1.000001",
      });
      assert.equal(plan.amountAtomic, "1000001");
      assert.equal(plan.sourceAmountAtomic, incoming ? "1000001" : "10000010");
      assert.equal(plan.destinationAmountBeforeFeesAtomic, incoming ? "10000010" : "1000001");
      assert.equal(plan.quote.fees, null);
      assert.equal(plan.quote.expiresAt, null);
      assert.equal(plan.bazaarPaymentAuthorized, false);
      assert.equal(plan.transactionPrepared, false);
    }
  }
});

test("planner refuses dust rounding, invalid addresses, zero, oversized amounts and blocked routes", () => {
  const input = { source: "base:sepolia", destination: "stellar:testnet", sourceAddress: evm, destinationAddress: stellar, amount: "1" };
  for (const amount of ["0", "0.0000001", "1000001", "-1", "1e6", "NaN"]) {
    assert.throws(() => buildBridgeResearchPlan({ ...input, amount }));
  }
  assert.throws(() => buildBridgeResearchPlan({ ...input, destinationAddress: evm }));
  assert.throws(() => buildBridgeResearchPlan({ ...input, source: "bnb:testnet" }));
});

test("a caller cannot mutate the server catalogue through returned descriptors", () => {
  const route = describeBridgeRoute("base:sepolia", "stellar:testnet");
  route.source.asset!.identifier = evm;
  assert.notEqual(describeBridgeRoute("base:sepolia", "stellar:testnet").source.asset!.identifier, evm);
});
