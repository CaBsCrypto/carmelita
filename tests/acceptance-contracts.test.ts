import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { GET as health } from "../app/api/health/route";
import { GET as mcpDiscovery } from "../app/.well-known/mcp/route";
import { guardX402Execution } from "../app/x402/execution-guard";
import {
  getInternalTestnetFaucetReadiness,
  INTERNAL_TESTNET_USDC_DISTRIBUTOR_ADDRESS,
} from "../app/x402/testnet-faucet";

test("health distinguishes sandbox settlement from live Testnet x402", async () => {
  const response = health();
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.environment, "stellar-testnet");
  assert.equal(body.payments.commerceSandbox, "simulated");
  assert.equal(body.payments.x402StellarTestnet, "enabled");
  assert.equal(body.payments.mainnet, "disabled");
  assert.equal(body.custody.userFunds, false);
});

test("MCP discovery publishes the same payment boundary", async () => {
  const response = mcpDiscovery(new Request("https://agente-asistente.vercel.app/.well-known/mcp"));
  const body = await response.json();
  assert.deepEqual(body.surfaces.personalAgent.scopes, [
    "agent:read",
    "agent:plan",
    "agent:context",
    "agent:conversation",
  ]);
  assert.equal(body.security.payments.commerceSandbox, "simulated");
  assert.equal(body.security.payments.x402StellarTestnet, "explicit-user-approval");
  assert.equal(body.security.payments.mainnet, "disabled");
});

test("x402 execution guard never retries ambiguous states", () => {
  assert.deepEqual(guardX402Execution("prepared"), { action: "execute" });
  assert.deepEqual(guardX402Execution("confirmed"), { action: "replay" });
  assert.deepEqual(guardX402Execution("signing"), {
    action: "reject",
    error: "x402_payment_reconciliation_required",
  });
  assert.deepEqual(guardX402Execution("reconciliation_required"), {
    action: "reject",
    error: "x402_payment_reconciliation_required",
  });
  assert.deepEqual(guardX402Execution("failed"), {
    action: "reject",
    error: "x402_payment_failed_requires_new_review",
  });
});

test("a valid but unexpected distributor secret is rejected", () => {
  const previous = process.env.STELLAR_TESTNET_USDC_DISTRIBUTOR_SECRET;
  process.env.STELLAR_TESTNET_USDC_DISTRIBUTOR_SECRET = Keypair.random().secret();
  try {
    assert.deepEqual(getInternalTestnetFaucetReadiness(), {
      configured: false,
      address: null,
      amount: "0.5000000",
    });
    assert.equal(
      INTERNAL_TESTNET_USDC_DISTRIBUTOR_ADDRESS,
      "GDN5BJPXG64CNOLWOXJEJE3O5V5G4X53HPLFBJDOKONQRZ4URPF7WPFV",
    );
  } finally {
    if (previous === undefined) delete process.env.STELLAR_TESTNET_USDC_DISTRIBUTOR_SECRET;
    else process.env.STELLAR_TESTNET_USDC_DISTRIBUTOR_SECRET = previous;
  }
});
