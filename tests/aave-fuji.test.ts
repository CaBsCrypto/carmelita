import assert from "node:assert/strict";
import test from "node:test";
import {
  AAVE_USDC_FUJI,
  AAVE_V3_FUJI_POOL,
  USDC_EIP712_DOMAIN,
  buildUsdcPermitTypedData,
  encodeAaveSupplyWithPermit,
  encodeAaveWithdraw,
  getUsdcAllowance,
  getUsdcNonce,
  simulateAaveSupplyWithPermit,
  splitPermitSignature,
} from "../app/connectors/aave-fuji";

const TEST_OWNER = "0x1111111111111111111111111111111111111111";
const TEST_SPENDER = AAVE_V3_FUJI_POOL;

test("buildUsdcPermitTypedData produces canonical EIP-712 Permit structure", () => {
  const typedData = buildUsdcPermitTypedData({
    owner: TEST_OWNER,
    spender: TEST_SPENDER,
    valueAtomic: "1000000",
    nonce: "5",
    deadline: 1750000000,
  });

  assert.equal(typedData.domain.name, "USD Coin");
  assert.equal(typedData.domain.version, "2");
  assert.equal(typedData.domain.chainId, 43113);
  assert.equal(typedData.domain.verifyingContract.toLowerCase(), AAVE_USDC_FUJI.toLowerCase());
  assert.equal(typedData.primaryType, "Permit");
  assert.equal(typedData.message.owner, TEST_OWNER);
  assert.equal(typedData.message.spender, TEST_SPENDER);
  assert.equal(typedData.message.value, "1000000");
  assert.equal(typedData.message.nonce, "5");
  assert.equal(typedData.message.deadline, "1750000000");
});

test("splitPermitSignature parses 65-byte hex and normalizes v", () => {
  const rHex = "1".repeat(64);
  const sHex = "2".repeat(64);

  // Case 1: v = 1b (27)
  const sig1 = `0x${rHex}${sHex}1b` as `0x${string}`;
  const split1 = splitPermitSignature(sig1);
  assert.equal(split1.v, 27);
  assert.equal(split1.r, `0x${rHex}`);
  assert.equal(split1.s, `0x${sHex}`);

  // Case 2: v = 0 -> normalized to 27
  const sig0 = `0x${rHex}${sHex}00` as `0x${string}`;
  const split0 = splitPermitSignature(sig0);
  assert.equal(split0.v, 27);

  // Case 3: v = 1 -> normalized to 28
  const sig01 = `0x${rHex}${sHex}01` as `0x${string}`;
  const split01 = splitPermitSignature(sig01);
  assert.equal(split01.v, 28);
});

test("splitPermitSignature rejects malformed signature lengths", () => {
  assert.throws(() => splitPermitSignature("0x1234" as `0x${string}`), /invalid_permit_signature/);
});

test("encodeAaveSupplyWithPermit and encodeAaveWithdraw produce hex calldata", () => {
  const supplyCalldata = encodeAaveSupplyWithPermit({
    amountAtomic: "5000000",
    onBehalfOf: TEST_OWNER,
    referralCode: 0,
    deadline: 1750000000,
    permitV: 27,
    permitR: `0x${"a".repeat(64)}`,
    permitS: `0x${"b".repeat(64)}`,
  });

  assert.ok(supplyCalldata.startsWith("0x"));
  assert.ok(supplyCalldata.length > 100);

  const withdrawCalldata = encodeAaveWithdraw({
    amountAtomic: "5000000",
    to: TEST_OWNER,
  });

  assert.ok(withdrawCalldata.startsWith("0x"));
  assert.ok(withdrawCalldata.length > 50);
});

test("getUsdcNonce and getUsdcAllowance query RPC with ABI decoding", async () => {
  const dummyFetcher: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as { id: number; method: string };
    if (request.method === "eth_call") {
      // 32-byte padded uint256 = 12
      const hexValue = "0x000000000000000000000000000000000000000000000000000000000000000c";
      return Response.json({ jsonrpc: "2.0", id: request.id, result: hexValue });
    }
    throw new Error("unexpected method");
  };

  const nonce = await getUsdcNonce(TEST_OWNER, dummyFetcher);
  assert.equal(nonce, "12");

  const allowance = await getUsdcAllowance(TEST_OWNER, TEST_SPENDER, dummyFetcher);
  assert.equal(allowance, "12");
});

test("simulateAaveSupplyWithPermit catches simulation revert error", async () => {
  const revertingFetcher: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body)) as { id: number };
    return Response.json({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32603, message: "execution reverted: ERC20: transfer amount exceeds allowance" },
    });
  };

  await assert.rejects(
    simulateAaveSupplyWithPermit({
      from: TEST_OWNER,
      calldata: "0x123456",
      fetcher: revertingFetcher,
    }),
    /aave_supply_permit_simulation_reverted/,
  );
});
