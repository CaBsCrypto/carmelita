#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DISPATCH_PATH = "/api/admin/integrations/notifications";
const TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 16_384;
const WORKER_STATUSES = new Set(["processed", "disabled", "not_configured", "storage_unavailable"]);
const COUNTERS = ["processed", "accepted", "retry", "needsReview"];

/** This runner reads only its supplied environment; it never loads a dotenv file. */
export function readDispatchConfiguration(env) {
  const origin = env.CARMELITA_PUBLIC_ORIGIN;
  const token = env.CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN;
  if (typeof origin !== "string" || typeof token !== "string" || !/^[\x21-\x7e]{32,256}$/.test(token)) return null;
  // Literal loopback IPs avoid DNS resolution when sending this server capability.
  // Reject URL normalization tricks, credentials, paths, query strings and fragments.
  if (!/^(?:https:\/\/carmelita\.browns\.studio(?::443)?|http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[1-9][0-9]{0,4})?)\/?$/.test(origin)) return null;
  try {
    const url = new URL(origin);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return { endpoint: new URL(DISPATCH_PATH, url.origin).href, token };
  } catch { return null; }
}

async function readBoundedJson(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) throw new Error("invalid_response");
  const contentLength = response.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES)) throw new Error("invalid_response");
  if (!response.body) throw new Error("invalid_response");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("invalid_response");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
}

function safeWorkerResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !WORKER_STATUSES.has(value.status)) return null;
  if (COUNTERS.some(key => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 5)) return null;
  if (value.accepted + value.retry + value.needsReview > value.processed) return null;
  if (value.status !== "processed" && COUNTERS.some(key => value[key] !== 0)) return null;
  return { status: value.status, ...Object.fromEntries(COUNTERS.map(key => [key, value[key]])) };
}

/** One request at most. Installing a scheduler and authorizing execution are separate steps. */
export async function runDispatch(args, env) {
  if (args.length > 1 || args.some(arg => arg !== "--check" && arg !== "--execute")) {
    return { exitCode: 2, output: { status: "invalid_arguments" } };
  }
  const config = readDispatchConfiguration(env);
  if (!config) return { exitCode: 2, output: { status: "invalid_configuration" } };
  if (args[0] !== "--execute") return { exitCode: 0, output: { status: "ready" } };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(config.endpoint, {
      method: "GET", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) return { exitCode: 1, output: { status: "unauthorized" } };
    if (response.status !== 200) return { exitCode: 1, output: { status: "dispatch_unavailable" } };
    const result = safeWorkerResult(await readBoundedJson(response));
    if (!result) return { exitCode: 1, output: { status: "invalid_response" } };
    return { exitCode: result.status === "processed" ? 0 : 1, output: result };
  } catch {
    return { exitCode: 1, output: { status: controller.signal.aborted ? "timeout" : response ? "invalid_response" : "network_error" } };
  } finally {
    clearTimeout(timeout);
    await response?.body?.cancel().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runDispatch(process.argv.slice(2), process.env);
  process.stdout.write(`${JSON.stringify(result.output)}\n`);
  process.exitCode = result.exitCode;
}
