import { z } from "zod";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { getWalletNetwork } from "@/app/wallets/networks";

export const FUJI_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc" as const;
export const FUJI_CHAIN_ID = 43113 as const;
export const DEFILLAMA_PROTOCOLS_URL = "https://api.llama.fi/protocols" as const;
export const DEFILLAMA_YIELDS_URL = "https://yields.llama.fi/pools" as const;
export const POLYMARKET_GAMMA_URL = "https://gamma-api.polymarket.com" as const;
export const GLACIER_BASE_URL = "https://data-api.avax.network/v1/chains/43113" as const;
export const ROUTESCAN_BASE_URL = "https://api.routescan.io/v2/network/testnet/evm/43113" as const;
// Read-only deployment snapshot verified against the official Aave address book
// and Fuji eth_call on 2026-10-01. Transaction preparation has separate constants
// in aave-fuji.ts and is deliberately unchanged by this reader update.
// https://github.com/bgd-labs/aave-address-book/blob/main/src/ts/AaveV3Fuji.ts
export const AAVE_V3_FUJI_POOL = "0x8B9b2AF4afB389b4a70A474dfD4AdCD4a302bb40" as const;
export const AAVE_V3_FUJI_DATA_PROVIDER = "0xC65cbd1e309Bf0e841Ee6f6E786480598e6a4014" as const;
export const CIRCLE_USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
export const ECOSYSTEM_TIMEOUT_MS = 10_000;
export const ECOSYSTEM_MAX_RESPONSE_BYTES = 512 * 1024;
export const ECOSYSTEM_CATALOG_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

// These existing public catalogs are currently 6–12 MiB. Keep the smaller
// bound for NFT/indexer/quote responses and every other endpoint.
function maximumResponseBytes(url: string) {
  const parsed = new URL(url);
  const publicCatalog = parsed.protocol === "https:" && !parsed.username && !parsed.password && (
    parsed.origin === "https://api.llama.fi" && parsed.pathname === "/protocols" ||
    parsed.origin === "https://yields.llama.fi" && parsed.pathname === "/pools" ||
    parsed.origin === POLYMARKET_GAMMA_URL && parsed.pathname === "/events"
  );
  return publicCatalog ? ECOSYSTEM_CATALOG_MAX_RESPONSE_BYTES : ECOSYSTEM_MAX_RESPONSE_BYTES;
}

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const symbolSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/);

async function readBoundedJson(
  url: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  const maximumBytes = maximumResponseBytes(url);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (
      error.name === "TimeoutError" || error.name === "AbortError"
    )) {
      throw new Error("ecosystem_timeout");
    }
    throw new Error("ecosystem_unreachable");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`ecosystem_http_${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    await response.body?.cancel();
    throw new Error("ecosystem_content_type_invalid");
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximumBytes) {
    await response.body?.cancel();
    throw new Error("ecosystem_response_too_large");
  }
  if (!response.body) throw new Error("ecosystem_response_empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new Error("ecosystem_response_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("ecosystem_json_invalid");
  }
}

async function rpcRead<T>(
  to: string,
  calldata: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(FUJI_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data: calldata }, "latest"],
      }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (
      error.name === "TimeoutError" || error.name === "AbortError"
    )) {
      throw new Error("ecosystem_rpc_timeout");
    }
    throw new Error("ecosystem_rpc_unreachable");
  }
  if (!response.ok) throw new Error(`ecosystem_rpc_http_${response.status}`);
  const payload = await response.json() as {
    result?: string;
    error?: { code: number; message: string };
  };
  if (payload.error) {
    throw new Error(`ecosystem_rpc_failed:${payload.error.message}`);
  }
  if (typeof payload.result !== "string") throw new Error("ecosystem_rpc_result_invalid");
  return payload.result as T;
}

function nowIso() {
  return new Date().toISOString();
}

// --- predictions.sector.read -------------------------------------------------

const llamaProtocolSchema = z.object({
  name: z.string(),
  category: z.string().nullable().optional().default(""),
  chains: z.array(z.string()).optional().default([]),
  tvl: z.number().nullable().optional().default(null),
  chainTvls: z.record(z.string(), z.number().nullable()).nullable().optional(),
  url: z.string().nullable().optional(),
}).passthrough();

const llamaProtocolsSchema = z.array(llamaProtocolSchema).max(20_000);

export async function getPredictionSectorRead(
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS),
) {
  const parsed = llamaProtocolsSchema.safeParse(
    await readBoundedJson(DEFILLAMA_PROTOCOLS_URL, fetcher, signal),
  );
  if (!parsed.success) throw new Error("ecosystem_defillama_protocols_invalid");
  const sector = parsed.data.filter(
    (protocol) => protocol.category?.toLowerCase() === "prediction market",
  );
  const byChain = new Map<string, { protocols: string[]; tvl: number | null }>();
  for (const protocol of sector) {
    for (const chain of protocol.chains) {
      const entry = byChain.get(chain) ?? { protocols: [], tvl: 0 };
      entry.protocols.push(protocol.name);
      // A protocol's global TVL must not be attributed in full to every chain.
      const chainEntry = Object.entries(protocol.chainTvls ?? {}).find(([name]) => name.toLowerCase() === chain.toLowerCase());
      const chainTvl = chainEntry ? chainEntry[1] : protocol.chains.length === 1 ? protocol.tvl : null;
      entry.tvl = entry.tvl === null || chainTvl === null ? null : entry.tvl + chainTvl;
      byChain.set(chain, entry);
    }
  }
  const ranked = [...byChain.entries()]
    .map(([chain, entry]) => ({
      chain,
      protocols: entry.protocols,
      tvl: entry.tvl,
    }))
    .sort((a, b) => a.tvl === null ? b.tvl === null ? a.chain.localeCompare(b.chain) : 1 : b.tvl === null ? -1 : b.tvl - a.tvl);
  const missingTvlProtocols = sector.filter(protocol => protocol.tvl === null).map(protocol => protocol.name);
  return {
    status: missingTvlProtocols.length || ranked.some(row => row.tvl === null) ? "partial" as const : "ok" as const,
    network: "mainnet (read-only)" as const,
    chainId: null,
    source: DEFILLAMA_PROTOCOLS_URL,
    readOnly: true as const,
    fetchedAt: nowIso(),
    totalPredictionTvl: missingTvlProtocols.length ? null : sector.reduce((sum, protocol) => sum + (protocol.tvl ?? 0), 0),
    missingTvlProtocols,
    protocolCount: sector.length,
    byChain: ranked,
    avalanche: ranked.find((row) => row.chain.toLowerCase() === "avalanche") ?? null,
  };
}

// --- predictions.markets.read ------------------------------------------------

const polymarketEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  markets: z.array(z.object({
    id: z.string(),
    question: z.string().optional(),
    outcomePrices: z.string().optional(),
    active: z.boolean().optional(),
  })).max(1_000),
}).passthrough();

const polymarketEventsSchema = z.array(polymarketEventSchema).max(100);

export async function getPredictionMarketsRead(
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS),
) {
  const url = `${POLYMARKET_GAMMA_URL}/events?closed=false&limit=40&order=volume24hr&ascending=false`;
  const parsed = polymarketEventsSchema.safeParse(
    await readBoundedJson(url, fetcher, signal),
  );
  if (!parsed.success) throw new Error("ecosystem_polymarket_invalid");
  const markets = parsed.data.slice(0, 20).flatMap((event) =>
    (event.markets ?? []).slice(0, 5).map((market) => ({
      eventId: event.id,
      title: event.title,
      question: market.question ?? event.title,
      id: market.id,
      active: Boolean(market.active),
      outcomePrices: market.outcomePrices ?? null,
    })),
  );
  return {
    network: "mainnet (read-only)" as const,
    chainId: null,
    source: POLYMARKET_GAMMA_URL,
    readOnly: true as const,
    fetchedAt: nowIso(),
    venue: "Polymarket Gamma",
    markets,
  };
}

// --- defillama.yields.read ---------------------------------------------------

const yieldPoolSchema = z.object({
  chain: z.string(),
  project: z.string(),
  symbol: z.string(),
  tvlUsd: z.number(),
  apy: z.number().nullable().optional().default(null),
  apyBase: z.number().nullable().optional(),
  apyReward: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
}).passthrough();

const yieldPoolsSchema = z.array(yieldPoolSchema).max(50_000);

export async function getDefiLlamaYieldsRead(
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS),
) {
  const raw = await readBoundedJson(DEFILLAMA_YIELDS_URL, fetcher, signal);
  const data = (raw && typeof raw === "object" && "data" in raw ? (raw as { data: unknown }).data : raw);
  const parsed = yieldPoolsSchema.safeParse(data);
  if (!parsed.success) throw new Error("ecosystem_defillama_yields_invalid");
  const avalanche = parsed.data
    .filter((pool) => pool.chain.toLowerCase() === "avalanche")
    .sort((a, b) => a.apy === null ? b.apy === null ? 0 : 1 : b.apy === null ? -1 : b.apy - a.apy)
    .slice(0, 20);
  return {
    network: "mainnet (read-only)" as const,
    chainId: null,
    source: DEFILLAMA_YIELDS_URL,
    readOnly: true as const,
    fetchedAt: nowIso(),
    chain: "avalanche",
    pools: avalanche.map((pool) => ({
      project: pool.project,
      symbol: pool.symbol,
      tvlUsd: pool.tvlUsd,
      apy: pool.apy,
      apyBase: pool.apyBase ?? null,
      apyReward: pool.apyReward ?? null,
      url: pool.url ?? null,
    })),
  };
}

// --- avalanche.aave.market.read / position.read ------------------------------

const reserveConfigurationAbi = [{
  type: "function",
  name: "getReserveConfigurationData",
  stateMutability: "view",
  inputs: [{ name: "asset", type: "address" }],
  outputs: [
    { name: "decimals", type: "uint256" },
    { name: "ltv", type: "uint256" },
    { name: "liquidationThreshold", type: "uint256" },
    { name: "liquidationBonus", type: "uint256" },
    { name: "reserveFactor", type: "uint256" },
    { name: "usageAsCollateralEnabled", type: "bool" },
    { name: "borrowingEnabled", type: "bool" },
    { name: "stableBorrowRateEnabled", type: "bool" },
    { name: "isActive", type: "bool" },
    { name: "isFrozen", type: "bool" },
  ],
}] as const;

const reserveDataAbi = [{
  type: "function",
  name: "getReserveData",
  stateMutability: "view",
  inputs: [{ name: "asset", type: "address" }],
  outputs: [{
    name: "",
    type: "tuple",
    components: [
      { name: "configuration", type: "uint256" },
      { name: "liquidityIndex", type: "uint128" },
      { name: "currentLiquidityRate", type: "uint128" },
      { name: "variableBorrowIndex", type: "uint128" },
      { name: "currentVariableBorrowRate", type: "uint128" },
      { name: "currentStableBorrowRate", type: "uint128" },
      { name: "lastUpdateTimestamp", type: "uint40" },
      { name: "id", type: "uint16" },
      { name: "aTokenAddress", type: "address" },
      { name: "stableDebtTokenAddress", type: "address" },
      { name: "variableDebtTokenAddress", type: "address" },
      { name: "interestRateStrategyAddress", type: "address" },
      { name: "accruedToTreasury", type: "uint128" },
      { name: "unbacked", type: "uint128" },
      { name: "isolationModeTotalDebt", type: "uint128" },
    ],
  }],
}] as const;

const balanceOfAbi = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

type ReserveData = {
  aTokenAddress: `0x${string}`;
  currentLiquidityRate: bigint;
  currentVariableBorrowRate: bigint;
  lastUpdateTimestamp: number;
  id: number;
  isActive: boolean;
  isFrozen: boolean;
  borrowingEnabled: boolean;
  decimals: number;
  ltv: number;
  liquidityRateBps: number;
};

async function readReserve(
  asset: `0x${string}`,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<ReserveData> {
  const configCalldata = encodeFunctionData({
    abi: reserveConfigurationAbi,
    functionName: "getReserveConfigurationData",
    args: [asset],
  });
  const dataCalldata = encodeFunctionData({
    abi: reserveDataAbi,
    functionName: "getReserveData",
    args: [asset],
  });
  const [configHex, dataHex] = await Promise.all([
    rpcRead<string>(AAVE_V3_FUJI_DATA_PROVIDER, configCalldata, fetcher, signal),
    rpcRead<string>(AAVE_V3_FUJI_POOL, dataCalldata, fetcher, signal),
  ]);
  const config = decodeFunctionResult({
    abi: reserveConfigurationAbi,
    functionName: "getReserveConfigurationData",
    data: configHex as `0x${string}`,
  });
  const data = decodeFunctionResult({
    abi: reserveDataAbi,
    functionName: "getReserveData",
    data: dataHex as `0x${string}`,
  });
  const decimals = config[0];
  const ltv = config[1];
  const borrowingEnabled = config[6];
  const isActive = config[8];
  const isFrozen = config[9];
  const {
    currentLiquidityRate,
    currentVariableBorrowRate,
    lastUpdateTimestamp,
    id,
    aTokenAddress,
  } = data;
  const RAY = BigInt(10) ** BigInt(27);
  return {
    aTokenAddress,
    currentLiquidityRate,
    currentVariableBorrowRate,
    lastUpdateTimestamp: Number(lastUpdateTimestamp),
    id: Number(id),
    isActive,
    isFrozen,
    borrowingEnabled,
    decimals: Number(decimals),
    ltv: Number(ltv),
    liquidityRateBps: Number(currentLiquidityRate * BigInt(10_000) / RAY),
  };
}

const aaveReserveAssets = [
  { symbol: "USDC", address: CIRCLE_USDC_FUJI },
  { symbol: "EURC", address: "0x5E44db7996c682E92a960b65AC713a54AD815c6B" },
  { symbol: "WAVAX", address: "0xd00ae08403B9bbb9124bB305C09058E32C39A48c" },
  { symbol: "USDX", address: "0x22913D4E21D44EF7662B118A6540450e25fE09a9" },
] as const;

export async function getAaveFujiMarketRead(
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS),
) {
  const reserves = await Promise.all(
    aaveReserveAssets.map(async ({ symbol, address }) => {
      const reserve = await readReserve(address, fetcher, signal);
      return {
        symbol,
        ...reserve,
        // Raw ray values need exact decimal strings in both JSON adapters.
        currentLiquidityRate: reserve.currentLiquidityRate.toString(),
        currentVariableBorrowRate: reserve.currentVariableBorrowRate.toString(),
      };
    }),
  );
  return {
    network: "avalanche:fuji" as const,
    chainId: FUJI_CHAIN_ID,
    source: `${getWalletNetwork("avalanche:fuji").explorerUrl}/address/${AAVE_V3_FUJI_POOL}`,
    readOnly: true as const,
    fetchedAt: nowIso(),
    pool: AAVE_V3_FUJI_POOL,
    reserves,
  };
}

export async function getAaveFujiPositionRead(
  walletAddress: string,
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS),
) {
  const wallet = addressSchema.parse(walletAddress);
  const rows = await Promise.all(
    aaveReserveAssets.map(async ({ symbol, address }) => {
      const reserve = await readReserve(address, fetcher, signal);
      const balanceCalldata = encodeFunctionData({
        abi: balanceOfAbi,
        functionName: "balanceOf",
        args: [wallet as `0x${string}`],
      });
      const balanceHex = await rpcRead<string>(
        reserve.aTokenAddress,
        balanceCalldata,
        fetcher,
        signal,
      );
      const balance = decodeFunctionResult({
        abi: balanceOfAbi,
        functionName: "balanceOf",
        data: balanceHex as `0x${string}`,
      });
      return {
        symbol,
        aTokenAddress: reserve.aTokenAddress,
        aTokenBalance: balance.toString(),
        liquidityRateBps: reserve.liquidityRateBps,
        isActive: reserve.isActive,
        isFrozen: reserve.isFrozen,
      };
    }),
  );
  const supplied = rows
    .filter((row) => BigInt(row.aTokenBalance) > BigInt(0))
    .map((row) => row.symbol);
  return {
    network: "avalanche:fuji" as const,
    chainId: FUJI_CHAIN_ID,
    source: getWalletNetwork("avalanche:fuji").explorerUrl,
    readOnly: true as const,
    fetchedAt: nowIso(),
    wallet,
    rows,
    supplied,
  };
}

// --- avalanche.nft.* ---------------------------------------------------------

const glacierCollectionSchema = z.object({
  address: addressSchema,
  ercType: z.enum(["ERC-721", "ERC-1155"]),
  name: z.string().max(500).optional(),
  symbol: z.string().max(100).optional(),
});

const nftTokenId = z.string().regex(/^\d{1,78}$/);

const glacierTokenSchema = z.object({
  address: addressSchema,
  ercType: z.enum(["ERC-721", "ERC-1155"]),
  tokenId: nftTokenId,
  ownerAddress: addressSchema.optional(),
});

const glacierTokenPageSchema = z.object({
  tokens: z.array(glacierTokenSchema).max(50),
  nextPageToken: z.string().max(4096).optional(),
});

const glacierTransferSchema = z.object({
  from: z.object({ address: addressSchema }),
  to: z.object({ address: addressSchema }),
  txHash: z.string().regex(/^0x[\da-fA-F]{64}$/),
  blockTimestamp: z.number().int().nonnegative().max(8_640_000_000_000),
  blockNumber: z.string().regex(/^\d{1,78}$/),
  erc721Token: glacierTokenSchema.optional(),
  erc1155Token: glacierTokenSchema.optional(),
}).refine((transfer) => Boolean(transfer.erc721Token) !== Boolean(transfer.erc1155Token));

const glacierTransferPageSchema = z.object({
  transfers: z.array(glacierTransferSchema).max(20),
  nextPageToken: z.string().max(4096).optional(),
});

const routescanTransferPageSchema = z.object({
  items: z.array(z.object({
    chainId: z.literal("43113"),
    tokenAddress: addressSchema,
    tokenId: nftTokenId,
    from: addressSchema,
    to: addressSchema,
    blockNumber: z.number().int().nonnegative().safe(),
    logIndex: z.number().int().nonnegative().safe().optional().default(0),
  })).max(20),
});

function sameNftCollection(actual: string, expected: string) {
  return actual.toLowerCase() === expected.toLowerCase();
}

function collectionAddress(value: string) {
  return addressSchema.parse(value);
}

export async function getNftCollectionRead(
  collection: string,
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS),
) {
  const address = collectionAddress(collection);
  // Official Data API contract metadata; /networks/fuji/collections is not an API route.
  const url = `${GLACIER_BASE_URL}/addresses/${address}`;
  const parsed = glacierCollectionSchema.safeParse(
    await readBoundedJson(url, fetcher, signal),
  );
  if (!parsed.success || !sameNftCollection(parsed.data.address, address)) {
    throw new Error("ecosystem_glacier_collection_invalid");
  }
  return {
    network: "avalanche:fuji" as const,
    chainId: FUJI_CHAIN_ID,
    source: url,
    readOnly: true as const,
    fetchedAt: nowIso(),
    collection: address,
    name: parsed.data.name ?? null,
    symbol: parsed.data.symbol ?? null,
    ercType: parsed.data.ercType,
    // This endpoint returns metadata, not collection supply or holder totals.
    totalSupply: null,
    owners: null,
    attributes: null as null | unknown[],
  };
}

export async function getNftHolderDistribution(
  collection: string,
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS),
) {
  const address = collectionAddress(collection);
  // The Data API has no collection /holders endpoint. Derive a bounded,
  // explicitly labelled sample from the official NFT token listing instead.
  const url = `${GLACIER_BASE_URL}/nfts/collections/${address}/tokens?pageSize=50`;
  const parsed = glacierTokenPageSchema.safeParse(
    await readBoundedJson(url, fetcher, signal),
  );
  if (!parsed.success || parsed.data.tokens.some((token) => !sameNftCollection(token.address, address))
    || new Set(parsed.data.tokens.map((token) => token.tokenId)).size !== parsed.data.tokens.length) {
    throw new Error("ecosystem_glacier_holders_invalid");
  }
  const counts = new Map<string, { address: string; tokenCount: number }>();
  for (const token of parsed.data.tokens) {
    // ERC-1155 metadata does not identify a unique holder. Never infer one.
    if (token.ercType !== "ERC-721" || !token.ownerAddress) continue;
    const key = token.ownerAddress.toLowerCase();
    const holder = counts.get(key) ?? { address: token.ownerAddress, tokenCount: 0 };
    holder.tokenCount += 1;
    counts.set(key, holder);
  }
  const holders = [...counts.values()];
  const total = holders.reduce((sum, holder) => sum + holder.tokenCount, 0);
  const top = holders
    .sort((a, b) => b.tokenCount - a.tokenCount)
    .slice(0, 10)
    .map((holder) => ({
      address: holder.address,
      tokenCount: holder.tokenCount,
      sharePct: Number((holder.tokenCount / total * 100).toFixed(2)),
    }));
  return {
    network: "avalanche:fuji" as const,
    chainId: FUJI_CHAIN_ID,
    source: url,
    readOnly: true as const,
    fetchedAt: nowIso(),
    collection: address,
    status: parsed.data.tokens.length && total === 0 ? "unavailable" as const : "partial" as const,
    holderCount: null,
    sampledHolderCount: holders.length,
    sampledTokenCount: parsed.data.tokens.length,
    tokensWithKnownOwner: total,
    hasMore: Boolean(parsed.data.nextPageToken),
    coverage: "first_page_indexed_erc721_tokens" as const,
    shareDenominator: "sampled_tokens_with_known_owner" as const,
    top,
  };
}

export async function getNftProvenanceRead(
  collection: string,
  tokenId: string,
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS),
) {
  const address = collectionAddress(collection);
  const requestedTokenId = BigInt(z.string().regex(/^\d{1,20}$/).parse(tokenId)).toString();
  const tokenUrl = `${GLACIER_BASE_URL}/nfts/collections/${address}/tokens/${requestedTokenId}`;
  const transfersUrl = `${GLACIER_BASE_URL}/tokens/${address}/transfers?pageSize=20`;
  const [tokenResult, transfersResult] = await Promise.all([
    readBoundedJson(tokenUrl, fetcher, signal),
    readBoundedJson(transfersUrl, fetcher, signal),
  ]);
  const token = glacierTokenSchema.safeParse(tokenResult);
  const transfers = glacierTransferPageSchema.safeParse(transfersResult);
  if (!token.success || !sameNftCollection(token.data.address, address) || token.data.tokenId !== requestedTokenId) {
    throw new Error("ecosystem_glacier_token_invalid");
  }
  if (!transfers.success || transfers.data.transfers.some((transfer) => {
    const nft = transfer.erc721Token ?? transfer.erc1155Token!;
    return !sameNftCollection(nft.address, address);
  })) throw new Error("ecosystem_glacier_transfers_invalid");

  // Cross-check: the Routescan mirror should agree on ownership.
  let routescanOwner: string | null = null;
  let mirrorAvailable = false;
  try {
    if (token.data.ercType === "ERC-721") {
      const mirrorUrl = `${ROUTESCAN_BASE_URL}/erc721-transfers?tokenAddress=${address}&tokenId=${requestedTokenId}&sort=desc&limit=20`;
      const mirror = routescanTransferPageSchema.safeParse(await readBoundedJson(mirrorUrl, fetcher, signal));
      if (mirror.success && mirror.data.items.every((item) => sameNftCollection(item.tokenAddress, address)
        && item.tokenId === requestedTokenId)) {
        mirrorAvailable = true;
        const latest = [...mirror.data.items].sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)[0];
        routescanOwner = latest?.to ?? null;
      }
    }
  } catch {
    // Preserve the primary result and expose that the independent mirror is missing.
  }

  const history = transfers.data.transfers.filter((transfer) =>
    (transfer.erc721Token ?? transfer.erc1155Token!).tokenId === requestedTokenId,
  ).map((transfer) => ({
    from: transfer.from.address,
    to: transfer.to.address,
    tokenId: requestedTokenId,
    txHash: transfer.txHash,
    blockTimestamp: new Date(transfer.blockTimestamp * 1000).toISOString(),
    blockNumber: transfer.blockNumber,
  }));
  const glacierOwner = token.data.ercType === "ERC-721" ? token.data.ownerAddress ?? null : null;
  return {
    network: "avalanche:fuji" as const,
    chainId: FUJI_CHAIN_ID,
    source: [GLACIER_BASE_URL, ROUTESCAN_BASE_URL].join(" + "),
    readOnly: true as const,
    fetchedAt: nowIso(),
    collection: address,
    tokenId: requestedTokenId,
    ercType: token.data.ercType,
    owner: glacierOwner,
    routescanOwner,
    indexersAgree: glacierOwner !== null && routescanOwner !== null
      ? glacierOwner.toLowerCase() === routescanOwner.toLowerCase()
      : null,
    mirrorAvailable,
    historyCoverage: "first_page_collection_transfers_filtered_by_token" as const,
    scannedTransferCount: transfers.data.transfers.length,
    hasMoreCollectionTransfers: Boolean(transfers.data.nextPageToken),
    history,
  };
}

export async function getNftVenueStatus(
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS),
) {
  // Static, documented analysis of the Fuji NFT venues. Re-probed via
  // eth_call on 2026-07-31; the whitelist reads below are live, not assumed.
  const seaportFuji = "0x0000000000000068F116a894984e2DB1123eB395";
  const joepegsStrategy = "0xdb9660c436dec824b379c59e2411c71f548f76a7";
  const isStrategyWhitelistedAbi = [{
    type: "function",
    name: "isStrategyWhitelisted",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  }] as const;
  let seaportDeployed = false;
  let joepegsStrategyWhitelisted = false;
  try {
    const codeHex = await rpcRead<string>(
      seaportFuji,
      "0x",
      fetcher,
      signal,
    );
    seaportDeployed = codeHex.length > 2;
  } catch {
    seaportDeployed = false;
  }
  try {
    const calldata = encodeFunctionData({
      abi: isStrategyWhitelistedAbi,
      functionName: "isStrategyWhitelisted",
      args: [joepegsStrategy as `0x${string}`],
    });
    const resultHex = await rpcRead<string>(
      "0x06f90fd0cf697775b66cb51fbaa62c6a5b70eef6",
      calldata,
      fetcher,
      signal,
    );
    const whitelisted = decodeFunctionResult({
      abi: isStrategyWhitelistedAbi,
      functionName: "isStrategyWhitelisted",
      data: resultHex as `0x${string}`,
    });
    joepegsStrategyWhitelisted = whitelisted;
  } catch {
    joepegsStrategyWhitelisted = false;
  }
  return {
    network: "avalanche:fuji" as const,
    chainId: FUJI_CHAIN_ID,
    source: "eth_call against live Fuji contracts",
    readOnly: true as const,
    fetchedAt: nowIso(),
    seaport1_6: {
      address: seaportFuji,
      deployed: seaportDeployed,
      // Immutable contract; safe write path. Commercially dead on Fuji.
      activity: "zero trades since 2023-09-22",
    },
    joepegs: {
      strategyWhitelisted: joepegsStrategyWhitelisted,
      // Proxy is upgradeable by an unmaintained EOA; read-only analysis kept.
      caveat: "upgradeable by a single unmaintained EOA",
      activity: "no trades since 2025-06-15",
    },
  };
}

// --- lfj.swap.quote.read (liveness only) -------------------------------------

const lfjQuoteSchema = z.object({
  price: z.union([z.string(), z.number()]).optional(),
  amountOut: z.union([z.string(), z.number()]).optional(),
  routes: z.array(z.unknown()).optional(),
}).passthrough();

export async function getLfjQuoteRead(
  input: { amountIn: string; assetIn: string; assetOut: string },
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = AbortSignal.timeout(ECOSYSTEM_TIMEOUT_MS),
) {
  const amount = z.string().trim().regex(/^\d+(?:\.\d{1,18})?$/).parse(input.amountIn);
  const assetIn = symbolSchema.parse(input.assetIn);
  const assetOut = symbolSchema.parse(input.assetOut);
  const url = `https://api.lfj.gg/swap/v1/quote?amountIn=${amount}&assetIn=${assetIn}&assetOut=${assetOut}&network=avalanche&fuji=true`;
  const parsed = lfjQuoteSchema.safeParse(
    await readBoundedJson(url, fetcher, signal),
  );
  if (!parsed.success) throw new Error("ecosystem_lfj_quote_invalid");
  const price = parsed.data.price !== undefined
    ? String(parsed.data.price)
    : parsed.data.amountOut !== undefined
      ? String(parsed.data.amountOut)
      : null;
  return {
    network: "avalanche:fuji (liveness only)" as const,
    chainId: FUJI_CHAIN_ID,
    source: "https://api.lfj.gg",
    readOnly: true as const,
    fetchedAt: nowIso(),
    assetIn,
    assetOut,
    amountIn: amount,
    // Liveness, never a price claim: LFJ quotes its own test USDC, not Circle.
    price,
    livenessNote: "liveness check only; LFJ output token is not Circle USDC",
  };
}
