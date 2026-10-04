import type { ChainComparison, MarketLocale, MarketQuotes, MarketResult } from "./types";

const copy = {
  es: { scope: "Datos de mercado Mainnet · USD · Solo lectura", asset: "Activo", price: "Precio", cap: "Capitalización del token", volume: "Volumen 24h", source: "Fuente", updated: "Fecha del dato", fetched: "Obtenido de la fuente", queried: "Fecha de consulta", missing: "No disponible", cached: "caché", fresh: "consulta", stale: "Dato antiguo; no es un precio actual", choose: "Hay varios activos con ese símbolo. Elige un ID o indica red y dirección", noAsset: "Activo no encontrado en las fuentes disponibles", unavailable: "La fuente no pudo devolver un dato verificado. Puedes reintentar", chain: "Red", token: "Token asociado", gas: "Token de gas", tvl: "TVL de la red", note: "TVL y capitalización del token son métricas distintas. La capitalización es global del token; no representa todo el capital de la red. Estos datos no valoran fondos Testnet.", tvlDate: "TVL obtenido", noTvlDate: "El proveedor no informa fecha de actualización por red", missingChains: "Redes no encontradas", capOrder: "Orden: capitalización del token asociado", tvlOrder: "Orden: TVL", nativeMissing: "Sin token asociado", partial: "Resultado parcial: algunas redes no tienen capitalización verificada", coverage: "Redes con capitalización disponible", failed: "Redes con dato no disponible", confidence: "Confianza", rank: "Ranking", change: "Cambio" },
  en: { scope: "Mainnet market data · USD · Read only", asset: "Asset", price: "Price", cap: "Token market cap", volume: "24h volume", source: "Source", updated: "Data timestamp", fetched: "Fetched", queried: "Query timestamp", missing: "Unavailable", cached: "cache", fresh: "fetch", stale: "Old data; not a current price", choose: "Several assets use this symbol. Choose an ID or specify network and address", noAsset: "Asset not found in the available sources", unavailable: "The source could not return verified data. You can retry", chain: "Chain", token: "Associated token", gas: "Gas token", tvl: "Chain TVL", note: "TVL and token market cap are different metrics. Market cap is global for the token; it does not represent all capital on a chain. These data do not value Testnet funds.", tvlDate: "TVL fetched", noTvlDate: "The provider does not report an update timestamp per chain", missingChains: "Chains not found", capOrder: "Order: associated token market cap", tvlOrder: "Order: TVL", nativeMissing: "No associated token", partial: "Partial result: some chains have no verified market cap", coverage: "Chains with available market cap", failed: "Chains with unavailable data", confidence: "Confidence", rank: "Rank", change: "Change" },
  pt: { scope: "Dados de mercado Mainnet · USD · Somente leitura", asset: "Ativo", price: "Preço", cap: "Capitalização do token", volume: "Volume 24h", source: "Fonte", updated: "Data do dado", fetched: "Obtido da fonte", queried: "Data da consulta", missing: "Indisponível", cached: "cache", fresh: "consulta", stale: "Dado antigo; não é um preço atual", choose: "Vários ativos usam esse símbolo. Escolha um ID ou indique rede e endereço", noAsset: "Ativo não encontrado nas fontes disponíveis", unavailable: "A fonte não retornou um dado verificado. Você pode tentar novamente", chain: "Rede", token: "Token associado", gas: "Token de gás", tvl: "TVL da rede", note: "TVL e capitalização do token são métricas diferentes. A capitalização é global do token; não representa todo o capital da rede. Estes dados não avaliam fundos Testnet.", tvlDate: "TVL obtido", noTvlDate: "O provedor não informa data de atualização por rede", missingChains: "Redes não encontradas", capOrder: "Ordem: capitalização do token associado", tvlOrder: "Ordem: TVL", nativeMissing: "Sem token associado", partial: "Resultado parcial: algumas redes não têm capitalização verificada", coverage: "Redes com capitalização disponível", failed: "Redes com dado indisponível", confidence: "Confiança", rank: "Ranking", change: "Variação" },
} as const;

function safe(text: string) {
  return text.replace(/[\r\n|\[\]<>`]/g, " ").replace(/[\\*_]/g, "\\$&");
}
function money(value: number | null, locale: MarketLocale, price = false) {
  if (value === null || !Number.isFinite(value)) return copy[locale].missing;
  return new Intl.NumberFormat(locale === "es" ? "es-CL" : locale === "pt" ? "pt-BR" : "en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: price && value < 1 ? 10 : 2,
  }).format(value);
}
function status(result: MarketResult, locale: MarketLocale) {
  const t = copy[locale];
  if (result.reason === "inactive") return marketEvidenceCopy[locale].inactive;
  if (result.status === "ambiguous") return t.choose;
  if (result.status === "not_found") return marketEvidenceCopy[locale].notFound;
  if (result.status === "stale") return t.stale;
  return t.unavailable;
}
const marketEvidenceCopy = {
  es: { inactive: "Activos identificados como inactivos en el catálogo de la fuente indicada; precio no disponible", notFound: "Activo no encontrado en los catálogos consultados. Prueba un ID o indica red y dirección", partial: "Consulta parcial: otra fuente no respondió. La inactividad indicada se limita a los activos identificados; puedes reintentar" },
  en: { inactive: "Assets identified as inactive in the indicated source catalog; price unavailable", notFound: "Asset not found in the catalogs consulted. Try an ID or specify network and address", partial: "Partial query: another source did not respond. The inactive status applies only to the identified assets; you can retry" },
  pt: { inactive: "Ativos identificados como inativos no catálogo da fonte indicada; preço indisponível", notFound: "Ativo não encontrado nos catálogos consultados. Tente um ID ou indique rede e endereço", partial: "Consulta parcial: outra fonte não respondeu. A inatividade indicada se limita aos ativos identificados; você pode tentar novamente" },
} as const;
function link(label: string, url: string) {
  // URLs are generated by the adapters, never accepted from a user or upstream payload.
  return /^https:\/\/(?:www\.)?(?:coingecko\.com|coinmarketcap\.com|defillama\.com|coins\.llama\.fi)(?:\/|$)/.test(url)
    ? `[${safe(label)}](${url.replace(/[()\s]/g, c => encodeURIComponent(c))})` : safe(label);
}

export function formatMarketQuotes(data: MarketQuotes, locale: MarketLocale = "es") {
  const t = copy[locale];
  const lines = [`**${t.scope}**`, `${t.queried}: ${data.queriedAt}`];
  for (const result of data.results) {
    const title = result.asset ? `${safe(result.asset.name)} (${safe(result.asset.symbol)}) · ${safe(result.asset.id)}` : safe(result.request.query || result.request.coingeckoId || String(result.request.cmcId || result.request.address || ""));
    lines.push(`\n**${title}**`);
    if (result.reason === "inactive") {
      lines.push(status(result, locale));
      for (const asset of result.inactiveCandidates || []) {
        const provider = /^https:\/\/(?:www\.)?coinmarketcap\.com\//.test(asset.sourceUrl) ? "CoinMarketCap" : /^https:\/\/(?:www\.)?coingecko\.com\//.test(asset.sourceUrl) ? "CoinGecko" : t.source;
        lines.push(`- ${safe(asset.name)} (${safe(asset.symbol)}) · ${safe(asset.id)} · ${t.source}: ${link(provider, asset.sourceUrl)}${asset.network ? " · " + safe(asset.network) : ""}${asset.address ? " · " + safe(asset.address) : ""}`);
      }
      if (result.error) lines.push(marketEvidenceCopy[locale].partial);
      continue;
    }
    if (result.status === "ambiguous") {
      lines.push(t.choose, ...(result.candidates || []).map(a => `- ${safe(a.name)} (${safe(a.symbol)}) · ${safe(a.id)}${a.network ? " · " + safe(a.network) : ""}${a.address ? " · " + safe(a.address) : ""}`));
      continue;
    }
    if (!result.quote || (result.status !== "ok" && result.status !== "stale")) { lines.push(status(result, locale)); continue; }
    if (result.status === "stale") lines.push(`**${t.stale}**`);
    if (result.asset?.network) lines.push(`${t.chain}: ${safe(result.asset.network)}${result.asset.address ? " · " + safe(result.asset.address) : ""}${result.asset.issuer ? " · " + safe(result.asset.issuer) : ""}`);
    const q = result.quote;
    lines.push(`${t.price}: **${money(q.price, locale, true)}**`, `${t.cap}: ${money(q.marketCap, locale)} · ${t.volume}: ${money(q.volume24h, locale)}`);
    const percent = (n: number | null) => n === null ? t.missing : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
    lines.push(`${t.change} 24h: ${percent(q.change24h)} · 7d: ${percent(q.change7d)} · ${t.rank}: ${q.rank ?? t.missing}`);
    lines.push(`${t.source}: ${link(q.source, q.sourceUrl)}${q.confidence === undefined ? "" : ` · ${t.confidence}: ${Math.round(q.confidence * 100)}%`}`, `${t.updated}: ${q.updatedAt || t.missing}`, `${t.fetched}: ${q.fetchedAt} · ${q.fromCache ? t.cached : t.fresh}`);
  }
  lines.push(`\n${t.note}`);
  return lines.join("\n\n");
}

export function formatChainComparison(data: ChainComparison, locale: MarketLocale = "es") {
  const t = copy[locale];
  const lines = [`**${t.scope}**`, `${t.queried}: ${data.queriedAt}`, data.sortBy === "marketCap" ? t.capOrder : t.tvlOrder];
  if (data.error) lines.push(t.unavailable);
  if (data.status === "partial") lines.push(`**${t.partial}**`);
  lines.push(`${t.coverage}: ${data.quotedChains} · ${t.failed}: ${data.unavailableChains}`);
  if (data.failures.length) lines.push(`${t.failed}: ${data.failures.map(failure => safe(failure.chain)).join(", ")}`);
  if (data.rows.length) {
    const table = [`| ${t.chain} | ${t.tvl} | ${t.token} | ${t.cap} | ${t.gas} |`, "|---|---:|---|---:|---|"];
    for (const row of data.rows) {
      table.push(`| ${link(row.name, row.tvlSourceUrl)} | ${money(row.tvl, locale)} | ${row.associatedToken ? safe(row.associatedToken.symbol) : t.nativeMissing} | ${money(row.marketCap, locale)} | ${safe(row.gasTokenId || t.missing)} |`);
    }
    lines.push(table.join("\n"));
    for (const row of data.rows) {
      if (row.marketSource) lines.push(`${safe(row.name)} · ${t.source}: ${link(row.marketSource.source, row.marketSource.sourceUrl)} · ${t.updated}: ${row.marketSource.updatedAt || t.missing} · ${t.fetched}: ${row.marketSource.fetchedAt} · ${row.marketSource.fromCache ? t.cached : t.fresh}${row.quoteStatus === "stale" ? " · " + t.stale : ""}`);
      else if (row.quoteStatus !== "no_associated_token") lines.push(`${safe(row.name)}: ${t.unavailable}`);
    }
  }
  lines.push(`${t.source}: [DefiLlama](https://defillama.com/chains) · ${t.tvlDate}: ${data.tvlFetchedAt} · ${data.tvlFromCache ? t.cached : t.fresh}`, t.noTvlDate);
  if (data.missingChains.length) lines.push(`${t.missingChains}: ${data.missingChains.map(safe).join(", ")}`);
  lines.push(t.note);
  return lines.join("\n\n");
}
