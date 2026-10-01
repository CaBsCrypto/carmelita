import assert from "node:assert/strict";
import test from "node:test";
import {
  GLACIER_BASE_URL,
  ROUTESCAN_BASE_URL,
  getNftCollectionRead,
  getNftHolderDistribution,
  getNftProvenanceRead,
} from "../app/connectors/avalanche-ecosystem";

// Controlled fixtures use the documented Data API / Routescan shapes.
// They do not establish real-user or provider acceptance.
const collection = `0x${"1".repeat(40)}`;
const owner = `0x${"a".repeat(40)}`;
const otherOwner = `0x${"b".repeat(40)}`;
const zeroAddress = `0x${"0".repeat(40)}`;
const hash = `0x${"c".repeat(64)}`;
const token = (tokenId = "0", ownerAddress: string | undefined = owner) => ({
  address: collection, ercType: "ERC-721", tokenId, ownerAddress,
});
const transfer = (tokenId = "0") => ({
  from: { address: zeroAddress }, to: { address: owner }, txHash: hash,
  blockTimestamp: 1686784051, blockNumber: "23097189", erc721Token: token(tokenId),
});
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("NFT metadata uses the official contract route and preserves missing totals", async () => {
  const fetcher: typeof fetch = async (input, options) => {
    assert.equal(String(input), `${GLACIER_BASE_URL}/addresses/${collection}`);
    assert.equal(options?.method, "GET");
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.redirect, "error");
    assert.deepEqual(options?.headers, { accept: "application/json" });
    return json({ address: collection, ercType: "ERC-721", name: "Public NFT", symbol: "NFT", owners: 999 });
  };
  const result = await getNftCollectionRead(collection, fetcher);
  assert.equal(result.name, "Public NFT");
  assert.equal(result.totalSupply, null);
  assert.equal(result.owners, null);
  assert.equal(result.readOnly, true);
  assert.equal(result.chainId, 43113);
});

test("NFT metadata rejects a fungible contract or a different collection", async () => {
  for (const payload of [
    { address: collection, ercType: "ERC-20" },
    { address: owner, ercType: "ERC-721" },
    { name: "Missing identity" },
  ]) {
    await assert.rejects(getNftCollectionRead(collection, async () => json(payload)), /ecosystem_glacier_collection_invalid/);
  }
});

test("holder shares explicitly use at most one indexed token page, not global supply", async () => {
  const result = await getNftHolderDistribution(collection, async (input) => {
    assert.equal(String(input), `${GLACIER_BASE_URL}/nfts/collections/${collection}/tokens?pageSize=50`);
    return json({ tokens: [token("0"), token("1"), token("2", otherOwner), { ...token("3"), ownerAddress: undefined }], nextPageToken: "remaining" });
  });
  assert.equal(result.status, "partial");
  assert.equal(result.holderCount, null);
  assert.equal(result.sampledHolderCount, 2);
  assert.equal(result.sampledTokenCount, 4);
  assert.equal(result.tokensWithKnownOwner, 3);
  assert.equal(result.hasMore, true);
  assert.equal(result.shareDenominator, "sampled_tokens_with_known_owner");
  assert.deepEqual(result.top, [
    { address: owner, tokenCount: 2, sharePct: 66.67 },
    { address: otherOwner, tokenCount: 1, sharePct: 33.33 },
  ]);
});

test("holder reads do not invent ERC1155 owners or a concentration", async () => {
  const result = await getNftHolderDistribution(collection, async () => json({
    tokens: [{ address: collection, ercType: "ERC-1155", tokenId: "0" }],
  }));
  assert.equal(result.status, "unavailable");
  assert.equal(result.holderCount, null);
  assert.equal(result.tokensWithKnownOwner, 0);
  assert.deepEqual(result.top, []);
});

test("holder reads reject foreign collections, duplicate tokens and oversized pages", async () => {
  for (const tokens of [
    [{ ...token(), address: owner }],
    [token(), token()],
    Array.from({ length: 51 }, (_, index) => token(String(index))),
  ]) await assert.rejects(getNftHolderDistribution(collection, async () => json({ tokens })), /ecosystem_glacier_holders_invalid/);
});

test("provenance uses documented routes, filters token identity and compares the latest mirror transfer", async () => {
  const requests: string[] = [];
  const result = await getNftProvenanceRead(collection, "0", async (input) => {
    const url = String(input);
    requests.push(url);
    if (url === `${GLACIER_BASE_URL}/nfts/collections/${collection}/tokens/0`) return json(token());
    if (url === `${GLACIER_BASE_URL}/tokens/${collection}/transfers?pageSize=20`) return json({
      transfers: [transfer("1"), transfer("0")], nextPageToken: "older_contract_events",
    });
    assert.equal(url, `${ROUTESCAN_BASE_URL}/erc721-transfers?tokenAddress=${collection}&tokenId=0&sort=desc&limit=20`);
    return json({ items: [
      { chainId: "43113", tokenAddress: collection, tokenId: "0", from: zeroAddress, to: otherOwner, blockNumber: 1 },
      { chainId: "43113", tokenAddress: collection, tokenId: "0", from: otherOwner, to: owner, blockNumber: 2 },
    ] });
  });
  assert.equal(requests.length, 3);
  assert.equal(result.owner, owner);
  assert.equal(result.routescanOwner, owner);
  assert.equal(result.indexersAgree, true);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0]?.tokenId, "0");
  assert.equal(result.history[0]?.blockTimestamp, "2023-06-14T23:07:31.000Z");
  assert.equal(result.scannedTransferCount, 2);
  assert.equal(result.hasMoreCollectionTransfers, true);
});

test("mirror failure or wrong identity never fabricates an ownership match", async () => {
  for (const mirror of [
    json({ statusCode: 401 }, 401),
    json({ items: [{ chainId: "43114", tokenAddress: collection, tokenId: "0", from: zeroAddress, to: owner, blockNumber: 1 }] }),
    json({ items: [{ chainId: "43113", tokenAddress: owner, tokenId: "0", from: zeroAddress, to: owner, blockNumber: 1 }] }),
  ]) {
    const result = await getNftProvenanceRead(collection, "0", async (input) => {
      if (String(input).includes("routescan")) return mirror;
      if (String(input).includes("/transfers")) return json({ transfers: [] });
      return json(token());
    });
    assert.equal(result.owner, owner);
    assert.equal(result.routescanOwner, null);
    assert.equal(result.indexersAgree, null);
    assert.equal(result.mirrorAvailable, false);
  }
});

test("provenance rejects a wrong token response and malformed transfer data", async () => {
  await assert.rejects(getNftProvenanceRead(collection, "0", async (input) =>
    json(String(input).includes("/transfers") ? { transfers: [] } : token("1")),
  ), /ecosystem_glacier_token_invalid/);
  await assert.rejects(getNftProvenanceRead(collection, "0", async (input) =>
    json(String(input).includes("/transfers") ? { transfers: [{ ...transfer(), from: owner }] } : token()),
  ), /ecosystem_glacier_transfers_invalid/);
});

test("NFT token path inputs are bounded decimals and bad inputs make no requests", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return json({}); };
  for (const tokenId of ["../tokens", "-1", "1?token=secret", "1".repeat(21)]) {
    await assert.rejects(getNftProvenanceRead(collection, tokenId, fetcher));
  }
  assert.equal(calls, 0);
});

test("NFT provider authorization and response limits fail closed", async () => {
  await assert.rejects(getNftCollectionRead(collection, async () => json({ error: "Requires API key" }, 401)), /ecosystem_http_401/);
  await assert.rejects(getNftCollectionRead(collection, async () => new Response("{}", {
    headers: { "content-type": "application/json", "content-length": String(512 * 1024 + 1) },
  })), /ecosystem_response_too_large/);
});
