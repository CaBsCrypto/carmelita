import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';

// SELECT-only comparison against the original immutable reference, never HEAD.
// Private rows/connections remain in memory. No auth calls or database writes.
const root = 'C:/Users/MGC/Documents/ChatGPT/Carmelita';
const cli = 'C:/Users/MGC/AppData/Roaming/npm/node_modules/vercel/dist/index.js';
const origin = 'https://carmelita.browns.studio';
const sourceCommit = '7edcb1890a76a7dfcf9f3eb4da50615807a951be';
// Public release identities only; override AFTER solely with a verified release.
const commit = process.env.PILOT_EXPECTED_COMMIT ?? sourceCommit;
const deployment = process.env.PILOT_EXPECTED_DEPLOYMENT ?? 'dpl_AZhKWj3aKHSc9Wmv1DT2Z65XpnZA';
const productionFingerprint = 'f8d4e035286a7e8109251975ee5fd430eb5287f11d3fd0b4c212d36e8f8c3dc9';
const qaFingerprint = 'bfd2efdf0f2fec5299c643ab9ef012c2648d8baa2d83297ff3f924b6bd123299';
const originalFileHash = '42695fc364594d8c840419bc4ca8f0eec60b61a751470172ddf9f890bc09a9c8';
const run = promisify(execFile);
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fingerprint = value => { const url = new URL(value); return hash(url.hostname.toLowerCase().replace(/-pooler(?=\.)/, '') + url.pathname); };
const same = (before, after) => JSON.stringify(before) === JSON.stringify(after);
let stage = 'immutable_reference';
async function api(route) {
  const response = await run(process.execPath, [cli, 'api', route, '--method', 'GET', '--raw', '--scope', 'cabscryptocontacto-6028s-projects'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(response.stdout);
}
async function publicRead(route) {
  const response = await fetch(origin + route + '?original_reference_nonce=' + Date.now(), {
    headers: { accept: 'application/json', 'Cache-Control': 'no-cache' }, credentials: 'omit',
    redirect: 'manual', signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, body: await response.json() };
}
try {
  assert.equal(process.argv.length, 3);
  assert.ok(['--read-only-pilot-before', '--read-only-pilot-after'].includes(process.argv[2]));
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.match(deployment, /^dpl_[A-Za-z0-9]+$/);
  const phase = process.argv[2].endsWith('-before') ? 'before' : 'after';
  const startedUtc = new Date().toISOString();
  const referencePath = path.resolve(root, fs.readFileSync(root + '/work/explorer-release-baseline-latest.txt', 'utf8').trim());
  assert.ok(referencePath.toLowerCase().startsWith(path.resolve(root, 'work').toLowerCase() + path.sep));
  const referenceRaw = fs.readFileSync(referencePath, 'utf8');
  assert.equal(hash(referenceRaw), originalFileHash);
  const reference = JSON.parse(referenceRaw);
  assert.equal(reference.totalWallets, 18);
  const prod = JSON.parse(fs.readFileSync(root + '/work/production-db-connections.json', 'utf8'));
  const qa = JSON.parse(fs.readFileSync(root + '/work/pr28-qa-connections.json', 'utf8'));
  assert.equal(fingerprint(prod.DATABASE_URL_UNPOOLED), productionFingerprint);
  assert.equal(fingerprint(qa.DATABASE_URL_UNPOOLED), qaFingerprint);
  assert.notEqual(productionFingerprint, qaFingerprint);
  stage = 'public_deployment';
  const [alias, candidate, health, metadata] = await Promise.all([
    api('/v4/aliases/carmelita.browns.studio'), api('/v13/deployments/' + deployment),
    publicRead('/api/health'), publicRead('/.well-known/oauth-protected-resource/api/mcp/agent'),
  ]);
  const publicChecks = {
    domainExactDeployment: (alias.deployment?.id ?? alias.deploymentId) === deployment,
    deploymentReadyProduction: candidate.id === deployment && candidate.projectId === 'prj_UQnTOdi1AWU6soTr04ACsqNo7YDu'
      && candidate.readyState === 'READY' && candidate.target === 'production'
      && (candidate.meta?.githubCommitSha ?? candidate.gitSource?.sha) === commit,
    healthExactPublishedCommit: health.status === 200 && health.body.deployment?.gitCommitSha === commit
      && health.body.deployment?.environment === 'production' && health.body.maintenance === false,
    oauthResourceAndScopesPreserved: metadata.status === 200 && metadata.body.resource === origin + '/api/mcp/agent'
      && same(metadata.body.authorization_servers, ['https://abstracted-alpaca-5870.customers.stytch.dev'])
      && same(metadata.body.scopes_supported, ['agent:read', 'agent:plan', 'agent:context', 'agent:conversation']),
  };
  assert.ok(Object.values(publicChecks).every(Boolean));
  const sql = neon(prod.DATABASE_URL_UNPOOLED, { fetchOptions: { signal: AbortSignal.timeout(20_000) } });
  const countRead = async () => {
    const [result] = await sql.transaction([sql`select
      (select count(*)::int from agent_gateway_plans) as plans,
      (select count(*)::int from agent_stellar_actions) as stellar_actions,
      (select count(*)::int from agent_x402_payments) as x402_payments,
      (select count(*)::int from agent_testnet_faucet_claims) as faucet_claims,
      (select count(*)::int from agent_conversations) as conversations,
      (select count(*)::int from agent_messages) as messages`], { readOnly: true });
    return { utc: new Date().toISOString(), counts: result[0] };
  };
  stage = 'select_original_reference';
  const before = await countRead();
  const [globalOwners, owners, wallets, bindings, links, permissions] = await sql.transaction([
    sql`select count(*)::int as count from agent_users`,
    sql`select id,email,status from agent_users where id = any(${reference.users.map(user => user.id)}) order by id`,
    sql`select id,user_id,address,chain_type,network,status from agent_wallets order by id`,
    sql`select wallet_id,user_id,network,status from agent_wallet_networks order by wallet_id,network`,
    sql`select id,issuer,subject,privy_did from oauth_subject_links order by id`,
    sql`select id,user_id,provider,status,scopes from agent_external_connections order by id`,
  ], { readOnly: true });
  const after = await countRead();
  const originalOwners = [...reference.users].sort((a,b) => a.id.localeCompare(b.id));
  const existingLinksPreserved = reference.links.every(before => links.some(after => same(before, after)));
  const changes = Object.fromEntries(Object.keys(before.counts).map(key => [key, after.counts[key] - before.counts[key]]));
  const financialFields = ['plans', 'stellar_actions', 'x402_payments', 'faucet_claims'];
  const checks = { ...publicChecks,
    immutableReferenceFilePreserved: hash(fs.readFileSync(referencePath, 'utf8')) === originalFileHash,
    originalOwnersIdentitiesAndStatesExact: same(owners, originalOwners),
    globalOwnersStillSix: globalOwners[0].count === 6,
    allWalletOwnersIdsAddressesNetworksStatesExact: same(wallets, reference.wallets),
    exactlyEighteenWallets: wallets.length === 18,
    allWalletAssociationsExact: same(bindings, reference.bindings),
    existingOAuthLinksExact: existingLinksPreserved,
    originalFourLinksAndCurrentFiveLinks: reference.links.length === 4 && links.length === 5,
    externalConnectionPermissionsExact: same(permissions, reference.permissions),
    noFinancialCountChangeDuringProbe: financialFields.every(key => changes[key] === 0),
    conversationCountStableDuringProbe: changes.conversations === 0,
    messageCountDidNotDecrease: changes.messages >= 0,
    productionAndQaFingerprintsDistinct: productionFingerprint !== qaFingerprint,
  };
  const referenceSummary = { utc: reference.utc, file: path.basename(referencePath), fileHash: originalFileHash,
    ownerCount: reference.users.length, walletCount: reference.wallets.length, bindingCount: reference.bindings.length,
    oauthLinkCount: reference.links.length, permissionRecordCount: reference.permissions.length,
    fingerprints: { owners: hash(originalOwners), wallets: hash(reference.wallets), bindings: hash(reference.bindings),
      oauthLinks: hash(reference.links), externalPermissions: hash(reference.permissions) } };
  const currentSummary = { ownerCount: owners.length, globalOwnerCount: globalOwners[0].count,
    distinctWalletOwnerCount: new Set(wallets.map(row => row.user_id)).size, walletCount: wallets.length,
    bindingCount: bindings.length, oauthLinkCount: links.length, permissionRecordCount: permissions.length,
    fingerprints: { owners: hash(owners), wallets: hash(wallets), bindings: hash(bindings),
      oauthLinks: hash(links), externalPermissions: hash(permissions) } };
  const evidence = { startedUtc, utc: new Date().toISOString(), mode: 'SELECT_only_original_reference_pilot', phase, origin, sourceCommit, commit, deployment,
    referenceDatabaseFingerprint: productionFingerprint, qaDatabaseFingerprint: qaFingerprint,
    publication: { aliasDeploymentId: alias.deployment?.id ?? alias.deploymentId, state: candidate.readyState, target: candidate.target,
      healthStatus: health.status, servedCommit: health.body.deployment?.gitCommitSha, oauthScopesSupported: metadata.body.scopes_supported },
    before: referenceSummary, after: currentSummary, queryMode: 'read_only_transactions', checks,
    probeLifecycle: { before, after, delta: changes, financialDeltaDuringProbe: financialFields.reduce((sum,key) => sum + changes[key], 0),
      messageGrowthAllowed: true, ignoredNormalActivityFields: ['last_seen_at', 'updated_at', 'last_used_at'] },
    historicalFinancialDeltaSinceOriginal: 'not_established_original_reference_has_no_lifecycle_counts',
    effectiveUserOAuthScopes: 'not_database_backed; compare the actual connected-app query evidence from the visible flow',
    passed: Object.values(checks).every(Boolean),
    limitations: ['Independent private SELECT confirms the original production registry remains intact; it is not itself an authenticated runtime owner query.',
      'Original reference has no financial or message counters. Delta0 is certified for this probe interval only, not retroactively for the full sprint.',
      'Effective Stytch OAuth app grants are external to these tables and require the visible connected-app evidence.'],
    mutations: { source: false, environment: false, OAuth: false, authentication: false, wallets: false, bootstrap: false,
      financial: false, database: false, deployments: false, aliases: false, Git: false } };
  const file = root + '/work/pilot-production-reference-oct4-source7ed-' + phase + '-' + Date.now() + '.json';
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ file, ...evidence }, null, 2));
  if (!evidence.passed) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ error: 'production_original_reference_read_failed_no_private_details_logged', stage }));
  process.exitCode = 1;
}


