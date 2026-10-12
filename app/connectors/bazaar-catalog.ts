import { randomUUID } from "node:crypto";
import { z } from "zod";
import { bazaarPurchaseReadiness, evaluateBazaarServiceReadiness } from "@/app/bazaar/readiness";
import { getStellarBazaarConfig, STELLAR_BAZAAR_DEFAULT_BASE_URL } from "@/app/stellar-bazaar/config";
import { bazaarServiceCardSchema } from "./stellar-bazaar";

export const BAZAAR_CATALOG_ORIGIN = STELLAR_BAZAAR_DEFAULT_BASE_URL;
export const BAZAAR_CATALOG_MAX_BYTES = 256 * 1024;
export const BAZAAR_CATALOG_TIMEOUT_MS = 15_000;
const allowedTools = ["list_workflow_bundles", "get_workflow_bundle", "get_bazaar_skills", "get_service"] as const;
const identifier = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,119}$/);
const searchInput = z.object({
  query: z.string().trim().min(2).max(120).refine(value => !/[\u0000-\u001f\u007f]/.test(value)).optional(),
  limit: z.number().int().min(1).max(20).default(20),
  cursor: z.string().min(1).max(500).refine(value => !/[\u0000-\u001f\u007f]/.test(value)).optional(),
}).strict();
const declaredAvailability = z.object({
  ready: z.boolean().optional(), reason: z.string().max(120).nullable().optional(),
  leaseExpiresAt: z.string().max(100).optional(), pendingLimit: z.number().int().nonnegative().optional(),
  dailyLimit: z.number().int().nonnegative().optional(), mode: z.string().max(80).optional(),
  execution: z.string().max(100).optional(), payment: z.string().max(100).optional(),
});
const purchaseDescriptor = z.object({ protocol: z.string().max(100), orderCreateUrl: z.string().url().max(1000),
  paymentUrlTemplate: z.string().max(1000), statusUrlTemplate: z.string().max(1000), authentication: z.string().max(100), delivery: z.string().max(100) });
const marketEntrySchema = z.object({ submissionId: z.string().min(1).max(200), card: z.unknown(),
  cardHash: z.string().regex(/^[a-f0-9]{64}$/), status: z.string().min(1).max(100),
  execution: z.string().min(1).max(100), availability: declaredAvailability.optional(), purchase: purchaseDescriptor.optional(),
  score: z.number().finite().optional(), reasons: z.array(z.string().max(200)).max(20).optional(),
});
const marketSchema = z.object({ services: z.array(z.unknown()).max(20), nextCursor: z.string().max(500).nullable(),
  partialResults: z.boolean(), paused: z.boolean(), purchasesEnabled: z.boolean(), purchaseAdmission: z.string().max(100) });
const serviceSchema = bazaarServiceCardSchema.extend({
  id: identifier, availability: z.object({ execution: z.string().max(100).optional(), payment: z.string().max(100).optional() }).optional(),
});
const localized = z.object({ es: z.string().min(1).max(2000), en: z.string().min(1).max(2000) });
const bundleStatus = z.enum(["draft", "ready", "running", "awaiting-approval", "partial", "complete", "failed"]);
const aggregateStatus = z.enum(["estimate", "quoted", "partially-paid", "paid"]);
const suiteSummary = z.object({
  id: identifier, version: z.literal("bazaar.workflow-bundle/v1"), title: localized,
  status: bundleStatus, stageCount: z.number().int().min(0).max(50), aggregateStatus,
  execution: z.literal(false),
});
const artifact = z.object({ type: z.string().min(1).max(100), mediaType: z.string().min(1).max(100), schemaVersion: z.string().min(1).max(100) });
const suiteDetail = z.object({
  version: z.literal("bazaar.workflow-bundle/v1"), id: identifier, title: localized, objective: localized,
  services: z.array(z.object({ id: identifier, version: z.string().min(1).max(100) })).min(1).max(50),
  stages: z.array(z.object({ order: z.number().int().min(0).max(49), capability: identifier,
    input: z.array(z.string().max(100)).max(50), outputArtifact: artifact,
    approvalGate: z.boolean().optional(), next: z.number().int().min(0).max(49).optional(),
  })).min(1).max(50),
  status: bundleStatus, aggregatePrice: z.object({ status: aggregateStatus, entries: z.array(z.object({
    provider: z.string().max(200), asset: z.string().max(200), network: z.literal("stellar:testnet"),
    scheme: z.enum(["exact", "upto", "split-exact"]), amount: z.string().regex(/^\d+(?:\.\d{1,7})?$/).max(30),
  })).max(50) }),
});
const skillSchema = z.object({
  role: z.enum(["buyer", "seller", "recovery"]), name: z.string().min(1).max(100),
  download: z.string().regex(/^\/skills\/(?:buyer|seller|recovery)\/SKILL\.md$/),
  prompt: z.string().max(2000), instructions: z.string().max(20_000),
  requirements: z.array(z.string().max(200)).max(20),
});

export type BazaarCatalogOptions = { fetcher?: typeof fetch; timeoutMs?: number; signal?: AbortSignal; refresh?: boolean };
export type BazaarServiceListing = {
  id: string; name: string; description: string; provider: string; kind: "http" | "mcp";
  cardHash: string; submissionId: string; declaredStatus: string; declaredExecution: string;
  declaredAvailability: z.infer<typeof declaredAvailability> | null; purchaseDescriptor: z.infer<typeof purchaseDescriptor> | null;
  network: "stellar:testnet"; input: z.infer<typeof bazaarServiceCardSchema>["input"]; tags: string[];
  payment: z.infer<typeof bazaarServiceCardSchema>["payment"];
  delivery: z.infer<typeof bazaarServiceCardSchema>["delivery"] | null;
  readiness: ReturnType<typeof evaluateBazaarServiceReadiness>; consumable: false; executionEnabled: false;
};
export type BazaarSuiteListing = z.infer<typeof suiteSummary> & {
  executable: false; executionEnabled: false; readiness: ReturnType<typeof evaluateBazaarServiceReadiness>;
  statusEvidence: "provider_declaration"; paymentConfirmed: false;
};
export type BazaarSkillListing = z.infer<typeof skillSchema> & { executable: false; instructionsAre: "untrusted_metadata" };
type ReadState = "ok" | "partial" | "unavailable" | "not_found";
type ReadMetadata = ReturnType<typeof metadata>;
export type BazaarServicesRead = ReadMetadata & {
  services: BazaarServiceListing[]; partialResults: boolean; dynamicRegistry: "available" | "unavailable" | "unknown";
  rejectedCards: number; nextCursor: string | null; paused: boolean | null; purchasesEnabled: boolean | null; purchaseAdmission: string | null;
};
export type BazaarServiceRead = BazaarServicesRead & { service: BazaarServiceListing | null };
export type BazaarSuitesRead = ReadMetadata & { suites: BazaarSuiteListing[]; partialResults: boolean; rejectedCards: number };
export type BazaarSuiteRead = ReadMetadata & { suite: z.infer<typeof suiteDetail> | null; certification: false; statusEvidence: "provider_declaration"; paymentConfirmed: false };
export type BazaarSkillsRead = ReadMetadata & { skills: BazaarSkillListing[] };

function metadata(status: ReadState, code?: string) {
  return { status, ...(code ? { code } : {}), source: "bazaar" as const, sourceUrl: BAZAAR_CATALOG_ORIGIN,
    queriedAt: new Date().toISOString(), readOnly: true as const, executable: false as const,
    executionEnabled: false as const, acceptance: "pending" as const, purchase: bazaarPurchaseReadiness() };
}
function safeCode(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return /^bazaar_(?:disabled|config_invalid|timeout|cancelled|unreachable|http_[1-5]\d{2}|content_type_invalid|response_too_large|response_empty|json_invalid|schema_invalid|rpc_invalid|rpc_tool_error|not_found|tool_unavailable|registry_unavailable)$/.test(code) ? code : "bazaar_unreachable";
}

/** Only these fixed catalog paths are reachable; never dereference a card URL. */
const publicCache = new Map<string, { expires: number; body: unknown }>();
const CACHE_TTL_MS = 60_000;

async function readJson(path: `/api/market/catalog?${string}` | "/api/mcp", options: BazaarCatalogOptions, body?: unknown): Promise<unknown> {
  const config = getStellarBazaarConfig();
  if (!config.enabled) throw new Error(config.reason === "stellar_bazaar_disabled" ? "bazaar_disabled" : "bazaar_config_invalid");
  const url = new URL(path, BAZAAR_CATALOG_ORIGIN);
  if (url.origin !== BAZAAR_CATALOG_ORIGIN || !["/api/market/catalog", "/api/mcp"].includes(url.pathname)) throw new Error("bazaar_config_invalid");
  const cacheKey = url.href;
  const cacheable = url.pathname === "/api/market/catalog" && body === undefined && !options.fetcher && !options.refresh && !options.signal;
  if (cacheable) { const cached = publicCache.get(cacheKey); if (cached && cached.expires > Date.now()) return structuredClone(cached.body); publicCache.delete(cacheKey); }
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort();
  if (options.signal?.aborted) throw new Error("bazaar_cancelled");
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = Math.max(1, Math.min(options.timeoutMs ?? BAZAAR_CATALOG_TIMEOUT_MS, BAZAAR_CATALOG_TIMEOUT_MS));
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("bazaar_timeout")); }, timeout);
  });
  const cancelled = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => {
      if (reader) void reader.cancel().catch(() => {});
      if (options.signal?.aborted) reject(new Error("bazaar_cancelled"));
    }, { once: true });
  });
  try {
    const operation = (async () => {
      const response = await (options.fetcher ?? fetch)(url, { method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (!response.ok) throw new Error(`bazaar_http_${response.status}`);
      if (response.url && new URL(response.url).origin !== BAZAAR_CATALOG_ORIGIN) throw new Error("bazaar_config_invalid");
      if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) throw new Error("bazaar_content_type_invalid");
      if (Number(response.headers.get("content-length")) > BAZAAR_CATALOG_MAX_BYTES) throw new Error("bazaar_response_too_large");
      if (!response.body) throw new Error("bazaar_response_empty");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read(); controller.signal.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > BAZAAR_CATALOG_MAX_BYTES) throw new Error("bazaar_response_too_large");
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new Error("bazaar_json_invalid"); }
    })();
    const value = await Promise.race([operation, deadline, cancelled]);
    if (cacheable && marketSchema.safeParse(value).success) { if (publicCache.size >= 32) publicCache.delete(publicCache.keys().next().value!); publicCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, body: structuredClone(value) }); }
    return value;
  } catch (error) { throw new Error(safeCode(error)); }
  finally { if (timer) clearTimeout(timer); options.signal?.removeEventListener("abort", abort); controller.abort(); }
}

async function readTool(name: (typeof allowedTools)[number], args: Record<string, unknown>, options: BazaarCatalogOptions) {
  if (!(allowedTools as readonly string[]).includes(name)) throw new Error("bazaar_tool_unavailable");
  const id = `carmelita-bazaar-${randomUUID()}`;
  const envelope = z.object({ jsonrpc: z.literal("2.0"), id: z.literal(id), result: z.object({
    structuredContent: z.unknown().optional(), isError: z.boolean().optional(),
    content: z.array(z.object({ type: z.literal("text"), text: z.string().max(BAZAAR_CATALOG_MAX_BYTES) })).max(10).optional(),
  }) }).safeParse(await readJson("/api/mcp", options, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }));
  if (!envelope.success) throw new Error("bazaar_rpc_invalid");
  const result = envelope.data.result;
  let data: unknown = result.structuredContent;
  if (data === undefined) {
    try { data = JSON.parse(result.content?.[0]?.text ?? ""); } catch { throw new Error("bazaar_json_invalid"); }
  }
  if (result.isError) {
    const error = z.object({ code: z.string() }).safeParse(data);
    throw new Error(error.success && ["BUNDLE_NOT_FOUND", "RESOURCE_NOT_FOUND", "NOT_FOUND", "SERVICE_NOT_FOUND"].includes(error.data.code) ? "bazaar_not_found" :
      error.success && error.data.code === "REGISTRY_UNAVAILABLE" ? "bazaar_registry_unavailable" : "bazaar_rpc_tool_error");
  }
  return data;
}

function normalizeService(card: z.infer<typeof serviceSchema>, entry: z.infer<typeof marketEntrySchema>): BazaarServiceListing {
  return { id: card.id, name: card.name, description: card.description, provider: card.provider.name,
    cardHash: entry.cardHash, submissionId: entry.submissionId, declaredStatus: entry.status, declaredExecution: entry.execution,
    declaredAvailability: entry.availability ?? null, purchaseDescriptor: entry.purchase ?? null,
    kind: card.kind, network: card.network, input: card.input, tags: card.tags, payment: card.payment, delivery: card.delivery ?? null,
    readiness: evaluateBazaarServiceReadiness({ published: entry.status === "activated", providerAvailability: entry.availability?.ready === false ? "unavailable" : entry.availability?.execution, kind: "service" }),
    consumable: false, executionEnabled: false };
}
async function readMarket(input: z.infer<typeof searchInput>, options: BazaarCatalogOptions) {
  const params = new URLSearchParams({ limit: String(input.limit) });
  if (input.query) params.set("q", input.query);
  if (input.cursor) params.set("cursor", input.cursor);
  const parsed = marketSchema.safeParse(await readJson(`/api/market/catalog?${params}`, options));
  if (!parsed.success) throw new Error("bazaar_schema_invalid");
  return parsed.data;
}
/** Legacy search consumers receive their existing normalized envelope, fetched
 * from the current market route. No provider URL is contacted or executed. */
export async function readBazaarPublicSearch(query: string, options: BazaarCatalogOptions = {}) {
  const input = searchInput.parse({ query });
  const market = await readMarket(input, options);
  return { ok: true, query: input.query!, ranking: { version: "market-catalog-v1", method: "market-declared-ranking", ai: false },
    results: market.services.map(raw => { const entry = marketEntrySchema.safeParse(raw); return { resource: entry.success && entry.data.status === "activated" ? entry.data.card : {}, score: entry.success ? entry.data.score ?? 0 : 0, reasons: entry.success ? entry.data.reasons ?? [] : [] }; }),
    // The old consumer cannot paginate. Signal partial data whenever another
    // market page exists rather than pretending the first page is exhaustive.
    nextCursor: null, partialResults: market.partialResults || market.nextCursor !== null,
    dynamicRegistry: market.partialResults ? "unavailable" : "available" };
}
export async function listBazaarServices(input: z.input<typeof searchInput> = {}, options: BazaarCatalogOptions = {}): Promise<BazaarServicesRead> {
  const request = searchInput.parse(input);
  try {
    const market = await readMarket(request, options);
    const services: BazaarServiceListing[] = []; const seen = new Set<string>(); let rejectedCards = 0;
    for (const raw of market.services) {
      const entry = marketEntrySchema.safeParse(raw);
      const card = entry.success ? serviceSchema.safeParse(entry.data.card) : null;
      if (!entry.success || !card?.success || entry.data.status !== "activated" || seen.has(card.data.id)) { rejectedCards++; continue; }
      seen.add(card.data.id); services.push(normalizeService(card.data, entry.data));
    }
    if (market.services.length > 0 && services.length === 0) throw new Error("bazaar_schema_invalid");
    const partialResults = market.partialResults || rejectedCards > 0 || market.nextCursor !== null;
    return { ...metadata(partialResults ? "partial" : "ok"), services, partialResults,
      dynamicRegistry: market.partialResults ? "unavailable" : "available", rejectedCards, nextCursor: market.nextCursor,
      paused: market.paused, purchasesEnabled: market.purchasesEnabled, purchaseAdmission: market.purchaseAdmission };
  } catch (error) { return { ...metadata("unavailable", safeCode(error)), services: [], partialResults: true, dynamicRegistry: "unknown", rejectedCards: 0, nextCursor: null, paused: null, purchasesEnabled: null, purchaseAdmission: null }; }
}
export async function getBazaarService(id: string, options: BazaarCatalogOptions = {}): Promise<BazaarServiceRead> {
  identifier.parse(id);
  try {
    const raw = await readTool("get_service", { id }, options);
    const detail = z.object({ resource: z.unknown() }).safeParse(raw);
    const entry = marketEntrySchema.safeParse(detail.success ? { ...(raw as Record<string, unknown>), card: detail.data.resource } : raw);
    const card = entry.success ? serviceSchema.safeParse(entry.data.card) : null;
    if (!entry.success || !card?.success || card.data.id !== id) throw new Error("bazaar_schema_invalid");
    if (entry.data.status !== "activated") throw new Error("bazaar_not_found");
    const service = normalizeService(card.data, entry.data);
    return { ...metadata("ok"), services: [service], service, partialResults: false, dynamicRegistry: "available", rejectedCards: 0, nextCursor: null, paused: null, purchasesEnabled: null, purchaseAdmission: null };
  } catch (error) { const code = safeCode(error); return { ...metadata(code === "bazaar_not_found" ? "not_found" : "unavailable", code), services: [], service: null, partialResults: code !== "bazaar_not_found", dynamicRegistry: "unknown", rejectedCards: 0, nextCursor: null, paused: null, purchasesEnabled: null, purchaseAdmission: null }; }
}

export async function listBazaarSuites(options: BazaarCatalogOptions = {}): Promise<BazaarSuitesRead> {
  try {
    const parsed = z.object({ bundles: z.array(z.unknown()).max(100), partialResults: z.boolean(), nextCursor: z.string().max(500).nullable() }).safeParse(await readTool("list_workflow_bundles", {}, options));
    if (!parsed.success) throw new Error("bazaar_schema_invalid");
    const suites: BazaarSuiteListing[] = []; let rejectedCards = 0;
    for (const item of parsed.data.bundles) {
      const suite = suiteSummary.safeParse(item);
      if (!suite.success) { rejectedCards++; continue; }
      suites.push({ ...suite.data, executable: false, executionEnabled: false, statusEvidence: "provider_declaration", paymentConfirmed: false,
        readiness: evaluateBazaarServiceReadiness({ published: true, kind: "suite" }) });
    }
    if (parsed.data.bundles.length && !suites.length) throw new Error("bazaar_schema_invalid");
    const partialResults = parsed.data.partialResults || rejectedCards > 0 || parsed.data.nextCursor !== null;
    return { ...metadata(partialResults ? "partial" : "ok"), suites, partialResults, rejectedCards };
  } catch (error) { return { ...metadata("unavailable", safeCode(error)), suites: [], partialResults: true, rejectedCards: 0 }; }
}

export async function getBazaarSuite(id: string, options: BazaarCatalogOptions = {}): Promise<BazaarSuiteRead> {
  identifier.parse(id);
  try {
    const parsed = z.object({ bundle: suiteDetail, execution: z.literal(false), certification: z.literal(false) }).safeParse(await readTool("get_workflow_bundle", { id }, options));
    if (!parsed.success || parsed.data.bundle.id !== id) throw new Error("bazaar_schema_invalid");
    return { ...metadata("ok"), suite: parsed.data.bundle, certification: false, statusEvidence: "provider_declaration", paymentConfirmed: false };
  } catch (error) { const code = safeCode(error); return { ...metadata(code === "bazaar_not_found" ? "not_found" : "unavailable", code), suite: null, certification: false, statusEvidence: "provider_declaration", paymentConfirmed: false }; }
}

export async function listBazaarSkills(options: BazaarCatalogOptions = {}): Promise<BazaarSkillsRead> {
  const startedAt = Date.now();
  try {
    const discovery = z.object({ ok: z.literal(true), tools: z.array(z.string().max(100)).max(100) }).safeParse(await readJson("/api/mcp", options));
    if (!discovery.success) throw new Error("bazaar_schema_invalid");
    if (!discovery.data.tools.includes("get_bazaar_skills")) throw new Error("bazaar_tool_unavailable");
    const remaining = Math.min(options.timeoutMs ?? BAZAAR_CATALOG_TIMEOUT_MS, BAZAAR_CATALOG_TIMEOUT_MS) - (Date.now() - startedAt);
    if (remaining <= 0) throw new Error("bazaar_timeout");
    const parsed = z.object({ skills: z.array(skillSchema).max(20) }).safeParse(await readTool("get_bazaar_skills", {}, { ...options, timeoutMs: remaining }));
    if (!parsed.success) throw new Error("bazaar_schema_invalid");
    return { ...metadata("ok"), skills: parsed.data.skills.map(skill => ({ ...skill, executable: false, instructionsAre: "untrusted_metadata" })) };
  } catch (error) { return { ...metadata("unavailable", safeCode(error)), skills: [] }; }
}

/** Shared public-page DTO; no authentication, wallet reads or provider effects. */
export async function readBazaarCatalog(options: BazaarCatalogOptions = {}) {
  const [services, suites, skills] = await Promise.all([listBazaarServices({}, options), listBazaarSuites(options), listBazaarSkills(options)]);
  const statuses = [services.status, suites.status, skills.status];
  const status = statuses.every(value => value === "unavailable") ? "unavailable" : statuses.every(value => value === "ok") ? "ok" : "partial";
  return { ...metadata(status), services, suites, skills };
}
