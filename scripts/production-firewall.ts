import { execFileSync } from "node:child_process";

const projectId = "prj_UQnTOdi1AWU6soTr04ACsqNo7YDu";
const teamId = "team_XjolcoWJ9V9yamVnCdpC7EMY";
const publicHost = "carmelita-agent.vercel.app";
type Json = Record<string, unknown>;
type Reader = (path: string) => Promise<unknown>;
export type FirewallDependencies = { read: Reader; request: typeof fetch; readQaHealth: (deploymentId: string) => Promise<unknown> };

function reject(): never { throw new Error("production_migration_firewall_unverified"); }
function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) return reject();
  return value as Json;
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : reject(); }
function host(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9-]+\.vercel\.app$/.test(value)) return reject();
  return value;
}
const scoped = (path: string) => `${path}${path.includes("?") ? "&" : "?"}projectId=${projectId}&teamId=${teamId}`;

/** Only the authenticated, read-only Vercel CLI API is invoked. No shell or token export. */
export function firewallDependencies(cliPath: string): FirewallDependencies {
  if (!cliPath) throw new Error("production_migration_missing_CARMELITA_VERCEL_CLI_PATH");
  return {
    read: async (path) => {
      try {
        return JSON.parse(execFileSync(process.execPath, [cliPath, "api", path, "--raw"], {
          encoding: "utf8", windowsHide: true, timeout: 30000,
          maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
        }));
      } catch { return reject(); }
    },
    request: fetch,
    readQaHealth: async (deploymentId) => {
      if (!/^dpl_[\w]+$/.test(deploymentId)) return reject();
      try {
        return JSON.parse(execFileSync(process.execPath, [cliPath, "curl", "/api/health", "--deployment", deploymentId,
          "--", "--silent", "--max-time", "15"], {
          encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        }));
      } catch { return reject(); }
    },
  };
}

export function verifyPublishedFirewall(value: unknown, ruleId: string): string[] {
  const envelope = object(value), active = object(envelope.active);
  if (envelope.draft != null || active.firewallEnabled !== true ||
      active.projectKey !== `${projectId}#active` || active.ownerId !== teamId ||
      list(active.changes).length || list(active.ips).length) return reject();
  const enabled = list(active.rules).map(object).filter(rule => rule.active === true);
  if (enabled.length !== 1 || enabled[0].id !== ruleId || enabled[0].valid !== true) return reject();
  const rule = enabled[0], action = object(object(rule.action).mitigate);
  if (action.action !== "deny" || action.actionDuration != null) return reject();
  const groups = list(rule.conditionGroup);
  if (groups.length !== 1) return reject();
  const conditions = list(object(groups[0]).conditions).map(object);
  if (conditions.length !== 2 || conditions.some(c => c.neg === true || c.key != null)) return reject();
  const hosts = conditions.find(c => c.type === "host" && c.op === "inc");
  const path = conditions.find(c => c.type === "path" && c.op === "neq" && c.value === "/api/health");
  if (!hosts || !path) return reject();
  const values = list(hosts.value).map(host);
  if (!values.length || new Set(values).size !== values.length || !values.includes(publicHost)) return reject();
  return values.sort();
}

async function inventory(read: Reader, path: string, key: string): Promise<Json[]> {
  const rows: Json[] = [], cursors = new Set<number>();
  let cursor: number | undefined;
  do {
    const page = object(await read(scoped(`${path}?limit=100${cursor === undefined ? "" : `&until=${cursor}`}`)));
    rows.push(...list(page[key]).map(object));
    const next = object(page.pagination).next;
    if (next == null) return rows;
    if (typeof next !== "number" || cursors.has(next) || rows.length >= 1000) return reject();
    cursors.add(next); cursor = next;
  } while (true);
}

/** Fresh control-plane verification plus probes; no DB writes, auth tokens or signed messages. */
export async function verifyFirewallMaintenance(
  evidence: { ruleId: string; deploymentId: string; qaFingerprint: string },
  dependencies: FirewallDependencies,
) {
  if (!/^rule_[\w-]+$/.test(evidence.ruleId) || !/^dpl_[\w]+$/.test(evidence.deploymentId) ||
      !/^[a-f0-9]{64}$/.test(evidence.qaFingerprint)) return reject();
  const readConfig = () => dependencies.read(scoped("/v1/security/firewall/config"));
  const initialConfig = await readConfig();
  const blocked = new Set(verifyPublishedFirewall(initialConfig, evidence.ruleId));
  const deployments = await inventory(dependencies.read, "/v6/deployments", "deployments");
  const aliases = await inventory(dependencies.read, "/v4/aliases", "aliases");
  if (deployments.some(d => !["READY", "ERROR", "CANCELED"].includes(String(d.state)))) return reject();
  const active = deployments.filter(d => d.state === "READY");
  if (!active.some(d => d.uid === evidence.deploymentId && d.target === "production") ||
      aliases.find(a => a.alias === publicHost)?.deploymentId !== evidence.deploymentId) return reject();
  const checked = new Set<string>();
  async function response(name: string, path: string) {
    return dependencies.request(`https://${name}${path}`, {
      method: "GET", cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15000),
    });
  }
  async function checkBlocked(name: string) {
    if (checked.has(name)) return;
    for (const path of ["/agent", "/api/agent/wallets"]) {
      const result = await response(name, path);
      const status = result.status;
      await result.body?.cancel();
      if (status !== 403) return reject();
    }
    checked.add(name);
  }
  const isolated = new Set<unknown>();
  for (const deployment of active) {
    const name = host(deployment.url);
    if (blocked.has(name)) { await checkBlocked(name); continue; }
    // Unblocked production deployments are writers, even if their health looks like QA.
    if (deployment.target === "production") return reject();
    if (typeof deployment.uid !== "string") return reject();
    const health = object(await dependencies.readQaHealth(deployment.uid)), isolation = object(health.previewIsolation);
    if (health.status !== "ok" || isolation.verified !== true ||
        isolation.databaseFingerprint !== evidence.qaFingerprint ||
        object(health.deployment).environment !== "preview") return reject();
    isolated.add(deployment.uid);
  }
  for (const alias of aliases) {
    if (alias.projectId !== projectId) return reject();
    const name = host(alias.alias);
    if (blocked.has(name)) await checkBlocked(name);
    else if (!isolated.has(alias.deploymentId)) return reject();
  }
  // Every explicitly blocked host is probed, including aliases whose deployment was retired.
  for (const name of blocked) await checkBlocked(name);
  const health = await response(publicHost, "/api/health");
  if (health.status !== 200) { await health.body?.cancel(); return reject(); }
  await health.body?.cancel();
  const finalConfig = await readConfig();
  verifyPublishedFirewall(finalConfig, evidence.ruleId);
  if (JSON.stringify(finalConfig) !== JSON.stringify(initialConfig)) return reject();
  const finalDeployments = await inventory(dependencies.read, "/v6/deployments", "deployments");
  const finalAliases = await inventory(dependencies.read, "/v4/aliases", "aliases");
  const signature = (rows: Json[], keys: string[]) => JSON.stringify(rows.map(row => keys.map(key => row[key])).sort());
  if (signature(deployments, ["uid", "url", "state", "target"]) !== signature(finalDeployments, ["uid", "url", "state", "target"]) ||
      signature(aliases, ["alias", "deploymentId", "projectId"]) !== signature(finalAliases, ["alias", "deploymentId", "projectId"])) return reject();
  return { mode: "firewall" as const, blockedHosts: checked.size, isolatedDeployments: isolated.size };
}
