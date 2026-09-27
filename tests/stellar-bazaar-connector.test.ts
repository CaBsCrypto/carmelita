import assert from "node:assert/strict";
import test from "node:test";
import { getStellarBazaarConfig } from "../app/stellar-bazaar/config";

test.beforeEach(() => {
  process.env.STELLAR_BAZAAR_DISCOVERY_ENABLED = "true";
  process.env.STELLAR_BAZAAR_BASE_URL = "https://stellar-bazaar-x402.vercel.app";
});
test.afterEach(() => {
  delete process.env.STELLAR_BAZAAR_DISCOVERY_ENABLED;
  delete process.env.STELLAR_BAZAAR_BASE_URL;
});

test("discovery fails closed before network access unless explicitly enabled at the approved origin", async () => {
  assert.equal(getStellarBazaarConfig({}).enabled, false);
  assert.equal(getStellarBazaarConfig({ STELLAR_BAZAAR_DISCOVERY_ENABLED: "true" }).enabled, false);
  for (const origin of ["https://other.invalid", "http://stellar-bazaar-x402.vercel.app", "https://stellar-bazaar-x402.vercel.app/path"]) {
    assert.equal(getStellarBazaarConfig({ STELLAR_BAZAAR_DISCOVERY_ENABLED: "true", STELLAR_BAZAAR_BASE_URL: origin }).enabled, false);
  }
  delete process.env.STELLAR_BAZAAR_DISCOVERY_ENABLED;
  let calls = 0;
  await assert.rejects(searchStellarBazaar("website", { fetcher: async () => { calls++; throw new Error("unexpected"); } }), /stellar_bazaar_unavailable/);
  assert.equal(calls, 0);
});
import {
  decimalAmountToAtomic,
  normalizeBazaarOffer,
  searchStellarBazaar,
  type BazaarServiceCard,
} from "../app/connectors/stellar-bazaar";
import {
  bazaarSearchResponse,
  bazaarWebsiteIntelligenceCard,
} from "./stellar-bazaar-fixtures";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("searchStellarBazaar converts the listed decimal price exactly", () => {
  assert.equal(decimalAmountToAtomic("0.001").toString(), "10000");
  assert.equal(decimalAmountToAtomic("0.01").toString(), "100000");
  assert.equal(decimalAmountToAtomic("1").toString(), "10000000");
  assert.equal(decimalAmountToAtomic("0.0000001").toString(), "1");
  assert.throws(() => decimalAmountToAtomic("0.12345678"), /stellar_bazaar_amount_invalid/);
  assert.throws(() => decimalAmountToAtomic("1e-3"), /stellar_bazaar_amount_invalid/);
});

test("searchStellarBazaar parses the pinned catalog once and never calls a provider", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse(bazaarSearchResponse());
  };
  const result = await searchStellarBazaar("informe", { fetcher });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith("https://stellar-bazaar-x402.vercel.app/api/discovery/search?query="));
  assert.equal(result.source, "stellar-bazaar");
  assert.equal(result.offers.length, 1);
  assert.equal(result.rejectedCards, 0);
  const [offer] = result.offers;
  assert.equal(offer.amountAtomic, "10000");
  assert.equal(offer.amountDisplay, "0.0010000");
  assert.equal(offer.consumable, true);
  assert.equal(offer.unavailableReason, null);
  assert.equal(offer.network, "stellar:testnet");
});

test("searchStellarBazaar propagates partial catalogs instead of claiming success", async () => {
  const fetcher: typeof fetch = async () =>
    jsonResponse(bazaarSearchResponse({ cards: [], partialResults: true, dynamicRegistry: "unavailable" }));
  const result = await searchStellarBazaar("informe", { fetcher });
  assert.equal(result.offers.length, 0);
  assert.equal(result.partialResults, true);
  assert.equal(result.dynamicRegistry, "unavailable");
});

test("searchStellarBazaar counts malformed cards without hiding valid ones", async () => {
  const fetcher: typeof fetch = async () =>
    jsonResponse(bazaarSearchResponse({
      cards: [
        { resource: bazaarWebsiteIntelligenceCard(), score: 5, reasons: [] },
        { resource: { id: "broken", name: "Missing contract" }, score: 1, reasons: [] },
        { resource: bazaarWebsiteIntelligenceCard({ network: "stellar:pubnet" }), score: 1, reasons: [] },
      ],
    }));
  const result = await searchStellarBazaar("informe", { fetcher });
  assert.equal(result.offers.length, 1);
  assert.equal(result.rejectedCards, 2);
});

test("searchStellarBazaar rejects malformed catalog envelopes", async () => {
  const fetcher: typeof fetch = async () => jsonResponse({ unexpected: true });
  await assert.rejects(
    () => searchStellarBazaar("informe", { fetcher }),
    /stellar_bazaar_invalid_response/,
  );
});

test("searchStellarBazaar reports upstream failures as unavailable", async () => {
  const failing: typeof fetch = async () => new Response("boom", { status: 500 });
  await assert.rejects(() => searchStellarBazaar("informe", { fetcher: failing }), /stellar_bazaar_unavailable/);
  const network: typeof fetch = async () => { throw new Error("network"); };
  await assert.rejects(() => searchStellarBazaar("informe", { fetcher: network }), /stellar_bazaar_unavailable/);
});

test("searchStellarBazaar validates the query bounds locally", async () => {
  const fetcher: typeof fetch = async () => jsonResponse(bazaarSearchResponse());
  await assert.rejects(() => searchStellarBazaar("a", { fetcher }), /stellar_bazaar_query_invalid/);
  await assert.rejects(
    () => searchStellarBazaar("x".repeat(121), { fetcher }),
    /stellar_bazaar_query_invalid/,
  );
});

test("offers without a delivery contract are never consumable", () => {
  const card = bazaarWebsiteIntelligenceCard() as BazaarServiceCard;
  delete (card as { delivery?: unknown }).delivery;
  const offer = normalizeBazaarOffer(card, { score: 5, reasons: [] });
  assert.equal(offer.consumable, false);
  assert.equal(offer.unavailableReason, "delivery_contract_missing");
});

test("payment terms outside the frozen policy mark the offer not consumable", () => {
  const overCap = normalizeBazaarOffer(
    { ...(bazaarWebsiteIntelligenceCard() as BazaarServiceCard), payment: {
      scheme: "exact", asset: "USDC", amount: "0.5",
      destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    } },
    { score: 1, reasons: [] },
  );
  assert.equal(overCap.unavailableReason, "amount_over_spending_cap");
  const upto = normalizeBazaarOffer(
    { ...(bazaarWebsiteIntelligenceCard() as BazaarServiceCard), payment: {
      scheme: "upto", asset: "USDC", amount: "0.001",
      destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    } },
    { score: 1, reasons: [] },
  );
  assert.equal(upto.unavailableReason, "payment_scheme_not_exact");
  const otherAsset = normalizeBazaarOffer(
    { ...(bazaarWebsiteIntelligenceCard() as BazaarServiceCard), payment: {
      scheme: "exact", asset: "EURC", amount: "0.001",
      destination: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    } },
    { score: 1, reasons: [] },
  );
  assert.equal(otherAsset.unavailableReason, "asset_symbol_not_usdc");
});
