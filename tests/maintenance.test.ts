import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { maintenanceBypass, maintenanceEnabled, maintenancePublicRead } from "../app/maintenance";

test("maintenance allows only explicitly public reads and requires a strong operational token", () => {
  assert.equal(maintenanceEnabled({}), false);
  assert.equal(maintenanceEnabled({ CARMELITA_MAINTENANCE_ENABLED: "true" }), true);
  for (const path of ["/agent", "/api/agent/bootstrap", "/api/mcp", "/admin/login", "/api/health/other"]) assert.equal(maintenancePublicRead(path, "GET"), false);
  assert.equal(maintenancePublicRead("/api/health", "POST"), false);
  assert.equal(maintenancePublicRead("/api/health", "GET"), true);
  assert.equal(maintenanceBypass("short", { CARMELITA_MAINTENANCE_ACCESS_TOKEN: "short" }), false);
  assert.equal(maintenanceBypass("x".repeat(32), { CARMELITA_MAINTENANCE_ACCESS_TOKEN: "y".repeat(32) }), false);
});

test("proxy blocks writes and pages, preserves auth downstream, and strips its operational credential", () => {
  const saved = { enabled: process.env.CARMELITA_MAINTENANCE_ENABLED, token: process.env.CARMELITA_MAINTENANCE_ACCESS_TOKEN };
  process.env.CARMELITA_MAINTENANCE_ENABLED = "true";
  process.env.CARMELITA_MAINTENANCE_ACCESS_TOKEN = "test-only-".repeat(8);
  try {
    for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const response = proxy(new NextRequest("https://example.test/api/agent/bootstrap", { method }));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal(proxy(new NextRequest("https://example.test/agent")).status, 503);
    assert.equal(proxy(new NextRequest("https://example.test/api/health")).headers.get("x-middleware-next"), "1");
    const response = proxy(new NextRequest("https://example.test/api/agent/wallets", { headers: { "x-carmelita-maintenance-access": process.env.CARMELITA_MAINTENANCE_ACCESS_TOKEN, authorization: "Bearer fixture" } }));
    assert.equal(response.headers.get("x-middleware-request-authorization"), "Bearer fixture");
    assert.equal(response.headers.get("x-middleware-request-x-carmelita-maintenance-access"), null);
  } finally {
    if (saved.enabled === undefined) delete process.env.CARMELITA_MAINTENANCE_ENABLED; else process.env.CARMELITA_MAINTENANCE_ENABLED = saved.enabled;
    if (saved.token === undefined) delete process.env.CARMELITA_MAINTENANCE_ACCESS_TOKEN; else process.env.CARMELITA_MAINTENANCE_ACCESS_TOKEN = saved.token;
  }
});
