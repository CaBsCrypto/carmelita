type Options = { getToken: () => Promise<string | null>; active: () => boolean; fetcher?: typeof fetch; timeoutMs?: number };
/** A late token/body cannot cross an account boundary or keep a confirmation busy forever. */
export async function requestOwnedAppJson(path: string, body: unknown | undefined, options: Options) {
  if (!/^\/api\/agent\/apps(?:\/bazaar)?(?:\?[^#]*)?$/.test(path)) throw new Error("apps_request_path_invalid");
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("apps_request_timeout")); }, options.timeoutMs ?? 25_000); });
  const check = () => { controller.signal.throwIfAborted(); if (!options.active()) throw new Error("apps_session_changed"); };
  try {
    return await Promise.race([(async () => {
      check(); const token = await options.getToken(); check(); if (!token) throw new Error("apps_authentication_required");
      const response = await (options.fetcher ?? fetch)(path, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store", signal: controller.signal });
      check(); reader = response.body?.getReader(); if (!reader) throw new Error("apps_response_invalid");
      let size = 0; const chunks: Uint8Array[] = [];
      while (true) { const part = await reader.read(); check(); if (part.done) break; size += part.value.byteLength; if (size > 256 * 1024) throw new Error("apps_response_too_large"); chunks.push(part.value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const result = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)); check();
      if (!response.ok) throw new Error(typeof result.error === "string" && /^(?:app|apps|bazaar|x402)_[a-z0-9_]+$/.test(result.error) ? result.error : "apps_request_unavailable");
      return result;
    })(), deadline]);
  } finally { if (timer) clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}
