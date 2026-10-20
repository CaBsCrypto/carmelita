/** Server-only, nonfinancial adapter for the public Bazaar integration/v1.
 * No provisioning, token creation, OAuth, wallet, order recovery or payment.
 * The caller wires existing authenticated-user and per-user secret stores.
 * A fetch implementation is mandatory: constructing this module never connects.
 */
import { reviewZeroFeeCard } from './zero-fee-review';
export const BAZAAR_ORIGIN = 'https://bazaar.browns.studio';
export const BAZAAR_CONTRACT = 'bazaar.integration/v1';
const MCP_PROTOCOL = '2024-11-05';
const requiredTools = ['get_bazaar_identity', 'get_bazaar_capabilities', 'list_market_orders'];
type Json = Record<string, unknown>;
export type BazaarBinding = {
  userId: string; ownerId: string; workspaceId: string; agentId: string;
  generation: number; agentSecretReference: string;
};
export type HistoryCursor = { ownerId: string; generation: number; value: string };
export type NativeReadDependencies = {
  // Must derive from requireMcpSubject/verifyAgentUserToken or verified web session.
  // Never resolve it from a model-supplied userId, wallet, email or tool argument.
  authenticatedUserId(): Promise<string>;
  bindingForUser(userId: string): Promise<BazaarBinding | null>;
  agentSecretForUser(userId: string, reference: string): Promise<{userId: string; ownerId: string; agentAccess: string}>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};
function fail(code: string): never { throw new Error(code); }
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('bazaar_native_response_invalid');
  return value as Json;
}
function text(value: unknown, maximum = 512): string {
  if (typeof value !== 'string' || !value || value.length > maximum) fail('bazaar_native_response_invalid');
  return value;
}
function sameBinding(a: BazaarBinding, b: BazaarBinding | null) {
  return b && ['userId', 'ownerId', 'workspaceId', 'agentId', 'generation', 'agentSecretReference']
    .every(key => a[key as keyof BazaarBinding] === b[key as keyof BazaarBinding]);
}
function page(input: {limit?: number; cursor?: HistoryCursor}, binding?: BazaarBinding) {
  if (Object.keys(input).some(key => !['limit', 'cursor'].includes(key))) fail('bazaar_native_input_invalid');
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) fail('bazaar_native_input_invalid');
  if (input.cursor) {
    if (!binding || input.cursor.ownerId !== binding.ownerId || input.cursor.generation !== binding.generation) fail('bazaar_native_cursor_owner_mismatch');
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(input.cursor.value)) fail('bazaar_native_input_invalid');
  }
  return {limit, ...(input.cursor ? {cursor: input.cursor.value} : {})};
}
export function createBazaarWorkspaceReadAdapter(deps: NativeReadDependencies) {
  if (typeof window !== 'undefined' || typeof deps.fetcher !== 'function') fail('bazaar_native_server_dependencies_required');
  async function request(path: string, body?: Json, token?: string) {
    const method = body === undefined ? 'GET' : 'POST';
    if (!(method === 'GET' && ['/api/integration', '/api/market/catalog'].includes(path.split('?')[0]) || method === 'POST' && path === '/api/mcp')) fail('bazaar_native_path_forbidden');
    if (token && path !== '/api/mcp') fail('bazaar_native_credential_destination_forbidden');
    const target = new URL(path, BAZAAR_ORIGIN).href;
    const signal = AbortSignal.any([AbortSignal.timeout(12000), ...(deps.signal ? [deps.signal] : [])]);
    let response: Response | undefined;
    try {
      signal.throwIfAborted();
      response = await deps.fetcher(target, {method, headers: {Accept: body ? 'application/json, text/event-stream' : 'application/json', ...(body ? {'Content-Type': 'application/json', 'MCP-Protocol-Version': MCP_PROTOCOL} : {}), ...(token ? {Authorization: `Bearer ${token}`} : {})}, ...(body ? {body: JSON.stringify(body)} : {}), redirect: 'error', credentials: 'omit', cache: 'no-store', signal});
      if (response.redirected || response.url && response.url !== target || response.headers.has('location')) fail('bazaar_native_redirect_forbidden');
      if (!response.ok) fail(response.status === 429 ? 'bazaar_native_capacity_limited' : response.status === 401 || response.status === 403 ? 'bazaar_native_access_denied' : 'bazaar_native_unavailable');
      if (response.status === 202 || response.status === 204) return undefined;
      if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) fail('bazaar_native_response_invalid');
      const reader = response.body?.getReader(); if (!reader) fail('bazaar_native_response_invalid');
      const parts: Uint8Array[] = []; let count = 0;
      try { for (;;) { const part = await reader.read(); signal.throwIfAborted(); if (part.done) break; count += part.value.byteLength; if (count > 131072) fail('bazaar_native_response_too_large'); parts.push(part.value); } }
      finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
    } catch (error) {
      if (error instanceof Error && /^bazaar_native_[a-z_]+$/.test(error.message)) throw error;
      fail('bazaar_native_read_unconfirmed');
    } finally { await response?.body?.cancel().catch(() => {}); }
  }
  async function contract() {
    const value = object(await request('/api/integration'));
    const endpoints = object(value.endpoints), identity = object(value.identity), transport = object(value.transport);
    if (value.version !== BAZAAR_CONTRACT || object(endpoints.mcp).path !== '/api/mcp' || object(endpoints.catalogue).path !== '/api/market/catalog' || object(endpoints.orders).path !== '/api/market/orders' || transport.testedMcpProtocolVersion !== MCP_PROTOCOL || identity.ownerAssignedByServer !== true || identity.authenticatedRoleField !== 'role') fail('bazaar_native_contract_mismatch');
    return value;
  }
  async function ownedBinding() {
    const userId = text(await deps.authenticatedUserId(), 200);
    const value = await deps.bindingForUser(userId);
    if (!value) fail('bazaar_native_link_required');
    if (value.userId !== userId || !/^ow_[a-f0-9]{32}$/.test(value.ownerId) || !Number.isSafeInteger(value.generation) || value.generation < 1) fail('bazaar_native_binding_mismatch');
    text(value.workspaceId); text(value.agentId); text(value.agentSecretReference);
    return {...value};
  }
  async function connect(binding: BazaarBinding) {
    await contract(); // Public contract validation happens before opening a secret.
    const secret = await deps.agentSecretForUser(binding.userId, binding.agentSecretReference);
    if (secret.userId !== binding.userId || secret.ownerId !== binding.ownerId || !/^[A-Za-z0-9_-]{43}$/.test(secret.agentAccess)) fail('bazaar_native_secret_owner_mismatch');
    const token = secret.agentAccess; let sequence = 0;
    async function rpc(method: string, params: Json) {
      const id = ++sequence;
      const response = object(await request('/api/mcp', {jsonrpc: '2.0', id, method, params}, token));
      if (response.jsonrpc !== '2.0' || response.id !== id || response.error) fail('bazaar_native_rpc_invalid');
      return object(response.result);
    }
    const initialized = await rpc('initialize', {protocolVersion: MCP_PROTOCOL, capabilities: {}, clientInfo: {name: 'carmelita-bazaar-native-read', version: '1'}});
    if (initialized.protocolVersion !== MCP_PROTOCOL) fail('bazaar_native_protocol_mismatch');
    await request('/api/mcp', {jsonrpc: '2.0', method: 'notifications/initialized'}, token);
    const listing = await rpc('tools/list', {});
    if (!Array.isArray(listing.tools) || !requiredTools.every(name => (listing.tools as unknown[]).some(tool => object(tool).name === name))) fail('bazaar_native_tools_missing');
    async function call(name: string, args: Json = {}) {
      if (!requiredTools.includes(name)) fail('bazaar_native_tool_forbidden');
      const result = await rpc('tools/call', {name, arguments: args});
      if (result.isError) fail('bazaar_native_tool_rejected');
      const content = result.content;
      if (!Array.isArray(content) || !content.length || object(content[0]).type !== 'text') fail('bazaar_native_response_invalid');
      let value: Json; try { value = object(JSON.parse(text(object(content[0]).text, 131072))); } catch { return fail('bazaar_native_response_invalid'); }
      if (value.httpStatus !== undefined && value.httpStatus !== 200) fail('bazaar_native_tool_rejected');
      if (result.structuredContent !== undefined && JSON.stringify(result.structuredContent) !== JSON.stringify(value)) fail('bazaar_native_result_conflict');
      return value;
    }
    const identity = await call('get_bazaar_identity');
    if (identity.ownerId !== binding.ownerId || identity.workspaceId !== binding.workspaceId || identity.agentId !== binding.agentId || identity.generation !== binding.generation || identity.role !== 'agent' || identity.network !== 'stellar:testnet') fail('bazaar_native_identity_mismatch');
    return {call};
  }
  async function unchanged(binding: BazaarBinding) {
    if (await deps.authenticatedUserId() !== binding.userId || !sameBinding(binding, await deps.bindingForUser(binding.userId))) fail('bazaar_native_binding_changed');
  }
  return {
    async review(input: {serviceId: string; cardHash: string; catalogCursor?: string}) {
      if (Object.keys(input).some(key => !['serviceId', 'cardHash', 'catalogCursor'].includes(key)) || typeof input.serviceId !== 'string'
        || !/^[A-Za-z0-9_-]{1,100}$/.test(input.serviceId) || !/^[a-f0-9]{64}$/.test(input.cardHash)
        || input.catalogCursor !== undefined && !/^[A-Za-z0-9_-]{1,512}$/.test(input.catalogCursor)) fail('bazaar_native_input_invalid');
      const binding = await ownedBinding(), client = await connect(binding);
      const capabilities = await client.call('get_bazaar_capabilities');
      const marketplace = object(object(capabilities.workspace).marketplace);
      if (marketplace.feeBps !== 0 || marketplace.custody !== false) fail('bazaar_native_commission_disabled');
      // Re-read exactly the catalogue page selected in the UI. Text search is
      // not an ID lookup. A moved/removed card requires an explicit refresh.
      const params = new URLSearchParams({limit: '5', ...(input.catalogCursor ? {cursor: input.catalogCursor} : {})});
      const body = object(await request(`/api/market/catalog?${params}`));
      if (body.paused !== false || !Array.isArray(body.services) || body.services.length > 5 || typeof body.partialResults !== 'boolean') fail('bazaar_native_review_unavailable');
      const matches = body.services.filter(raw => object(object(raw).card).id === input.serviceId);
      if (matches.length !== 1) fail('bazaar_native_review_unavailable');
      const entry = object(matches[0]), card = object(entry.card);
      if (entry.status !== 'activated' || entry.cardHash !== input.cardHash) fail('bazaar_native_card_changed');
      const terms = reviewZeroFeeCard(card, input.cardHash);
      await unchanged(binding);
      return {serviceId: input.serviceId, name: text(card.name, 200), ...terms};
    },
    async catalog(input: {limit?: number; query?: string; cursor?: string} = {}) {
      if (Object.keys(input).some(key => !['limit', 'query', 'cursor'].includes(key))) fail('bazaar_native_input_invalid');
      const {limit} = page({limit: input.limit});
      if (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 200) || input.cursor !== undefined && !/^[A-Za-z0-9_-]{1,512}$/.test(input.cursor)) fail('bazaar_native_input_invalid');
      await contract();
      const params = new URLSearchParams({limit: String(limit), ...(input.query ? {q: input.query} : {}), ...(input.cursor ? {cursor: input.cursor} : {})});
      const body = object(await request(`/api/market/catalog?${params}`));
      if (!Array.isArray(body.services) || body.services.length > limit || typeof body.partialResults !== 'boolean' || typeof body.paused !== 'boolean' || !(body.nextCursor === null || typeof body.nextCursor === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(body.nextCursor))) fail('bazaar_native_response_invalid');
      const services = body.services.map(raw => { const entry = object(raw), card = object(entry.card), provider = object(card.provider); if (entry.status !== 'activated' || !/^[a-f0-9]{64}$/.test(text(entry.cardHash, 64))) fail('bazaar_native_response_invalid'); return {id: text(card.id, 128), name: text(card.name, 200), description: text(card.description, 20000), provider: text(provider.name, 200), cardHash: text(entry.cardHash, 64), metadataOnly: true, instructionsTrusted: false}; });
      return {services, nextCursor: body.nextCursor, partialResults: body.partialResults, paused: body.paused, readOnly: true, purchaseAuthorized: false};
    },
    async preflight() {
      const binding = await ownedBinding(), client = await connect(binding);
      const capabilities = await client.call('get_bazaar_capabilities');
      const features = object(capabilities.effectiveFeatures);
      const purchases = object(features.purchases);
      if (typeof purchases.enabled !== 'boolean') fail('bazaar_native_capabilities_invalid');
      await unchanged(binding);
      return {identityVerified: true, role: 'agent', generation: binding.generation, effectivePurchasesEnabled: purchases.enabled, purchasesEnabledIsAdmissionReservation: false, adapterFinancialOperations: false, readOnly: true};
    },
    async history(input: {limit?: number; cursor?: HistoryCursor} = {}) {
      const binding = await ownedBinding(), args = page(input, binding), client = await connect(binding);
      const body = await client.call('list_market_orders', args);
      if (!Array.isArray(body.orders) || body.orders.length > args.limit || typeof body.partialResults !== 'boolean' || !(body.nextCursor === null || typeof body.nextCursor === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(body.nextCursor))) fail('bazaar_native_response_invalid');
      const orders = body.orders.map(raw => {
        const order = object(raw), buyer = order.buyerOwnerId === binding.ownerId, seller = order.sellerOwnerId === binding.ownerId;
        if (!buyer && !seller || order.perspective !== (buyer ? 'purchase' : 'sale')) fail('bazaar_native_history_owner_mismatch');
        return {operationId: text(order.operationId, 36), serviceId: text(order.serviceId, 100), perspective: order.perspective, phase: text(order.phase, 64), paymentVerifiedByBazaar: typeof order.paymentVerifiedAt === 'string' && /^[a-f0-9]{64}$/.test(String(order.transactionHash ?? '')), delivered: order.phase === 'delivered'};
      });
      await unchanged(binding);
      return {orders, nextCursor: body.nextCursor ? {ownerId: binding.ownerId, generation: binding.generation, value: body.nextCursor} : null, partialResults: body.partialResults, readOnly: true, evidence: 'bazaar-authenticated-server-state', independentlyVerifiedChainPayment: false};
    },
  };
}
