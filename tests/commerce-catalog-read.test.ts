import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../db/schema";
import type { Offer } from "../app/domain";
import { getCommerceCatalogOffer, legacyCatalogOffer, searchCommerceCatalog, type CommerceCatalogDependencies } from "../app/commerce-catalog-read";
import { readPublishedServiceOffer, readPublishedServiceOffers } from "../app/services/public-offer-read-store";

const demo: Offer = {
  id: "demo", merchant: "Demo Merchant", title: "Demo workspace", description: "Example only",
  kind: "service", amount: 0, currency: "USDC", network: "offchain-demo", availability: "demo",
};

function fixture() {
  const providers = [{ id: "provider-a", name: "Public Merchant", contact_email: "private-contact", metadata: { token: "private-token" } }];
  const offers = ["published", "draft", "paused", "archived"].map((status) => ({
    id: `${status}-offer`, provider_id: "provider-a", external_id: "private-external-id", status,
    title: "Workspace service", description: "Public description", kind: "service",
    amount: "12.5000000", currency: "USDC", network: "offchain-demo", metadata: { credential: "private-credential" },
  }));
  offers.push({ ...offers[0], id: "published-travel", title: "Hotel search", kind: "travel", amount: "0" });
  const statements: Array<{ query: string; params: unknown[] }> = [];
  const client = Object.assign(async () => { throw new Error("unexpected_query"); }, {
    query: async (query: string, params: unknown[]) => {
      statements.push({ query, params });
      assert.match(query, /^select /, "catalog reads must not issue DDL, inserts, updates or deletes");
      assert.match(query, /inner join "service_providers"/);
      const published = query.match(/"service_offers"\."status" = \$(\d+)/);
      assert.ok(published, "published visibility must be enforced by SQL, not a UI filter");
      assert.equal(params[Number(published[1]) - 1], "published");
      let rows = offers.filter((offer) => offer.status === params[Number(published[1]) - 1]);
      const id = query.match(/"service_offers"\."id" = \$(\d+)/);
      if (id) rows = rows.filter((offer) => offer.id === params[Number(id[1]) - 1]);
      const limit = query.match(/ limit \$(\d+)/);
      if (limit) rows = rows.slice(0, Number(params[Number(limit[1]) - 1]));
      const fields = [...query.slice(7, query.indexOf(" from ")).matchAll(/"([a-z_]+)"\."([a-z_]+)"/g)]
        .map((match) => ({ table: match[1], column: match[2] }));
      assert.equal(fields.length, 8);
      assert.ok(fields.every((field) => !["contact_email", "metadata", "provider_id", "external_id"].includes(field.column)));
      return { rows: rows.map((row) => fields.map((field) => {
        const record = field.table === "service_providers"
          ? providers.find((provider) => provider.id === row.provider_id) : row;
        return (record as Record<string, unknown>)[field.column];
      })) };
    },
  }) as unknown as NeonQueryFunction<false, false>;
  const database = drizzle(client, { schema });
  return { offers, providers, statements, database };
}

function dependencies(data: ReturnType<typeof fixture>, configured = true): CommerceCatalogDependencies {
  return {
    hasDatabase: () => configured, demoOffers: [demo], now: () => new Date("2026-10-01T20:00:00.000Z"),
    listPublished: (query, kind) => readPublishedServiceOffers(query, kind, data.database),
    getPublished: (offerId) => readPublishedServiceOffer(offerId, data.database),
  };
}

test("published catalog search is pure SELECT, filters text/kind and projects public fields only", async () => {
  const data = fixture();
  const before = structuredClone({ offers: data.offers, providers: data.providers });
  const matches = await readPublishedServiceOffers("  PUBLIC MERCHANT  ", "service", data.database);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "published-offer");
  assert.equal(matches[0].amount, 12.5);
  assert.equal(matches[0].availability, "partner_pending");
  assert.doesNotMatch(JSON.stringify(matches), /private-|draft-offer|paused-offer|archived-offer|contact_email|metadata/);
  assert.equal((await readPublishedServiceOffers("HOTEL", undefined, data.database))[0]?.id, "published-travel");
  assert.deepEqual(await readPublishedServiceOffers("unmatched-query", undefined, data.database), []);
  assert.deepEqual({ offers: data.offers, providers: data.providers }, before);
  assert.equal(data.statements.length, 3);
});

test("public detail remains missing for private statuses and nonexistent IDs without creating rows", async () => {
  const data = fixture();
  const before = structuredClone(data.offers);
  const published = await readPublishedServiceOffer("published-offer", data.database);
  assert.equal(published.merchant, "Public Merchant");
  for (const id of ["draft-offer", "paused-offer", "archived-offer", "does-not-exist", ""]) {
    await assert.rejects(readPublishedServiceOffer(id, data.database), /offer_not_found/);
  }
  assert.ok(data.statements.every((statement) => statement.params.at(-1) === 1));
  assert.deepEqual(data.offers, before);
});

test("shared search identifies demos and published providers without claiming execution readiness", async () => {
  const data = fixture();
  const result = await searchCommerceCatalog({}, dependencies(data));
  assert.equal(result.status, "ok");
  assert.deepEqual(result.offers.map((offer) => [offer.id, offer.catalogSource]), [
    ["demo", "built_in_demo"], ["published-offer", "published_provider"], ["published-travel", "published_provider"],
  ]);
  assert.equal(result.publishedCatalogStatus, "available");
  assert.equal(result.demoOfferCount, 1);
  assert.equal(result.publishedOfferCount, 2);
  assert.equal(result.operationalAvailability, "not_established");
  assert.equal(result.readOnly, true);
  assert.equal(result.queriedAt, "2026-10-01T20:00:00.000Z");
  assert.deepEqual(result.authority, { transactionPrepared: false, fundsMoved: false, reservationCreated: false });
  assert.deepEqual((await searchCommerceCatalog({ query: "DEMO", kind: "service" }, dependencies(data))).offers.map((offer) => offer.id), ["demo"]);
});

test("an unconfigured provider catalog returns labelled demos without schema initialization", async () => {
  const data = fixture();
  const result = await searchCommerceCatalog({}, dependencies(data, false));
  assert.equal(result.status, "partial");
  assert.equal(result.publishedCatalogStatus, "not_configured");
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].catalogSource, "built_in_demo");
  const detail = await getCommerceCatalogOffer("demo", dependencies(data, false));
  assert.equal(detail.offer.catalogSource, "built_in_demo");
  assert.equal(detail.status, "partial");
  await assert.rejects(getCommerceCatalogOffer("published-offer", dependencies(data, false)), /offer_not_found/);
  assert.equal(data.statements.length, 0);
});

test("published provider read failures are not silently replaced by a successful demo-only result", async () => {
  const data = fixture();
  const options = { ...dependencies(data), listPublished: async () => { throw new Error("provider-table-unavailable"); } };
  await assert.rejects(searchCommerceCatalog({}, options), /provider-table-unavailable/);
  data.offers[0].amount = "NaN";
  await assert.rejects(readPublishedServiceOffer("published-offer", data.database), /commerce_catalog_invalid_amount/);
});

test("database enum and publication text bounds are validated instead of cast into valid offers", async () => {
  for (const invalid of [
    { kind: "admin" }, { currency: "ETH" }, { network: "ethereum-mainnet" },
    { title: "x".repeat(161) }, { description: "x".repeat(2001) },
    { id: "x".repeat(129) }, { title: "" },
  ]) {
    const data = fixture();
    Object.assign(data.offers[0], invalid);
    await assert.rejects(readPublishedServiceOffers("", undefined, data.database), /commerce_catalog_invalid_offer/);
  }
  for (const amount of ["", "-1", "1000001", "1.12345678", "Infinity"]) {
    const data = fixture();
    data.offers[0].amount = amount;
    await assert.rejects(readPublishedServiceOffers("", undefined, data.database), /commerce_catalog_invalid_amount/);
  }
});

test("legacy projection preserves offer DTOs and cannot expose provider-only properties", async () => {
  const data = fixture();
  const result = await searchCommerceCatalog({}, dependencies(data));
  const legacy = result.offers.map(legacyCatalogOffer);
  assert.deepEqual(legacy[0], demo);
  assert.doesNotMatch(JSON.stringify(legacy), /catalogSource|private-|metadata|queriedAt|provider_id/);
  const published = await getCommerceCatalogOffer("published-offer", dependencies(data));
  assert.equal(published.offer.catalogSource, "published_provider");
  assert.deepEqual(legacy[1], legacyCatalogOffer(published.offer));
  const injected = { ...dependencies(data), getPublished: async () => ({ ...legacy[1], contactEmail: "private-email", token: "private-token" }) };
  assert.doesNotMatch(JSON.stringify(await getCommerceCatalogOffer("published-offer", injected)), /private-email|private-token|contactEmail/);
});

test("existing REST and generic MCP names still delegate through the common public catalog service", async () => {
  const [backend, route, mcp, store] = await Promise.all([
    readFile(new URL("../app/commerce-backend.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/commerce/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/services/public-offer-read-store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(backend, /searchCommerceCatalog\(\{ query, kind \}\)/);
  assert.match(backend, /getOffer: async .*getCommerceCatalogOffer\(id\)/);
  assert.match(route, /backend.searchOffers\(r.nextUrl.searchParams.get\("query"\)/);
  assert.match(mcp, /registerTool\("search_offers"/);
  assert.match(mcp, /registerTool\("get_offer"/);
  assert.doesNotMatch(store, /ensureMcpProviderSchema|providerDb\(|\.insert\(|\.update\(|\.delete\(|CREATE TABLE/);
});
