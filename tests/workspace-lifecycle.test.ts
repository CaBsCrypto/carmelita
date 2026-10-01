import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function source(path: string) {
  return ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T) {
  const found: T[] = [];
  function visit(node: ts.Node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(root);
  return found;
}
type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
function elements(root: ts.Node, name: string) {
  return nodes(root, (node): node is Opening => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === name);
}
function ancestors(node: ts.Node) {
  const parents: ts.Node[] = [];
  for (let parent = node.parent; parent; parent = parent.parent) parents.push(parent);
  return parents;
}
function attribute(element: Opening, name: string) {
  return element.attributes.properties.find((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText() === name)?.initializer?.getText() ?? "";
}
function functionNamed(root: ts.Node, name: string) {
  const found = nodes(root, ts.isFunctionDeclaration).find(node => node.name?.text === name);
  assert.ok(found, `${name} must exist`);
  return found;
}

// These architecture checks protect security/lifetime boundaries that pure helper
// tests cannot see. Visible focus, viewport and state retention need browser QA.
test("opening a workspace panel cannot unmount or re-key the single chat instance", () => {
  const root = source("app/agent/agent-onboarding.tsx");
  const chats = elements(root, "AgentChat");
  assert.equal(chats.length, 1);
  for (const node of ancestors(chats[0])) {
    if (ts.isBinaryExpression(node) || ts.isConditionalExpression(node)) {
      const condition = ts.isBinaryExpression(node) ? node.left.getText() : node.condition.getText();
      assert.doesNotMatch(condition, /\bpanel\b/, "Panel visibility must not own chat lifetime");
    }
    if (ts.isJsxElement(node)) assert.doesNotMatch(attribute(node.openingElement, "key"), /\bpanel\b/);
  }
  assert.match(attribute(chats[0], "key"), /\buserId\b/);
  assert.equal(attribute(chats[0], "initialDraft"), "{initialDraft}");
  assert.equal(elements(root, "WalletCenter").length, 0, "Detailed wallet views must not be duplicated");
  assert.equal(elements(root, "RegistryWalletPanel").length, 1);
});

test("owner identity is the workspace lifetime boundary rather than panel or locale state", () => {
  const root = source("app/agent/agent-onboarding.tsx");
  const workspace = elements(functionNamed(root, "PrivyAgent"), "PrivyWorkspace");
  assert.equal(workspace.length, 1);
  const key = attribute(workspace[0], "key");
  assert.match(key, /authenticated/);
  assert.match(key, /user\?\.id/);
  assert.doesNotMatch(key, /\bpanel\b|\blocale\b/);
});

test("wallet WebMCP registration stays mounted when developer diagnostics are closed", () => {
  const root = source("app/agent/agent-onboarding.tsx");
  const providers = elements(root, "WebMcpProvider");
  assert.equal(providers.length, 1);
  assert.ok(ancestors(elements(root, "AgentChat")[0]).includes(providers[0].parent));
  assert.ok(ancestors(elements(root, "WebMcpInspector")[0]).includes(providers[0].parent));
  const implementation = source("app/agent/webmcp-inspector.tsx");
  assert.ok(functionNamed(implementation, "WebMcpProvider").getText().includes("registerCarmelitaWebMcpTools"));
  assert.ok(!functionNamed(implementation, "WebMcpInspector").getText().includes("registerCarmelitaWebMcpTools"));
});

test("examples only fill the composer and cannot send or prepare an action automatically", () => {
  const chat = source("app/agent/agent-chat.tsx");
  const onboarding = source("app/agent/agent-onboarding.tsx");
  for (const fn of [functionNamed(chat, "suggestDraft"), functionNamed(onboarding, "suggest")]) {
    const calls = nodes(fn, ts.isCallExpression).map(call => call.expression.getText());
    assert.ok(calls.some(name => name === "setDraft" || name === "setDraftSuggestion"));
    assert.ok(calls.every(name => !/sendMessage|requestAgentChat|bootstrap|fetch|prepare/i.test(name)), fn.name?.text);
  }
});

test("shared reads cannot fall through to financial preparation and use the cancellable chat adapter", () => {
  const chat = source("app/agent/agent-chat.tsx");
  const send = functionNamed(chat, "sendMessage");
  const readRequest = nodes(send, ts.isCallExpression).find(call => call.expression.getText() === "requestAgentChat");
  assert.ok(readRequest);
  assert.equal(readRequest.arguments[1]?.getText(), "locale");
  const loads = nodes(send, ts.isCallExpression).filter(call => call.expression.getText() === "loadDefindex");
  assert.ok(loads.length > 0);
  assert.ok(loads.every(call => ancestors(call).some(node => ts.isIfStatement(node) && /!body\.sharedRead/.test(node.expression.getText()))));
  assert.ok(nodes(send, ts.isIfStatement).some(node => /signal\.aborted/.test(node.expression.getText()) && node.thenStatement.getText().includes("return")), "Ended sessions must not restore their failed draft");
});

test("opening a read-only wallet panel cannot call onboarding or wallet writers", () => {
  for (const path of ["app/agent/registry-wallet-panel.tsx", "app/agent/registry-wallet-model.ts", "app/agent/workspace-queries.ts"]) {
    const root = source(path);
    const calls = nodes(root, ts.isCallExpression).map(call => call.expression.getText());
    assert.ok(calls.every(name => !/bootstrap|provisionUserWallets|ensureAgentWallet|fundWallet|sendTransaction|rawSign/.test(name)), path);
  }
});
