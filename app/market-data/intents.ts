import type { AssetQuery, ChainComparisonInput } from "./types";

export type MarketIntent =
  | { kind: "quotes"; assets: AssetQuery[] }
  | { kind: "chains"; input: Omit<ChainComparisonInput, "locale"> }
  | { kind: "invalid"; reason: "too_many_assets" | "too_many_chains" | "network_required" | "asset_required" | "testnet_market" }
  | { kind: "clarify"; reason: "network_not_token" };

const aliases: Record<string, string> = {
  bitcoin: "BTC", btc: "BTC", ethereum: "ETH", ether: "ETH", eth: "ETH",
  stellar: "XLM", lumen: "XLM", lumens: "XLM", xlm: "XLM", solana: "SOL", sol: "SOL",
  avalanche: "AVAX", avax: "AVAX", bnb: "BNB", usdc: "USDC", tether: "USDT", usdt: "USDT",
  xrp: "XRP", cardano: "ADA", ada: "ADA", dogecoin: "DOGE", doge: "DOGE",
};
const networkAliases: Record<string, string> = {
  solana: "solana", sol: "solana", stellar: "stellar", ethereum: "ethereum", eth: "ethereum",
  avalanche: "avalanche", avax: "avalanche", base: "base", bnb: "bsc", bsc: "bsc",
  "bnb chain": "bsc", "binance smart chain": "bsc", arbitrum: "arbitrum", optimism: "optimism",
  polygon: "polygon", tron: "tron", fantom: "fantom", sui: "sui", aptos: "aptos",
};
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function network(value: string) {
  const clean = normalized(value).replace(/^(?:(?:la|a|the)\s+)?(?:red|rede|network|chain)\s+/i, "").replace(/\bmainnet\b/g, "").trim();
  return networkAliases[clean] ?? clean;
}

function removeInstructions(value: string) {
  return value
    .replace(/[¿?¡!]/g, " ")
    .replace(/\b(?:(?:(?:and|y|e)\s+)?(?:indica|indique|incluye|include|inclua|muestra|show|mostre)|with|con|com)\s+(?:la |el |a |o |the )?(?:fuente|source|fonte|proveedor|provider|fecha|date|data|capitalizacion|market cap|volume|volumen|change|variacion)\b[\s\S]*$/i, "")
    .replace(/\b(?:por favor|please|por favor)\b/gi, "")
    .replace(/\b(?:segun|according to|via|using|en|on|no|na|de)\s+(?:coingecko|coinmarketcap|coin market cap|defillama)\b/gi, "")
    .replace(/\b(?:actual(?:es)?|current|latest|atual|atuais|ahora|now|hoje|today|hoy|usd|dolares|dollars)\b/gi, "")
    .replace(/\b(?:cuanto cuesta|quanto custa|how much (?:is|does)|qual (?:e|é)|cual es|what(?:'s| is| are)?|cuales son|quais sao|dame|give me|diga|quiero saber|i want to know|consulta(?:r)?|consulte|query|analiza|analizar|analyze|analyse|analisar|analise|cotiza|cotacao|cotizacion|cotizacion(?:es)?|precios?|prices?|precos?|valor|value|ticker(?:s)?|tokens?|activos?|assets?|capitalizacion(?: de mercado)?|capitalizacao(?: de mercado)?|market\s*cap(?:italization)?|quotation|quote)\b/gi, " ")
    .replace(/^\s*(?:el|la|los|las|o|a|os|as|the|de|del|do|da|of|for|para)\s+/gi, "")
    .replace(/\s+/g, " ").trim().replace(/[.:]+$/, "");
}

function splitAssets(value: string) {
  // A name containing spaces remains one query. Explicit separators and runs of
  // uppercase tickers permit deterministic multi-asset queries without guessing.
  const separated = value.split(/\s*(?:[,;]|\s+(?:y|e|and|with|versus|vs\.?|&|\+)\s+)\s*/i).map(v => v.trim()).filter(Boolean);
  return separated.flatMap(part => {
    const words = part.split(/\s+/);
    if (words.length > 1 && words.every(word => /^[A-Z0-9]{2,12}$/.test(word))) return words;
    if (words.length > 1 && words.every(word => Object.hasOwn(aliases, normalized(word)))) return words;
    return [part];
  });
}

function parseAsset(value: string, sharedNetwork?: string): AssetQuery | MarketIntent {
  let assetText = value.trim();
  let selectedNetwork = sharedNetwork;
  const networkMatch = assetText.match(/\s+(?:en|on|na|no|em|red|rede|network)\s+(.+)$/i);
  if (networkMatch) {
    selectedNetwork = network(networkMatch[1]);
    assetText = assetText.slice(0, networkMatch.index).trim();
  }
  const cg = assetText.match(/^coingecko:([a-z0-9][a-z0-9-]{0,119})$/i);
  if (cg) return { coingeckoId: cg[1].toLowerCase(), ...(selectedNetwork ? { network: selectedNetwork } : {}) };
  const cmc = assetText.match(/^(?:cmc|coinmarketcap):(\d+)$/i);
  if (cmc && Number(cmc[1]) > 0 && Number.isSafeInteger(Number(cmc[1]))) return { cmcId: Number(cmc[1]), ...(selectedNetwork ? { network: selectedNetwork } : {}) };
  const stellar = assetText.match(/^([a-z0-9]{1,12})\s*(?::|[ /]|\s+(?:issuer|emisor|emissor)\s+)\s*(G[A-Z2-7]{55})$/i);
  if (stellar) return { query: stellar[1], network: selectedNetwork ?? "stellar", issuer: stellar[2].toUpperCase() };
  const address = assetText.match(/^(?:contrato|contract|mint|direccion|address|endereco)?\s*((?:0x[a-f0-9]{40})|(?:[1-9A-HJ-NP-Za-km-z]{32,44}))$/i);
  if (address) {
    if (!selectedNetwork) return { kind: "invalid", reason: "network_required" };
    return { network: selectedNetwork, address: address[1] };
  }
  if (!assetText || assetText.length > 120) return { kind: "invalid", reason: "asset_required" };
  const query = aliases[normalized(assetText)] ?? assetText;
  if (!selectedNetwork && ["base", "arbitrum network", "bnb chain", "bsc", "binance smart chain"].includes(normalized(query))) return { kind: "clarify", reason: "network_not_token" };
  return { query, ...(selectedNetwork ? { network: selectedNetwork } : {}) };
}

export function parseMarketIntent(message: string): MarketIntent | null {
  const text = normalized(message);
  if (/\b(?:watchlist|lista de seguimiento|lista de acompanhamento)\b/.test(text)) return null;
  // Price discovery must not steal wallet reads, DEX quotes or financial commands.
  if (/\b(?:saldos?|balances?|wallets?|billeteras?|carteiras?|swap|soroswap|pangolin|dexalot|lfj|nfts?|prediccion|predicciones|prediction|predictions|predicao|aave|skills?|deposit|deposito|deposita|deposite|retira|withdraw|envia|enviar|envie|send|transfiere|transfer|transferir|trade|paga|pagar|pague|trustline|fund|financia|x402|cctp)\b/.test(text)) return null;
  // PAY is also a catalog ticker. Reject payment grammar, not the asset name in
  // an explicit price question such as "What is the price of PAY?".
  const payPriceQuestion = /^\s*pay\s+(?:prices?|precios?|precos?|quote|cotizacion|cotacao)(?:\s+(?:actual|current|atual))?\s*[?!.]*$/.test(text);
  if ((!payPriceQuestion && /^\s*(?:please\s+)?pay\b/.test(text))
    || /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?pay\b/.test(text)
    || /\b(?:to\s+pay|pay\s+(?:\d|for\b|with\b|using\b|to\b))/.test(text)) return null;
  const tvl = /\b(?:tvl|total value locked|valor (?:total )?(?:bloqueado|travado))\b/.test(text);
  const cap = /\b(?:capitalizacion|capitalizacao|market\s*cap(?:italization)?)\b/.test(text);
  const chainWords = /\b(?:redes?|redes?|networks?|chains?|blockchains?)\b/.test(text);
  const priceWords = /\b(?:prices?|precios?|precos?|cuanto cuesta|quanto custa|how much is|cotizacion(?:es)?|cotacao|quote|ticker(?:s)?|analiza|analizar|analyze|analyse|analisar|analise|valor|value|capitalizacion|capitalizacao|market\s*cap|coingecko|coinmarketcap|cmc)\b/.test(text);
  if ((tvl || cap || priceWords) && /\b(?:testnet|devnet|fuji|sepolia)\b/.test(text)) return { kind: "invalid", reason: "testnet_market" };
  if (tvl || (cap && (chainWords || /\b(?:base|bsc|bnb chain|binance smart chain)\b/.test(text)))) {
    const limitMatch = text.match(/\b(?:top|primeras?|first|principais|maiores|mayores)\s+(\d+)\b/);
    const limit = limitMatch ? Number(limitMatch[1]) : 10;
    if (limit < 1 || limit > 20) return { kind: "invalid", reason: "too_many_chains" };
    const ranking = /\b(?:top|ranking|mayor(?:es)?|maior(?:es)?|highest|largest|most|mas|mais|which|cuales|quais)\b/.test(text);
    const chainMatches = Object.keys(networkAliases).sort((a, b) => b.length - a.length).filter(alias =>
      new RegExp("(^|[^a-z0-9])" + alias + "([^a-z0-9]|$)").test(text),
    );
    let chains = [...new Set(chainMatches.map(network))];
    const namedList = ranking && text.match(/\b(?:de|of|entre|among|das?)\s+(?:(?:las|the|as)\s+)?(?:redes?\s+)?((?:base|solana|stellar|avalanche|ethereum|bnb|arbitrum|optimism|polygon|tron|sui|aptos|hyperliquid)\b[^?!.]*)[?!.]*$/);
    if (!ranking || namedList) {
      const chainNames = (namedList ? namedList[1] : message).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\b(?:por|by|segun|pelo|pela)\s+(?:tvl|capitalizacion(?: de mercado)?|capitalizacao(?: de mercado)?|market cap)(?:\s+(?:y|e|and)\s+(?:tvl|capitalizacion(?: de mercado)?|capitalizacao(?: de mercado)?|market cap))?[\s\S]*$/i, "")
        .replace(/\b(?:capitalizacion(?: de mercado)?|capitalizacao(?: de mercado)?|market cap(?:italization)?|total value locked|valor (?:total )?(?:bloqueado|travado)|tvl|compara|compare|comparar|consulta|consulte|query|muestra|mostre|show|networks?|chains?|blockchains?|redes?|de|del|do|da|of|the|las|los|as|os|a|o|el|la)\b/gi, " ")
        .replace(/[¿?!.]/g, " ").replace(/\s+/g, " ").trim();
      const explicitNames = splitAssets(chainNames).filter(part => part && !/^(?:y|e|and)$/i.test(part)).map(network);
      if (explicitNames.length) chains = [...new Set(explicitNames)];
    }
    if (chains.length > 20) return { kind: "invalid", reason: "too_many_chains" };
    return { kind: "chains", input: { ...(chains.length ? { chains } : {}), sortBy: cap && !tvl ? "marketCap" : "tvl", limit } };
  }
  if (!priceWords && !/^\s*(?:coingecko:[a-z0-9-]+|cmc:\d+)\s*[?!.]*$/i.test(message)) return null;
  const protectedIdentifiers: string[] = [];
  const protectedMessage = message.replace(/\b(?:coingecko:[a-z0-9][a-z0-9-]{0,119}|(?:cmc|coinmarketcap):\d+|0x[a-f0-9]{40}|G[A-Z2-7]{55}|[a-z0-9]+(?:-[a-z0-9]+)+)\b/gi, identifier => {
    protectedIdentifiers.push(identifier);
    return `MARKETIDENTIFIER${protectedIdentifiers.length - 1}`;
  });
  let clean = removeInstructions(protectedMessage.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    .replace(/MARKETIDENTIFIER(\d+)/g, (_match, index) => protectedIdentifiers[Number(index)]);
  const issuerMatch = clean.match(/\s+(?:issuer|emisor|emissor)\s+(G[A-Z2-7]{55})$/i);
  if (issuerMatch) clean = clean.slice(0, issuerMatch.index).trim();
  let sharedNetwork: string | undefined;
  const trailingNetwork = clean.match(/\s+(?:en|on|na|no|em)\s+([^,;]+)$/i);
  if (trailingNetwork && !/\s+(?:y|e|and)\s+/i.test(trailingNetwork[1])) {
    sharedNetwork = network(trailingNetwork[1]);
    clean = clean.slice(0, trailingNetwork.index).trim();
  }
  const parts = splitAssets(clean).map(part => part.replace(/^(?:de|del|do|da|of|for|el|la|the)\s+/i, "").trim()).filter(Boolean);
  if (issuerMatch && parts.length === 1) parts[0] += `:${issuerMatch[1]}`;
  if (parts.length > 10) return { kind: "invalid", reason: "too_many_assets" };
  if (!parts.length) return { kind: "invalid", reason: "asset_required" };
  const assets: AssetQuery[] = [];
  for (const part of parts) {
    const asset = parseAsset(part, sharedNetwork);
    if ("kind" in asset) return asset;
    if (!assets.some(existing => JSON.stringify(existing) === JSON.stringify(asset))) assets.push(asset);
  }
  return { kind: "quotes", assets };
}

export function canonicalWatchlistSymbol(message: string): string | null {
  const text = normalized(message);
  if (/\b(?:coingecko:|cmc:|coinmarketcap:|0x[a-f0-9]{40}|mint|contrato|contract|issuer|emisor|emissor)\b/.test(text) || /\bG[A-Z2-7]{55}\b/.test(message)) return null;
  const clean = text.replace(/\b(?:add|agrega|agregar|agregue|suma|follow|seguir|adicione|adicionar|coloque|acompanhar)\b/g, "")
    .replace(/\b(?:to|my|mi|minha|meu|a|en|na|no|la|el|the|o|do|da|de)\b/g, "")
    .replace(/\b(?:watchlist|lista de seguimiento|lista de acompanhamento|lista|criptomonedas|criptomoedas|crypto|coinmarketcap|coingecko)\b/g, "")
    .replace(/[¿?!.]/g, "").replace(/\s+/g, " ").trim();
  return aliases[clean] ?? null;
}
