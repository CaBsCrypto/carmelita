import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildVercelCurlArgs,
  deploymentArg,
  parsePreviewBody,
  parseVercelCurlOutput,
  redactAcceptanceSecrets,
} from "../scripts/agent-gateway-preview-acceptance";

test("Preview acceptance redacts personal credentials from failures", () => {
  const token = "carmelita_user_sensitive_example";
  assert.equal(
    redactAcceptanceSecrets(`request failed for ${token}`, [token]),
    "request failed for [REDACTED_PAT]",
  );
});

test("Preview acceptance invokes Vercel without a shell", async () => {
  const args = buildVercelCurlArgs({
    deployment: "https://example-preview.vercel.app",
    path: "/api/v1/actions/plan",
    token: "carmelita_user_test",
    method: "POST",
    body: { capabilityId: "stellar.wallet.status" },
  });
  assert.deepEqual(args.slice(0, 4), [
    "curl",
    "/api/v1/actions/plan",
    "--deployment",
    "https://example-preview.vercel.app",
  ]);
  assert.ok(args.includes("Authorization: Bearer carmelita_user_test"));
  assert.ok(args.includes("--write-out"));
  const source = await readFile(new URL("../scripts/agent-gateway-preview-acceptance.ts", import.meta.url), "utf8");
  assert.match(source, /spawn\([^;]+shell: false/);
});

test("Preview acceptance parses an explicit HTTP status marker", () => {
  assert.deepEqual(
    parseVercelCurlOutput('{"ok":true}\n__CARMELITA_HTTP_STATUS__:201'),
    { status: 201, body: { ok: true } },
  );
  assert.throws(
    () => parseVercelCurlOutput('{"ok":true}'),
    /preview_acceptance_status_missing/,
  );
});


test("Preview acceptance parses MCP Streamable HTTP SSE", () => {
  assert.deepEqual(
    parsePreviewBody('event: message\ndata: {"jsonrpc":"2.0","id":"tools-1","result":{"tools":[]}}\n'),
    { jsonrpc: "2.0", id: "tools-1", result: { tools: [] } },
  );
  const args = buildVercelCurlArgs({
    deployment: "https://example-preview.vercel.app",
    path: "/api/mcp/agent",
    token: "carmelita_user_test",
    method: "POST",
    accept: "application/json, text/event-stream",
    headers: ["MCP-Protocol-Version: 2025-11-25"],
    body: { jsonrpc: "2.0", id: "init-1", method: "initialize", params: {} },
  });
  assert.ok(args.includes("Accept: application/json, text/event-stream"));
  assert.ok(args.includes("MCP-Protocol-Version: 2025-11-25"));
});


test("Preview acceptance accepts positional and named deployment URLs", () => {
  assert.equal(deploymentArg(["node", "script", "https://preview.vercel.app"]), "https://preview.vercel.app");
  assert.equal(deploymentArg(["node", "script", "--deployment", "https://named.vercel.app"]), "https://named.vercel.app");
});

test("Preview acceptance preserves HTTP status for non-JSON bodies", () => {
  assert.deepEqual(
    parseVercelCurlOutput('<!doctype html><title>Not Found</title>\n__CARMELITA_HTTP_STATUS__:404'),
    {
      status: 404,
      body: {
        nonJson: true,
        raw: "<!doctype html><title>Not Found</title>",
      },
    },
  );
});
