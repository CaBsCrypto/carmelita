import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getStellarTestnetAccount, isValidStellarAddress } from "../app/privy-stellar";
import { futureTravalaDates, searchTravalaHotels } from "../app/travala";
import { X402_DEMO_LIMIT_DISPLAY, X402_TESTNET_RESOURCE, X402_TESTNET_USDC } from "../app/x402/assets";
import { inspectX402Resource } from "../app/x402/protocol";
import { INTERNAL_TESTNET_USDC_DISTRIBUTOR_ADDRESS, INTERNAL_TESTNET_USDC_DRIP } from "../app/x402/testnet-faucet";
import { acceptanceArg, acceptanceReport, assertRemotePreview, previewAcceptanceTarget, redactAcceptanceSecrets, vercelCurl, type AcceptanceCheck } from "./agent-gateway-preview-acceptance";

type Mode = "doctor" | "authenticated" | "travala";
type JsonObject = Record<string, unknown>;
type Env = Record<string, string | undefined>;
function invariant(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function object(value: unknown, label: string): JsonObject {
  invariant(Boolean(value) && typeof value === "object" && !Array.isArray(value), `${label}_invalid`);
  return value as JsonObject;
}
function string(value: unknown, label: string) {
  invariant(typeof value === "string" && value.length > 0, `${label}_missing`);
  return value;
}
export function acceptanceConfig(args: string[] = process.argv, env: Env = process.env) {
  const mode = args[2] ?? "doctor";
  invariant(mode !== "execute", "automatic_payment_execution_disabled_use_visible_application_approval");
  invariant(["doctor", "authenticated", "travala"].includes(mode), "usage: acceptance.ts <doctor|authenticated|travala> --url <url>");
  const requestedUrl = acceptanceArg("--url", args) ?? env.AGENT_ACCEPTANCE_BASE_URL;
  invariant(requestedUrl, "AGENT_ACCEPTANCE_BASE_URL_or_url_required");
  const url = new URL(requestedUrl);
  invariant(!url.username && !url.password && !url.search && !url.hash && url.pathname === "/", "acceptance_origin_required");
  invariant(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)), "acceptance_https_required");
  const deployment = acceptanceArg("--deployment", args) ?? (mode === "authenticated" ? env.CARMELITA_PREVIEW_DEPLOYMENT : undefined);
  const commit = acceptanceArg("--commit", args) ?? (mode === "authenticated" ? env.CARMELITA_PREVIEW_COMMIT : undefined);
  const preview = mode === "authenticated" ? previewAcceptanceTarget({ url: url.origin, deployment, commit }, env) : undefined;
  const token = env.AGENT_ACCEPTANCE_PRIVY_TOKEN?.trim() ?? "";
  invariant(mode !== "authenticated" || token, "AGENT_ACCEPTANCE_PRIVY_TOKEN_required");
  const allowBootstrap = args.includes("--allow-bootstrap");
  invariant(!allowBootstrap || mode === "authenticated", "bootstrap_requires_authenticated_preview");
  return { mode: mode as Mode, url: url.origin, deployment, commit, token, allowBootstrap, preview, jsonOutput: args.includes("--json") };
}
export function authenticatedAcceptanceRequest(path: string, config: ReturnType<typeof acceptanceConfig>, body?: JsonObject) {
  invariant(config.mode === "authenticated" && config.token && config.deployment, "authenticated_preview_required");
  // This runner can provision accounts explicitly; it cannot prepare or execute a payment.
  invariant(body === undefined || (path === "/api/agent/bootstrap" && config.allowBootstrap && Object.keys(body).length === 0), "acceptance_write_not_allowed");
  invariant(path === "/api/agent/bootstrap" || (path === "/api/agent/x402" && body === undefined), "acceptance_endpoint_not_allowed");
  return { deployment: config.deployment, path, token: config.token, origin: config.url, method: body === undefined ? "GET" : "POST", body };
}
export function bootstrapWalletIdentity(bootstrap: JsonObject) {
  const wallets = object(bootstrap.wallets, "bootstrap_wallets");
  const result = Object.fromEntries(["stellar", "avalanche", "solana"].map((network) => [network, string(object(wallets[network], `bootstrap_${network}`).address, `${network}_address`)]));
  invariant(isValidStellarAddress(result.stellar), "wallet_address_invalid");
  invariant(object(bootstrap.wallet, "bootstrap_wallet").address === result.stellar, "bootstrap_stellar_wallet_mismatch");
  return result;
}
export async function runAcceptance(config: ReturnType<typeof acceptanceConfig>) {
  const checks: AcceptanceCheck[] = [];
  const secrets = new Set([config.token].filter(Boolean));
  async function check(name: string, operation: () => Promise<string> | string) {
    const started = performance.now();
    try {
      const detail = await operation();
      checks.push({ name, status: "PASS", durationMs: Math.round(performance.now() - started), detail });
    } catch (error) {
      checks.push({ name, status: "FAIL", durationMs: Math.round(performance.now() - started), detail: redactAcceptanceSecrets(error instanceof Error ? error.message : "unknown_error", secrets) });
    }
  }
  const pending = (name: string, detail: string) => checks.push({ name, status: "PENDING", durationMs: 0, detail });
  async function request(path: string) {
    if (config.deployment) return vercelCurl({ deployment: config.deployment, path, origin: config.url }, secrets);
    const response = await fetch(config.url + path, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: response.status, body };
  }
  async function json(path: string) {
    const result = await request(path);
    invariant(result.status === 200, `http_${result.status}`);
    return object(result.body, path);
  }
  async function authenticated(path: string, body?: JsonObject) {
    const result = await vercelCurl(authenticatedAcceptanceRequest(path, config, body), secrets);
    invariant(result.status >= 200 && result.status < 300, `http_${result.status}`);
    return object(result.body, path);
  }
  await check("Safety constants are Testnet-only", () => {
    invariant(X402_TESTNET_USDC.network === "stellar:testnet", "x402_network_not_testnet");
    invariant(X402_DEMO_LIMIT_DISPLAY === "0.0100000", "x402_limit_changed");
    invariant(INTERNAL_TESTNET_USDC_DRIP === "0.5000000", "faucet_drip_changed");
    invariant(isValidStellarAddress(INTERNAL_TESTNET_USDC_DISTRIBUTOR_ADDRESS), "distributor_address_invalid");
    return "Stellar Testnet, 0.01 USDC payment cap, 0.50 USDC drip";
  });
  let remoteVerified = false;
  await check("Target health contract", async () => {
    const health = await json("/api/health");
    if (config.preview) { assertRemotePreview(health, config.preview); remoteVerified = true; }
    invariant(health.status === "ok" && health.environment === "stellar-testnet", "health_contract_mismatch");
    const payments = object(health.payments, "health_payments");
    invariant(payments.x402StellarTestnet === "enabled" && payments.mainnet === "disabled", "payment_boundary_mismatch");
    return `persistence=${String(health.persistence)}, mainnet=disabled`;
  });
  await check("Target agent page", async () => {
    const response = await request("/agent");
    invariant(response.status === 200, `agent_http_${response.status}`);
    const html = typeof response.body === "string" ? response.body : String((response.body as { raw?: string })?.raw ?? "");
    invariant(/<!doctype html|<html/i.test(html), "agent_not_html");
    return "HTTP 200 HTML";
  });
  await check("MCP discovery contract", async () => {
    const discovery = await json("/.well-known/mcp");
    const payments = object(object(discovery.security, "mcp_security").payments, "mcp_payments");
    invariant(payments.mainnet === "disabled", "mcp_mainnet_not_disabled");
    invariant(payments.x402StellarTestnet === "explicit-user-approval", "mcp_x402_boundary_missing");
    return "Sandbox, personal-agent and provider surfaces advertised";
  });
  // External probes remain separate from authenticated onboarding acceptance.
  if (config.mode !== "authenticated") {
    await check("Official x402 live challenge (read-only)", async () => {
      const inspected = await inspectX402Resource(X402_TESTNET_RESOURCE);
      invariant(inspected.requirement.network === X402_TESTNET_USDC.network, "challenge_network_changed");
      invariant(inspected.requirement.asset === X402_TESTNET_USDC.contract, "challenge_asset_changed");
      invariant(inspected.amountDisplay === X402_DEMO_LIMIT_DISPLAY, "challenge_amount_changed");
      invariant(isValidStellarAddress(inspected.requirement.payTo), "challenge_recipient_invalid");
      return `${inspected.amountDisplay} USDC challenge; no payment`;
    });
    await check("Internal distributor readiness (read-only)", async () => {
      const account = await getStellarTestnetAccount(INTERNAL_TESTNET_USDC_DISTRIBUTOR_ADDRESS);
      invariant(account.exists, "distributor_account_missing");
      const usdc = account.balances.find((balance) => balance.asset === "USDC" && balance.issuer === X402_TESTNET_USDC.issuer);
      const xlm = account.balances.find((balance) => balance.asset === "XLM");
      invariant(Number(usdc?.balance ?? 0) >= Number(INTERNAL_TESTNET_USDC_DRIP), "distributor_usdc_low");
      invariant(Number(xlm?.balance ?? 0) > 1, "distributor_xlm_low");
      return `${usdc?.balance} USDC, ${xlm?.balance} XLM; no funding`;
    });
  }
  if (config.mode === "travala") {
    await check("Live Travala read-only search", async () => {
      const location = process.env.TRAVALA_ACCEPTANCE_LOCATION?.trim() || "Santiago, Chile";
      const dates = futureTravalaDates(new Date(), 45, 2);
      const result = await searchTravalaHotels({ location, ...dates, guests: 2 });
      invariant(result.sessionId.length > 0 && result.hotels.length > 0, "travala_inventory_missing");
      invariant(result.hotels.every((hotel) => hotel.totalPriceUSD >= 0), "travala_price_invalid");
      return `${result.hotels.length} options; no reservation`;
    });
  }
  if (config.mode === "authenticated") {
    if (!remoteVerified) {
      pending("Authenticated checks", "Not invoked because remote Preview isolation or commit verification failed.");
      return { mode: config.mode, ...acceptanceReport({ url: config.url, deployment: config.deployment ?? null, commit: config.commit ?? null, checks }) };
    }
    let walletAddress: string | undefined;
    let walletIdentity: Record<string, string> | undefined;
    if (config.allowBootstrap) {
      await check("Privy bootstrap (explicit record and wallet creation)", async () => {
        const bootstrap = await authenticated("/api/agent/bootstrap", {});
        walletIdentity = bootstrapWalletIdentity(bootstrap);
        walletAddress = walletIdentity.stellar;
        return "Wallet provisioning completed; funding and signing were not requested";
      });
      await check("Privy bootstrap idempotency", async () => {
        invariant(walletAddress, "first_bootstrap_missing");
        const replay = await authenticated("/api/agent/bootstrap", {});
        invariant(JSON.stringify(bootstrapWalletIdentity(replay)) === JSON.stringify(walletIdentity), "bootstrap_wallet_changed");
        return "Repeated bootstrap kept the same Stellar, Avalanche and Solana addresses";
      });
    } else pending("Privy bootstrap", "Not invoked. Use --allow-bootstrap only with an exclusive test identity to create records and wallets.");
    await check("Authenticated x402 status (read-only)", async () => {
      const status = await authenticated("/api/agent/x402");
      const address = string(object(status.wallet, "x402_wallet").address, "x402_wallet_address");
      invariant(isValidStellarAddress(address), "wallet_address_invalid");
      if (walletAddress) invariant(address === walletAddress, "wallet_identity_mismatch");
      return "Authenticated persisted wallet status returned; no trustline or payment preparation";
    });
    pending("Browser login, recovery, chat and memory persistence", "Validate through the visible application using two exclusive test identities; this runner does not prove human acceptance.");
    pending("Cross-user data, plans and receipts isolation", "Requires separate two-user acceptance evidence; a single temporary token cannot establish isolation.");
  }
  return { mode: config.mode, ...acceptanceReport({ url: config.url, deployment: config.deployment ?? null, commit: config.commit ?? null, checks }) };
}
const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  const config = acceptanceConfig();
  const report = await runAcceptance(config);
  if (config.jsonOutput) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.generatedAt} | ${report.url} | commit=${report.commit ?? "not supplied"} | deployment=${report.deployment ?? "public URL only"}`);
    for (const result of report.checks) console.log(`${result.status} ${result.name}: ${result.detail}`);
    console.log(`${report.passed} passed, ${report.failed} failed, ${report.pending} pending; ${report.status}`);
  }
  if (report.failed) process.exitCode = 1;
}
