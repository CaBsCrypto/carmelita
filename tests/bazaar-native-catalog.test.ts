import assert from "node:assert/strict";
import test from "node:test";
import { projectNativeBazaarRead } from "../app/bazaar/native-catalog";
test("native discovery cannot relay an upstream checkout or signature handoff", () => {
  const source = { readOnly: true, purchase: { enabled: false }, services: [{ id: "fixture", payment: { asset: "USDC", amount: "0.01" }, purchaseDescriptor: { createOrderUrl: "https://bazaar.browns.studio/api/market/orders" }, nested: { checkoutUrl: "https://example.invalid/checkout", signingHash: "fixture" } }] };
  const projected = projectNativeBazaarRead(source);
  assert.deepEqual(projected, { readOnly: true, purchase: { enabled: false }, services: [{ id: "fixture", payment: { asset: "USDC", amount: "0.01" }, nested: {} }] });
  assert.ok(source.services[0].purchaseDescriptor); // The web's independently authorized metadata is unchanged.
});
