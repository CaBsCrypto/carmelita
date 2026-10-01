import assert from "node:assert/strict";
import test from "node:test";
import { canonicalWatchlistSymbol, parseMarketIntent } from "../app/market-data/intents";

test("market intents parse multiple assets and keep the network separate", () => {
  assert.deepEqual(parseMarketIntent("Consulta el precio de sol, avax y BNB e indica la fuente y la fecha."), { kind: "quotes", assets: [{ query: "SOL" }, { query: "AVAX" }, { query: "BNB" }] });
  assert.deepEqual(parseMarketIntent("precio de USDC en Solana"), { kind: "quotes", assets: [{ query: "USDC", network: "solana" }] });
  assert.deepEqual(parseMarketIntent("Price of SOL AVAX ETH"), { kind: "quotes", assets: [{ query: "SOL" }, { query: "AVAX" }, { query: "ETH" }] });
  assert.deepEqual(parseMarketIntent("Consulte o preço de stellar e pepe"), { kind: "quotes", assets: [{ query: "XLM" }, { query: "pepe" }] });
  assert.deepEqual(parseMarketIntent("precio de Internet Computer"), { kind: "quotes", assets: [{ query: "Internet Computer" }] });
  assert.deepEqual(parseMarketIntent("Price USDC on Solana and ETH"), { kind: "quotes", assets: [{ query: "USDC", network: "solana" }, { query: "ETH" }] });
});

test("market intents preserve canonical IDs and exact contracts", () => {
  assert.deepEqual(parseMarketIntent("Precio coingecko:usd-coin"), { kind: "quotes", assets: [{ coingeckoId: "usd-coin" }] });
  assert.deepEqual(parseMarketIntent("cmc:5426"), { kind: "quotes", assets: [{ cmcId: 5426 }] });
  assert.deepEqual(parseMarketIntent("Price coinmarketcap:5426"), { kind: "quotes", assets: [{ cmcId: 5426 }] });
  assert.deepEqual(parseMarketIntent("coinmarketcap:5426"), { kind: "quotes", assets: [{ cmcId: 5426 }] });
  const address = "0x1234567890123456789012345678901234567890";
  assert.deepEqual(parseMarketIntent(`Precio del contrato ${address} en Base`), { kind: "quotes", assets: [{ network: "base", address }] });
  assert.deepEqual(parseMarketIntent(`Precio ${address}`), { kind: "invalid", reason: "network_required" });
  const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  assert.deepEqual(parseMarketIntent(`Preço ${mint} na Solana`), { kind: "quotes", assets: [{ network: "solana", address: mint }] });
  const issuer = "G" + "A".repeat(55);
  assert.deepEqual(parseMarketIntent(`Precio USDC:${issuer} en Stellar`), { kind: "quotes", assets: [{ query: "USDC", network: "stellar", issuer }] });
});


test("TVL and chain token market capitalization are different intents", () => {
  assert.deepEqual(parseMarketIntent("¿Cuáles son las redes con mayor TVL?"), { kind: "chains", input: { sortBy: "tvl", limit: 10 } });
  assert.deepEqual(parseMarketIntent("Compara TVL de Solana, Base y Avalanche"), { kind: "chains", input: { chains: ["solana", "base", "avalanche"], sortBy: "tvl", limit: 10 } });
  assert.deepEqual(parseMarketIntent("Top 5 redes por capitalización de mercado"), { kind: "chains", input: { sortBy: "marketCap", limit: 5 } });
  assert.deepEqual(parseMarketIntent("precio de Base"), { kind: "clarify", reason: "network_not_token" });
  assert.deepEqual(parseMarketIntent("capitalización de SOL"), { kind: "quotes", assets: [{ query: "SOL" }] });
  assert.deepEqual(parseMarketIntent("TVL de Hyperliquid"), { kind: "chains", input: { chains: ["hyperliquid"], sortBy: "tvl", limit: 10 } });
  assert.deepEqual(parseMarketIntent("mayor capitalización de las redes Base y Solana"), { kind: "chains", input: { chains: ["base", "solana"], sortBy: "marketCap", limit: 10 } });
  assert.deepEqual(parseMarketIntent("mayor capitalización de Base y Solana"), { kind: "chains", input: { chains: ["base", "solana"], sortBy: "marketCap", limit: 10 } });
});

test("the real multichain prompts resolve without dropping assets or an issuer", () => {
  assert.deepEqual(parseMarketIntent("¿Cuál es el precio de USDC en Solana?"), { kind: "quotes", assets: [{ query: "USDC", network: "solana" }] });
  assert.deepEqual(parseMarketIntent("Compara Stellar, Solana, Avalanche, Base y BNB por TVL y capitalización"), { kind: "chains", input: { chains: ["stellar", "solana", "avalanche", "base", "bsc"], sortBy: "tvl", limit: 10 } });
  assert.deepEqual(parseMarketIntent("¿Qué redes tienen mayor capitalización de mercado?"), { kind: "chains", input: { sortBy: "marketCap", limit: 10 } });
  assert.deepEqual(parseMarketIntent("Precio de pepe"), { kind: "quotes", assets: [{ query: "pepe" }] });
  const issuer = "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA";
  assert.deepEqual(parseMarketIntent(`precio de AQUA en Stellar emisor ${issuer}`), { kind: "quotes", assets: [{ query: "AQUA", network: "stellar", issuer }] });
});

test("basic ticker analysis uses read-only market data", () => {
  assert.deepEqual(parseMarketIntent("Analiza SOL"), { kind: "quotes", assets: [{ query: "SOL" }] });
  assert.deepEqual(parseMarketIntent("Analiza los tickers SOL y AVAX"), { kind: "quotes", assets: [{ query: "SOL" }, { query: "AVAX" }] });
  assert.deepEqual(parseMarketIntent("Analyze Solana"), { kind: "quotes", assets: [{ query: "SOL" }] });
  assert.deepEqual(parseMarketIntent("Analise o token PEPE"), { kind: "quotes", assets: [{ query: "PEPE" }] });
  assert.equal(parseMarketIntent("Analiza un swap SOL a USDC"), null);
});

test("a test network is never silently converted to Mainnet market data", () => {
  for (const message of ["Precio SOL en Solana devnet", "Precio AVAX en Fuji", "Price ETH on Sepolia", "TVL de Solana Testnet"]) assert.deepEqual(parseMarketIntent(message), { kind: "invalid", reason: "testnet_market" });
  assert.deepEqual(parseMarketIntent("Precio SOL en Solana Mainnet"), { kind: "quotes", assets: [{ query: "SOL", network: "solana" }] });
  assert.equal(parseMarketIntent("Consulta los saldos de Solana devnet"), null);
});

test("limits are explicit and wallet or financial operations retain their routes", () => {
  assert.deepEqual(parseMarketIntent("precio " + Array.from({ length: 11 }, (_, i) => "T" + i).join(",")), { kind: "invalid", reason: "too_many_assets" });
  assert.deepEqual(parseMarketIntent("top 21 redes por TVL"), { kind: "invalid", reason: "too_many_chains" });
  for (const message of ["Cotiza un swap SOL a USDC", "Show wallet balances", "Precio del swap en Pangolin", "Envía 2 SOL al precio actual", "Adicione SOL à watchlist"]) assert.equal(parseMarketIntent(message), null);
});

test("watchlist only accepts one canonical asset without a contract", () => {
  assert.equal(canonicalWatchlistSymbol("Add Avalanche to my watchlist"), "AVAX");
  assert.equal(canonicalWatchlistSymbol("Adicione XLM à minha watchlist do CoinMarketCap"), "XLM");
  assert.equal(canonicalWatchlistSymbol("Agrega pepe a mi watchlist"), null);
  assert.equal(canonicalWatchlistSymbol("Agrega SOL y AVAX a mi watchlist"), null);
  assert.equal(canonicalWatchlistSymbol("Agrega USDC 0x1234567890123456789012345678901234567890 a mi watchlist"), null);
});
