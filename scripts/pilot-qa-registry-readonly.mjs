import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

// QA only. SELECT/read-only transactions; private rows and connection stay in memory.
const root = 'C:/Users/MGC/Documents/ChatGPT/Carmelita';
const work = path.resolve(root, 'work');
const qaFingerprint = 'bfd2efdf0f2fec5299c643ab9ef012c2648d8baa2d83297ff3f924b6bd123299';
const productionFingerprint = 'f8d4e035286a7e8109251975ee5fd430eb5287f11d3fd0b4c212d36e8f8c3dc9';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fingerprint = raw => { const url = new URL(raw); return hash(url.hostname.toLowerCase().replace(/-pooler(?=\.)/, '') + url.pathname); };
const financialFields = ['plans', 'stellar_actions', 'x402_payments', 'faucet_claims'];
const publicFamilies = new Set(['stellar', 'ethereum', 'solana']);
const publicNetworks = new Set(['stellar:testnet', 'avalanche:fuji', 'solana:devnet', 'bnb:testnet', 'base:sepolia']);
const publicStates = new Set(['active', 'pending', 'disabled', 'inactive', 'failed', 'revoked', 'ready', 'error']);
const safeValue = (value, allowed) => allowed.has(value) ? value : '[unrecognized]';
let stage = 'arguments_and_isolation';
try {
  assert.ok(process.argv.length === 3 || process.argv.length === 4);
  assert.ok(['--read-only-qa-before', '--read-only-qa-after'].includes(process.argv[2]));
  const phase = process.argv[2].endsWith('-before') ? 'before' : 'after';
  assert.ok(phase === 'after' || process.argv.length === 3);
  const startedUtc = new Date().toISOString();
  const isolation = JSON.parse(fs.readFileSync(path.join(work, 'pilot-qa-isolation.json'), 'utf8'));
  assert.equal(isolation.databaseFingerprint, qaFingerprint);
  assert.equal(isolation.distinctProduction, true);
  assert.equal(isolation.target, 'preview');
  assert.equal(isolation.schemaPresent, true);
  const connection = JSON.parse(fs.readFileSync(path.join(work, 'pr28-qa-connections.json'), 'utf8'));
  assert.equal(fingerprint(connection.DATABASE_URL_UNPOOLED), qaFingerprint);
  assert.notEqual(qaFingerprint, productionFingerprint);
  const sql = neon(connection.DATABASE_URL_UNPOOLED, { fetchOptions: { signal: AbortSignal.timeout(20_000) } });
  const lifecycle = async () => {
    const [rows] = await sql.transaction([sql`select
      (select count(*)::int from agent_gateway_plans) as plans,
      (select count(*)::int from agent_stellar_actions) as stellar_actions,
      (select count(*)::int from agent_x402_payments) as x402_payments,
      (select count(*)::int from agent_testnet_faucet_claims) as faucet_claims,
      (select count(*)::int from agent_conversations) as conversations,
      (select count(*)::int from agent_messages) as messages`], { readOnly: true });
    return { utc: new Date().toISOString(), counts: rows[0] };
  };
  stage = 'select_qa_registry';
  const before = await lifecycle();
  const [owners, wallets, bindings, links, permissions, families, associations] = await sql.transaction([
    sql`select id,email,status from agent_users order by id`,
    sql`select id,user_id,address,chain_type,network,status from agent_wallets order by id`,
    sql`select wallet_id,user_id,network,status from agent_wallet_networks order by wallet_id,network`,
    sql`select id,issuer,subject,privy_did from oauth_subject_links order by id`,
    sql`select id,user_id,provider,status,scopes from agent_external_connections order by id`,
    sql`select chain_type,status,count(*)::int as count from agent_wallets group by chain_type,status order by chain_type,status`,
    sql`select network,status,count(*)::int as count from agent_wallet_networks group by network,status order by network,status`,
  ], { readOnly: true });
  const after = await lifecycle();
  const counts = { owners: owners.length, distinctWalletOwners: new Set(wallets.map(row => row.user_id)).size,
    wallets: wallets.length, associations: bindings.length, oauthLinks: links.length, externalPermissions: permissions.length };
  const fingerprints = { owners: hash(owners), wallets: hash(wallets), associations: hash(bindings),
    oauthLinks: hash(links), externalPermissions: hash(permissions), familiesAndStates: hash(families), networksAndStates: hash(associations) };
  const delta = Object.fromEntries(Object.keys(before.counts).map(field => [field, after.counts[field] - before.counts[field]]));
  const checks = { isolatedQaFingerprintVerified: true, distinctFromProduction: true,
    financialCountersUnchangedDuringProbe: financialFields.every(field => delta[field] === 0) };
  let comparison;
  if (process.argv[3]) {
    stage = 'offline_previous_qa_reference';
    const previousPath = path.resolve(process.argv[3]);
    assert.equal(path.dirname(previousPath).toLowerCase(), work.toLowerCase());
    assert.match(path.basename(previousPath), /^pilot-qa-registry-before-\d+\.json$/);
    const raw = fs.readFileSync(previousPath, 'utf8');
    const previous = JSON.parse(raw);
    assert.equal(previous.mode, 'isolated_QA_SELECT_only_registry');
    assert.equal(previous.phase, 'before');
    assert.equal(previous.databaseFingerprint, qaFingerprint);
    assert.equal(previous.passed, true);
    assert.ok(Date.parse(previous.utc) < Date.parse(startedUtc));
    const windowDelta = Object.fromEntries(Object.keys(previous.probeLifecycle.before.counts).map(field =>
      [field, after.counts[field] - previous.probeLifecycle.before.counts[field]]));
    const registryChecks = Object.fromEntries(Object.keys(fingerprints).map(field =>
      [field + 'Exact', fingerprints[field] === previous.fingerprints[field]]));
    comparison = { file: path.basename(previousPath), sha256: hash(raw), registryChecks,
      window: { from: previous.probeLifecycle.before.utc, to: after.utc, delta: windowDelta },
      noNetFinancialCounterGrowth: financialFields.every(field => windowDelta[field] === 0) };
    checks.previousQaRegistryFingerprintsExact = Object.values(registryChecks).every(Boolean);
    checks.fullQaWindowFinancialCountersUnchanged = comparison.noNetFinancialCounterGrowth;
  }
  const evidence = { startedUtc, utc: new Date().toISOString(), mode: 'isolated_QA_SELECT_only_registry', phase,
    databaseFingerprint: qaFingerprint, productionDatabaseFingerprint: productionFingerprint,
    counts, fingerprints,
    familiesAndStates: families.map(row => ({ family: safeValue(row.chain_type, publicFamilies), status: safeValue(row.status, publicStates), count: row.count })),
    networksAndStates: associations.map(row => ({ network: safeValue(row.network, publicNetworks), status: safeValue(row.status, publicStates), count: row.count })),
    historicalCountHint: { wallets: 15, owners: 5 }, matchesHistoricalCountHint: counts.wallets === 15 && counts.owners === 5,
    probeLifecycle: { before, after, delta }, checks, comparison, passed: Object.values(checks).every(Boolean),
    limitations: ['This is a current QA reference; matching old count hints does not establish historical identity/hash preservation before this receipt.',
      'Internal registry status does not establish on-chain activation, funding or balances. Effective external OAuth grants and human acceptance are not certified.',
      'Optional comparison reports exact registry hashes and net financial counter deltas separately from normal conversation/message growth.'],
    mutations: { database: false, signup: false, authentication: false, financial: false, wallets: false, OAuth: false, deployment: false, alias: false } };
  const file = path.join(work, `pilot-qa-registry-${phase}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ file, ...evidence }, null, 2));
  if (!evidence.passed) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ error: 'isolated_qa_reference_read_failed_no_private_details_logged', stage }));
  process.exitCode = 1;
}
