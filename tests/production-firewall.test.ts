import assert from "node:assert/strict";
import test from "node:test";
import { verifyFirewallMaintenance, verifyPublishedFirewall, type FirewallDependencies } from "../scripts/production-firewall";

const project = "prj_UQnTOdi1AWU6soTr04ACsqNo7YDu", team = "team_XjolcoWJ9V9yamVnCdpC7EMY";
const hosts = ["carmelita-agent.vercel.app", "legacy.vercel.app"];
const evidence = { ruleId: "rule_maintenance", deploymentId: "dpl_prod", qaFingerprint: "a".repeat(64) };
function configuration() {
  return { draft: null, active: { projectKey: `${project}#active`, ownerId: team, firewallEnabled: true, changes: [], ips: [],
    rules: [{ id: evidence.ruleId, active: true, valid: true, action: { mitigate: { action: "deny", actionDuration: null } },
      conditionGroup: [{ conditions: [{ type: "host", op: "inc", value: hosts }, { type: "path", op: "neq", value: "/api/health" }] }] }] } };
}
function fixture() {
  const config = configuration();
  const deployments = [{ uid: "dpl_prod", url: "legacy.vercel.app", state: "READY", target: "production" },
    { uid: "dpl_qa", url: "qa.vercel.app", state: "READY", target: null }];
  const aliases = [{ alias: hosts[0], projectId: project, deploymentId: "dpl_prod" },
    { alias: "qa-alias.vercel.app", projectId: project, deploymentId: "dpl_qa" }];
  const probes: string[] = [];
  const dependencies: FirewallDependencies = {
    read: async path => path.includes("firewall/config") ? config : path.includes("deployments")
      ? { deployments, pagination: { next: null } } : { aliases, pagination: { next: null } },
    readQaHealth: async () => ({ status: "ok", previewIsolation: { verified: true, databaseFingerprint: evidence.qaFingerprint }, deployment: { environment: "preview" } }),
    request: async input => {
      const url = new URL(String(input)); probes.push(url.toString());
      return new Response(null, { status: url.pathname === "/api/health" ? 200 : 403 });
    },
  };
  return { config, deployments, aliases, probes, dependencies };
}
test("requires an active exact-host rule, not a draft, broad match or 403 alone", () => {
  assert.deepEqual(verifyPublishedFirewall(configuration(), evidence.ruleId), [...hosts].sort());
  const cases: Array<(config: ReturnType<typeof configuration>) => void> = [
    c => { c.active.firewallEnabled = false; }, c => { c.active.rules[0].active = false; },
    c => { c.active.ownerId = "other"; }, c => { c.active.projectKey = "other#active"; },
    c => { c.active.rules[0].conditionGroup[0].conditions[0].op = "ninc"; },
    c => { c.active.rules[0].conditionGroup[0].conditions[0].value = ["legacy.vercel.app"]; },
    c => { c.active.rules[0].conditionGroup[0].conditions[1].value = "/api"; },
    c => { c.active.rules[0].conditionGroup.push(c.active.rules[0].conditionGroup[0]); },
    c => { c.active.rules.push({ ...c.active.rules[0], id: "rule_bypass" }); },
  ];
  for (const mutate of cases) { const c = configuration(); mutate(c); assert.throws(() => verifyPublishedFirewall(c, evidence.ruleId)); }
  assert.throws(() => verifyPublishedFirewall({ ...configuration(), draft: {} }, evidence.ruleId));
});
test("verifies all writer hosts and excludes only runtime-verified QA", async () => {
  const f = fixture();
  assert.deepEqual(await verifyFirewallMaintenance(evidence, f.dependencies), { mode: "firewall", blockedHosts: 2, isolatedDeployments: 1 });
  assert.equal(f.probes.filter(p => p.endsWith("/api/agent/wallets")).length, 2);
});
test("rejects uncovered production, aliases, builds, QA drift and protection redirects", async () => {
  const cases: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => { f.deployments.push({ uid: "dpl_new", url: "new.vercel.app", state: "READY", target: "production" }); },
    f => { f.aliases.push({ alias: "uncovered.vercel.app", projectId: project, deploymentId: "dpl_prod" }); },
    f => { f.deployments[0].state = "BUILDING"; },
    f => { f.aliases[0].deploymentId = "dpl_old"; },
    f => { f.dependencies.readQaHealth = async () => ({ status: "ok", previewIsolation: { verified: true, databaseFingerprint: "b".repeat(64) }, deployment: { environment: "preview" } }); },
    f => { f.dependencies.request = async () => new Response(null, { status: 307 }); },
    f => { f.dependencies.request = async () => new Response(null, { status: 200 }); },
  ];
  for (const mutate of cases) { const f = fixture(); mutate(f); await assert.rejects(verifyFirewallMaintenance(evidence, f.dependencies)); }
});
test("detects draft or inventory changes during verification", async () => {
  for (const change of ["config", "deployments", "aliases"]) {
    const f = fixture(), original = f.dependencies.read;
    let calls = 0;
    f.dependencies.read = async path => {
      const match = change === "config" ? "firewall/config" : change;
      const result = await original(path);
      if (path.includes(match) && ++calls === 2) {
        if (change === "config") return { ...f.config, draft: {} };
        return { [change]: [], pagination: { next: null } };
      }
      return result;
    };
    await assert.rejects(verifyFirewallMaintenance(evidence, f.dependencies));
  }
});
