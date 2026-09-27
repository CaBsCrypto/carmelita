import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Reproducible compatibility candidate. No deployment, secrets or database access.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = "dcbb20ef520cb167b582f51263c0660793d94161";
const fix = "82a49092ecfd8f22bd195040b9da52735f94532a";
const name = process.argv[2] ?? "production-compatible-generated";
if (process.argv.length > 3 || !/^production-compatible-[a-z0-9-]+$/.test(name)) throw new Error("invalid_candidate_directory");
const destination = resolve(root, "work", name);
const archive = destination + ".tar";
const git = (...args) => execFileSync("git", args, { cwd: root, windowsHide: true });
const source = (commit, path) => git("show", `${commit}:${path}`).toString("utf8");
mkdirSync(destination); // Refuse an existing workspace; never delete or overwrite it.
git("archive", "--format=tar", `--output=${archive}`, base);
execFileSync("tar", ["-xf", archive, "-C", destination], { windowsHide: true });
const files = [
  "package.json", "package-lock.json", ".nvmrc", ".vercelignore", ".npmignore", "vercel.json",
  "app/privy-stellar.ts", "app/wallets/privy.ts", "app/webmcp-client.ts", "app/webmcp-registry.tsx",
  "app/agent/webmcp-inspector.tsx", "app/maintenance.ts", "proxy.ts",
  "tests/privy-stellar.test.ts", "tests/multichain-wallets.test.ts", "tests/stellar-canonical-wallet.test.ts",
];
const manifest = { base, fix, files: [], deployed: false };
function save(path, content) {
  writeFileSync(resolve(destination, path), content);
  manifest.files.push({ path, sha256: createHash("sha256").update(content).digest("hex") });
}
for (const path of files) save(path, source(fix, path));
const current = source(fix, "app/multichain-account.ts");
const start = current.indexOf("export async function getCanonicalEvmWallet");
const end = current.indexOf("export async function listPersistedUserWallets", start);
if (start < 0 || end <= start) throw new Error("canonical_lookup_markers_changed");
const legacy = source(base, "app/multichain-account.ts");
if (!legacy.includes('import { desc, eq, or }')) throw new Error("legacy_import_changed");
save("app/multichain-account.ts", legacy.replace('import { desc, eq, or }', 'import { and, desc, eq, or }') + "\n" + current.slice(start, end));
writeFileSync(destination + "-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ destination, base, fix, deployed: false }));
