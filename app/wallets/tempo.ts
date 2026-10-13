import {
  isTempoTestnetEnabled,
  TEMPO_MODERATO_CAIP2,
  TEMPO_MODERATO_CHAIN_ID,
  TEMPO_MODERATO_EXPLORER_URL,
  TEMPO_MODERATO_RPC_URL,
  TEMPO_MODERATO_TOKEN,
} from "@/app/wallets/networks";
import type { TempoReadErrorCode, TempoWalletReading } from "@/app/wallets/types";

export type TempoReadOptions = {
  signal?: AbortSignal;
  fetch?: typeof fetch;
  /** Internal dependency injection only; never populate this from client input. */
  rpcUrl?: string;
  /** One deadline covers the entire reading, including response decoding. */
  timeoutMs?: number;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const WORD = /^0x[0-9a-fA-F]{64}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const MESSAGES: Record<TempoReadErrorCode, string> = {
  tempo_disabled: "Tempo Moderato está deshabilitado en este entorno.",
  tempo_configuration_incomplete: "La configuración de Tempo Moderato no es válida.",
  tempo_wrong_chain: "El RPC no corresponde a Tempo Moderato (42431).",
  tempo_rpc_timeout: "La consulta a Tempo Moderato agotó su tiempo de espera.",
  tempo_rpc_unavailable: "No se pudo completar la consulta a Tempo Moderato.",
  tempo_rpc_invalid_response: "El RPC de Tempo Moderato devolvió una respuesta inválida.",
  tempo_token_metadata_mismatch: "El contrato TIP-20 no coincide con el token de prueba verificado.",
  tempo_invalid_address: "La dirección EVM no es válida.",
};

class TempoReadFailure extends Error {
  constructor(readonly code: TempoReadErrorCode) { super(code); }
}

function quantity(value: unknown) {
  if (typeof value !== "string" || !QUANTITY.test(value)) throw new TempoReadFailure("tempo_rpc_invalid_response");
  return value;
}

function uint256(value: unknown) {
  if (typeof value !== "string" || !WORD.test(value)) throw new TempoReadFailure("tempo_rpc_invalid_response");
  return BigInt(value);
}

function abiString(value: unknown) {
  // Standard ABI dynamic string: offset=32, bounded length, exact padded data.
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value) || value.length > 2 + 64 * 10) {
    throw new TempoReadFailure("tempo_rpc_invalid_response");
  }
  const data = value.slice(2);
  if (data.length < 128 || data.length % 64 !== 0 || BigInt(`0x${data.slice(0, 64)}`) !== BigInt(32)) {
    throw new TempoReadFailure("tempo_rpc_invalid_response");
  }
  const length = Number(BigInt(`0x${data.slice(64, 128)}`));
  if (!Number.isInteger(length) || length < 1 || length > 256 || data.length !== 128 + Math.ceil(length / 32) * 64) {
    throw new TempoReadFailure("tempo_rpc_invalid_response");
  }
  const text = data.slice(128, 128 + length * 2);
  if (!/^0*$/.test(data.slice(128 + length * 2))) throw new TempoReadFailure("tempo_rpc_invalid_response");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(text.match(/../g)!.map((byte) => parseInt(byte, 16))));
  } catch { throw new TempoReadFailure("tempo_rpc_invalid_response"); }
}

function formatUnits(value: bigint, decimals: number) {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function validConfiguration(rpcUrl: string, timeoutMs: number) {
  try {
    const url = new URL(rpcUrl);
    return url.protocol === "https:" && !url.username && !url.password
      && url.hostname !== "rpc.tempo.xyz" && !url.hostname.includes("mainnet")
      && Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30_000
      && TEMPO_MODERATO_CHAIN_ID === 42431 && TEMPO_MODERATO_CAIP2 === "eip155:42431"
      && ADDRESS.test(TEMPO_MODERATO_TOKEN.address) && TEMPO_MODERATO_TOKEN.decimals === 6;
  } catch { return false; }
}

/** Public JSON-RPC reads only. No private wallet client, signer, or native-gas balance. */
export async function readTempoWallet(address: string, options: TempoReadOptions = {}): Promise<TempoWalletReading> {
  const context = {
    network: "tempo:moderato" as const, caip2: TEMPO_MODERATO_CAIP2, testnet: true as const,
    address, queriedAt: new Date().toISOString(),
    explorerUrl: `${TEMPO_MODERATO_EXPLORER_URL}/address/${encodeURIComponent(address)}`,
  };
  const failure = (code: TempoReadErrorCode): TempoWalletReading => ({
    ...context, status: code === "tempo_disabled" ? "disabled"
      : code === "tempo_configuration_incomplete" ? "misconfigured"
        : code === "tempo_wrong_chain" ? "wrong_network" : "unavailable",
    token: null, block: null, error: { code, message: MESSAGES[code] },
  });
  if (!isTempoTestnetEnabled()) return failure("tempo_disabled");
  if (!ADDRESS.test(address)) return failure("tempo_invalid_address");
  const rpcUrl = options.rpcUrl ?? TEMPO_MODERATO_RPC_URL;
  const timeoutMs = options.timeoutMs ?? 8_000;
  if (!validConfiguration(rpcUrl, timeoutMs)) return failure("tempo_configuration_incomplete");
  if (options.signal?.aborted) return failure("tempo_rpc_unavailable");

  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(new TempoReadFailure(timedOut ? "tempo_rpc_timeout" : "tempo_rpc_unavailable"));
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const fetcher = options.fetch ?? fetch;
  let requestId = 0;
  const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
    controller.signal.throwIfAborted();
    const id = ++requestId;
    const response = await Promise.race([fetcher(rpcUrl, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
      signal: controller.signal, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }), aborted]);
    if (!response.ok) throw new TempoReadFailure("tempo_rpc_unavailable");
    let payload: unknown;
    try { payload = await Promise.race([response.json(), aborted]); }
    catch (error) {
      if (error instanceof TempoReadFailure) throw error;
      throw new TempoReadFailure("tempo_rpc_invalid_response");
    }
    if (!payload || typeof payload !== "object") throw new TempoReadFailure("tempo_rpc_invalid_response");
    const result = payload as { jsonrpc?: unknown; id?: unknown; result?: unknown; error?: unknown };
    if (result.jsonrpc !== "2.0" || result.id !== id || !Object.hasOwn(result, "result") || result.error !== undefined) {
      throw new TempoReadFailure(result.error !== undefined ? "tempo_rpc_unavailable" : "tempo_rpc_invalid_response");
    }
    return result.result;
  };
  try {
    // Fail before any block or token request when the endpoint targets another chain.
    if (BigInt(quantity(await rpc("eth_chainId", []))) !== BigInt(TEMPO_MODERATO_CHAIN_ID)) {
      return failure("tempo_wrong_chain");
    }
    const result = await rpc("eth_getBlockByNumber", ["latest", false]);
    if (!result || typeof result !== "object") throw new TempoReadFailure("tempo_rpc_invalid_response");
    const block = result as { number?: unknown; hash?: unknown; timestamp?: unknown };
    const blockNumber = quantity(block.number);
    const timestamp = quantity(block.timestamp);
    if (typeof block.hash !== "string" || !HASH.test(block.hash)) throw new TempoReadFailure("tempo_rpc_invalid_response");
    const token = TEMPO_MODERATO_TOKEN;
    const code = await rpc("eth_getCode", [token.address, blockNumber]);
    // Tempo TIP-20 predeploys return 0xef; bytecode need not resemble a deployed ERC-20.
    if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code) || /^0x(?:00)+$/i.test(code)) {
      throw new TempoReadFailure("tempo_token_metadata_mismatch");
    }
    const call = (selector: string) => rpc("eth_call", [{ to: token.address, data: selector }, blockNumber]);
    const [decimalsResult, symbolResult, nameResult] = await Promise.all([
      call("0x313ce567"), call("0x95d89b41"), call("0x06fdde03"),
    ]);
    if (uint256(decimalsResult) !== BigInt(token.decimals) || abiString(symbolResult) !== token.symbol || abiString(nameResult) !== token.name) {
      throw new TempoReadFailure("tempo_token_metadata_mismatch");
    }
    const atomic = uint256(await call(`0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`));
    return {
      ...context, status: "available", chainId: TEMPO_MODERATO_CHAIN_ID,
      block: { number: BigInt(blockNumber).toString(), hash: block.hash as `0x${string}`, timestamp: BigInt(timestamp).toString() },
      token: { ...token, balanceAtomic: atomic.toString(), balance: formatUnits(atomic, token.decimals), metadataVerified: true },
    };
  } catch (error) {
    return failure(timedOut ? "tempo_rpc_timeout" : error instanceof TempoReadFailure ? error.code : "tempo_rpc_unavailable");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
