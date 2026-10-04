import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Offline receipt comparison only: never opens a connection or performs a fetch.
const root = 'C:/Users/MGC/Documents/ChatGPT/Carmelita';
const work = path.resolve(root, 'work');
const originalHash = '42695fc364594d8c840419bc4ca8f0eec60b61a751470172ddf9f890bc09a9c8';
const financialFields = ['plans', 'stellar_actions', 'x402_payments', 'faucet_claims'];
const hash = raw => createHash('sha256').update(raw).digest('hex');
function readReceipt(arg, phase) {
  const file = path.resolve(arg);
  assert.equal(path.dirname(file).toLowerCase(), work.toLowerCase());
  assert.match(path.basename(file), /^pilot-production-reference-oct4-source7ed-(?:before|after)-\d+\.json$/);
  const raw = fs.readFileSync(file, 'utf8');
  const receipt = JSON.parse(raw);
  assert.equal(receipt.mode, 'SELECT_only_original_reference_pilot');
  assert.equal(receipt.phase, phase);
  assert.equal(receipt.passed, true);
  assert.equal(receipt.before.fileHash, originalHash);
  assert.equal(receipt.after.walletCount, 18);
  assert.equal(receipt.after.bindingCount, 30);
  assert.equal(receipt.after.globalOwnerCount, 6);
  assert.ok(Object.values(receipt.mutations).every(value => value === false));
  for (const field of financialFields) {
    assert.ok(Number.isSafeInteger(receipt.probeLifecycle.before.counts[field]));
    assert.ok(Number.isSafeInteger(receipt.probeLifecycle.after.counts[field]));
  }
  return { file: path.basename(file), sha256: hash(raw), receipt };
}
try {
  assert.equal(process.argv.length, 4);
  const before = readReceipt(process.argv[2], 'before');
  const after = readReceipt(process.argv[3], 'after');
  assert.ok(Date.parse(after.receipt.startedUtc) > Date.parse(before.receipt.utc));
  assert.equal(before.receipt.referenceDatabaseFingerprint, after.receipt.referenceDatabaseFingerprint);
  assert.equal(before.receipt.qaDatabaseFingerprint, after.receipt.qaDatabaseFingerprint);
  const first = before.receipt.probeLifecycle.before;
  const last = after.receipt.probeLifecycle.after;
  const delta = Object.fromEntries(Object.keys(first.counts).map(field => [field, last.counts[field] - first.counts[field]]));
  const checks = {
    fullWindowFinancialCountersUnchanged: financialFields.every(field => delta[field] === 0),
    originalOwnersExact: before.receipt.after.fingerprints.owners === after.receipt.after.fingerprints.owners,
    originalWalletsExact: before.receipt.after.fingerprints.wallets === after.receipt.after.fingerprints.wallets,
    originalAssociationsExact: before.receipt.after.fingerprints.bindings === after.receipt.after.fingerprints.bindings,
    originalExternalPermissionsExact: before.receipt.after.fingerprints.externalPermissions === after.receipt.after.fingerprints.externalPermissions,
  };
  const evidence = { utc: new Date().toISOString(), mode: 'offline_original_reference_pilot_window',
    receipts: { before: { file: before.file, sha256: before.sha256 }, after: { file: after.file, sha256: after.sha256 } },
    originalReferenceHash: originalHash, window: { from: first.utc, to: last.utc, first: first.counts, last: last.counts, delta },
    checks, passed: Object.values(checks).every(Boolean),
    limitations: ['Equal counters prove no net row-count growth for the listed financial tables within this full window; SELECT receipts do not establish every financial row value or external chain activity.',
      'Conversation and message growth are reported separately and do not establish independent tester or phone acceptance.'] };
  const file = path.join(work, `pilot-production-window-oct4-source7ed-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ file, ...evidence }, null, 2));
  if (!evidence.passed) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ error: 'pilot_window_receipt_comparison_failed_no_private_details_logged' }));
  process.exitCode = 1;
}
