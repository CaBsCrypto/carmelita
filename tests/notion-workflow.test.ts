import assert from "node:assert/strict";
import test from "node:test";
import { createNotionWorkflowConnector } from "../app/orchestration/connectors/notion";
import { digestPreparedAction } from "../app/orchestration/types";

test("Notion workflow connector prepares a bounded read-only action", async () => {
  const connector = createNotionWorkflowConnector();
  assert.deepEqual(connector.capabilities, [{
    id: "workspace.search",
    operation: "read",
    description: "Search the authenticated user's Notion workspace",
  }]);
  const action = await connector.prepare({
    workflowId: "wf-notion-1",
    userId: "user-1",
    conversationId: "conversation-1",
    request: "Search my roadmap",
    parameters: { query: "roadmap" },
  }, "workspace.search");
  assert.equal(action.operation, "read");
  assert.equal(action.immutable.query, "roadmap");
  assert.equal(action.immutable.userId, "user-1");
  assert.match(digestPreparedAction(action), /^[a-f0-9]{64}$/);
});

test("Notion workflow verification rejects an empty MCP response", async () => {
  const connector = createNotionWorkflowConnector();
  const failed = await connector.verify({
    workflowId: "wf-notion-2",
    userId: "user-1",
    conversationId: "conversation-1",
    request: "Search",
    parameters: {},
  }, { tool: "notion-search", text: "" });
  assert.equal(failed[0]?.verified, false);
});

test("Notion workflow preserves explicit source links and true empty results", async () => {
  const source = { title: "Project tasks", url: "https://www.notion.so/tasks" };
  const context = { workflowId: "wf-sources", userId: "owner", conversationId: "conversation", request: "Search tasks", parameters: {} };
  for (const empty of [false, true]) {
    const connector = createNotionWorkflowConnector(async (userId) => {
      assert.equal(userId, "owner");
      return { tool: "notion-search", text: empty ? '{"results":[]}' : "Tasks", sources: empty ? [] : [source], empty };
    });
    const action = await connector.prepare(context, "workspace.search");
    const result = await connector.execute(context, action);
    assert.deepEqual(result.sources, empty ? [] : [source]);
    assert.equal(result.empty, empty);
    assert.equal((await connector.verify(context, result))[0].verified, true);
  }
});
