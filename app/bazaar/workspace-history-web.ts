/** Owner-session history through Bazaar's existing native GET. No MCP change,
 * identity assertion, order recovery, key creation, retries or financial calls. */
import { BAZAAR_ORIGIN, type NativeReadDependencies, type BazaarBinding, type HistoryCursor } from './workspace-read-adapter';

type Json = Record<string, unknown>;
function fail(code: string): never { throw Error(code); }
function object(v: unknown): Json {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('bazaar_native_response_invalid');
  return v as Json;
}
function text(v: unknown, max: number) {
  if (typeof v !== 'string' || !v || v.length > max) fail('bazaar_native_response_invalid');
  return v;
}
function same(a: BazaarBinding, b: BazaarBinding | null) {
  return b && ['userId','ownerId','workspaceId','agentId','generation','agentSecretReference']
    .every(k => a[k as keyof BazaarBinding] === b[k as keyof BazaarBinding]);
}
export function createBazaarWebHistory(deps: NativeReadDependencies) {
  return async (input: {cursor?: HistoryCursor} = {}) => {
    if (typeof window !== 'undefined' || Object.keys(input).some(k => k !== 'cursor')) fail('bazaar_native_input_invalid');
    const userId = text(await deps.authenticatedUserId(),200), stored = await deps.bindingForUser(userId);
    if (!stored) fail('bazaar_native_link_required');
    const binding = {...stored};
    if (binding.userId !== userId || !/^ow_[a-f0-9]{32}$/.test(binding.ownerId) || !Number.isSafeInteger(binding.generation) || binding.generation < 1) fail('bazaar_native_binding_mismatch');
    text(binding.workspaceId,512); text(binding.agentId,512); text(binding.agentSecretReference,512);
    if (input.cursor && (input.cursor.ownerId !== binding.ownerId || input.cursor.generation !== binding.generation)) fail('bazaar_native_cursor_owner_mismatch');
    if (input.cursor && !/^[A-Za-z0-9_-]{1,512}$/.test(input.cursor.value)) fail('bazaar_native_input_invalid');
    const secret = await deps.agentSecretForUser(userId,binding.agentSecretReference);
    if (secret.userId !== userId || secret.ownerId !== binding.ownerId || !/^[A-Za-z0-9_-]{43}$/.test(secret.agentAccess)) fail('bazaar_native_secret_owner_mismatch');
    async function unchanged() {
      if (await deps.authenticatedUserId() !== userId || !same(binding,await deps.bindingForUser(userId))) fail('bazaar_native_binding_changed');
    }
    await unchanged();
    const params = new URLSearchParams({limit:'1',...(input.cursor ? {cursor:input.cursor.value} : {})});
    const target = BAZAAR_ORIGIN+'/api/market/orders?'+params;
    const signal = AbortSignal.any([AbortSignal.timeout(12000),...(deps.signal ? [deps.signal] : [])]);
    let response: Response | undefined;
    try {
      signal.throwIfAborted();
      // This endpoint authenticates the current AGENT and scopes its native
      // query/cursor to that owner. A missing/rotated credential cannot read data.
      response = await deps.fetcher(target,{method:'GET',headers:{Accept:'application/json',Authorization:'Bearer '+secret.agentAccess},
        redirect:'error',credentials:'omit',cache:'no-store',signal});
      if (response.redirected || response.headers.has('location') || response.url && response.url !== target) fail('bazaar_native_redirect_forbidden');
      if (response.status !== 200) fail(response.status === 401 || response.status === 403 ? 'bazaar_native_access_denied' : response.status === 429 ? 'bazaar_native_capacity_limited' : 'bazaar_native_unavailable');
      if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) fail('bazaar_native_response_invalid');
      const reader = response.body?.getReader(); if (!reader) fail('bazaar_native_response_invalid');
      const chunks: Uint8Array[] = []; let size = 0;
      let body: Json;
      try {
        for (;;) { const p = await reader.read(); signal.throwIfAborted(); if (p.done) break; size += p.value.byteLength; if (size > 131072) fail('bazaar_native_response_too_large'); chunks.push(p.value); }
        body = object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
      } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); chunks.forEach(c=>c.fill(0)); }
      if (!Array.isArray(body.orders) || body.orders.length > 1 || typeof body.partialResults !== 'boolean' || !(body.nextCursor === null || typeof body.nextCursor === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(body.nextCursor))) fail('bazaar_native_response_invalid');
      const orders = body.orders.map(raw => {
        const o = object(raw), buyer = o.buyerOwnerId === binding.ownerId, seller = o.sellerOwnerId === binding.ownerId;
        if (!buyer && !seller || o.perspective !== (buyer ? 'purchase' : 'sale')) fail('bazaar_native_history_owner_mismatch');
        return {operationId:text(o.operationId,36),serviceId:text(o.serviceId,100),perspective:o.perspective,phase:text(o.phase,64),
          paymentVerifiedByBazaar:typeof o.paymentVerifiedAt === 'string' && /^[a-f0-9]{64}$/.test(String(o.transactionHash ?? '')),delivered:o.phase === 'delivered'};
      });
      await unchanged();
      return {orders,nextCursor:body.nextCursor ? {ownerId:binding.ownerId,generation:binding.generation,value:body.nextCursor} : null,
        partialResults:body.partialResults,readOnly:true,evidence:'bazaar-authenticated-server-state',independentlyVerifiedChainPayment:false};
    } catch (e) {
      if (e instanceof Error && /^bazaar_native_[a-z_]+$/.test(e.message)) throw e;
      fail('bazaar_native_read_unconfirmed');
    } finally { await response?.body?.cancel().catch(()=>{}); }
  };
}
