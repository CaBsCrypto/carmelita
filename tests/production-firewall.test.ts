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

test("supports disjoint exact-host groups within the provider limit without broadening health exceptions", () => {
  const c = configuration();
  const second = structuredClone(c.active.rules[0].conditionGroup[0]);
  second.conditions[0].value = ["additional.vercel.app"];
  c.active.rules[0].conditionGroup.push(second);
  assert.deepEqual(verifyPublishedFirewall(c, evidence.ruleId), ["additional.vercel.app", ...hosts].sort());
  second.conditions[1].value = "/api";
  assert.throws(() => verifyPublishedFirewall(c, evidence.ruleId));
  second.conditions[1].value = "/api/health";
  second.conditions[0].value = [hosts[0]];
  assert.throws(() => verifyPublishedFirewall(c, evidence.ruleId));
  second.conditions[0].value = Array.from({ length: 76 }, (_, i) => `host-${i}.vercel.app`);
  assert.throws(() => verifyPublishedFirewall(c, evidence.ruleId));
});

test("requires the production custom domain to be covered and rejects unapproved domains", async () => {
  const f = fixture();
  f.aliases.push({ alias: "carmelita.browns.studio", projectId: project, deploymentId: "dpl_prod" });
  await assert.rejects(verifyFirewallMaintenance(evidence, f.dependencies));
  f.config.active.rules[0].conditionGroup[0].conditions[0].value = [...hosts, "carmelita.browns.studio"];
  assert.equal((await verifyFirewallMaintenance(evidence, f.dependencies)).blockedHosts, 3);
  assert.ok(f.probes.includes("https://carmelita.browns.studio/api/agent/wallets"));
  for (const invalid of ["other.browns.studio", "carmelita.browns.studio.attacker.test", "*.browns.studio"]) {
    f.config.active.rules[0].conditionGroup[0].conditions[0].value = [...hosts, invalid];
    await assert.rejects(verifyFirewallMaintenance(evidence, f.dependencies));
  }
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

test("accepts reordered JSON object keys but rejects actual configuration changes", async () => {
  function reorder(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)]));
    return value;
  }
  for (const changed of [false, true]) {
    const f = fixture(), original = f.dependencies.read;
    let calls = 0;
    f.dependencies.read = async path => {
      const result = await original(path);
      if (!path.includes("firewall/config") || ++calls !== 2) return result;
      const copy = structuredClone(f.config);
      if (changed) copy.active.rules[0].conditionGroup[0].conditions[0].value = [...hosts, "new.vercel.app"];
      return reorder(copy);
    };
    if (changed) await assert.rejects(verifyFirewallMaintenance(evidence, f.dependencies));
    else assert.equal((await verifyFirewallMaintenance(evidence, f.dependencies)).blockedHosts, 2);
  }
});

test("SSO redirects require an authenticated deny on the exact host and path", async () => {
  const build = (status: number, location = "https://vercel.com/sso-api?next=test") => {
    const f = fixture();
    f.dependencies.request = async input => new Response(null, new URL(String(input)).pathname === "/api/health"
      ? { status: 200 } : { status: 302, headers: { location } });
    const authenticated: string[] = [];
    f.dependencies.readProtectedStatus = async (hostname, pathname) => { authenticated.push(hostname + pathname); return status; };
    return { ...f, authenticated };
  };
  const f = build(403);
  await verifyFirewallMaintenance(evidence, f.dependencies);
  assert.deepEqual(f.authenticated.sort(), hosts.flatMap(h => [h + "/agent", h + "/api/agent/wallets"]).sort());
  for (const status of [200, 401, 302, 404, 410, 503]) await assert.rejects(verifyFirewallMaintenance(evidence, build(status).dependencies));
  for (const location of ["https://vercel.com.attacker.test/sso-api", "http://vercel.com/sso-api", "https://vercel.com/login", "/sso-api"])
    await assert.rejects(verifyFirewallMaintenance(evidence, build(403, location).dependencies));
  const missing = build(403); delete missing.dependencies.readProtectedStatus;
  await assert.rejects(verifyFirewallMaintenance(evidence, missing.dependencies));
  const failed = build(403); failed.dependencies.readProtectedStatus = async () => { throw new Error("probe failed"); };
  await assert.rejects(verifyFirewallMaintenance(evidence, failed.dependencies));
});
test("retired blocked hosts and orphan aliases may answer 410, live ones must stay 403", async () => {
  const build = () => {
    const f = fixture();
    f.config.active.rules[0].conditionGroup[0].conditions[0].value = [...hosts, "retired.vercel.app"];
    f.aliases.push({ alias: "gone.vercel.app", projectId: project, deploymentId: "dpl_gone" });
    const original = f.dependencies.request;
    f.dependencies.request = async input => {
      const url = new URL(String(input));
      if (url.hostname === "retired.vercel.app" || url.hostname === "gone.vercel.app") return new Response(null, { status: 410 });
      return original(input);
    };
    return f;
  };
  const passing = build();
  assert.deepEqual(await verifyFirewallMaintenance(evidence, passing.dependencies), { mode: "firewall", blockedHosts: 4, isolatedDeployments: 1 });
  for (const mutate of [
    f => { const original = f.dependencies.request; f.dependencies.request = async input => new URL(String(input)).hostname === "retired.vercel.app" ? new Response(null, { status: 200 }) : original(input); },
    f => { const original = f.dependencies.request; f.dependencies.request = async input => new URL(String(input)).hostname === "gone.vercel.app" ? new Response(null, { status: 308 }) : original(input); },
    f => { const original = f.dependencies.request; f.dependencies.request = async input => new URL(String(input)).hostname === "legacy.vercel.app" ? new Response(null, { status: 410 }) : original(input); },
  ]) { const f = build(); mutate(f); await assert.rejects(verifyFirewallMaintenance(evidence, f.dependencies)); }
});

test("only an inventoried retired host may use Vercel DEPLOYMENT_NOT_FOUND as absence evidence", async () => {
  for (const [live, error, accepted] of [[false, "DEPLOYMENT_NOT_FOUND", true], [false, "", false], [false, "NOT_FOUND", false], [true, "DEPLOYMENT_NOT_FOUND", false]] as const) {
    const f = fixture();
    const hostname = live ? "legacy.vercel.app" : "retired.vercel.app";
    if (!live) f.config.active.rules[0].conditionGroup[0].conditions[0].value = [...hosts, hostname];
    const original = f.dependencies.request;
    f.dependencies.request = async (input, options) => new URL(String(input)).hostname === hostname
      ? new Response(null, { status: 404, headers: { "x-vercel-error": error } }) : original(input, options);
    if (accepted) assert.equal((await verifyFirewallMaintenance(evidence, f.dependencies)).blockedHosts, 3);
    else await assert.rejects(verifyFirewallMaintenance(evidence, f.dependencies));
  }
});
