import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { assertPreviewIsolation, requiresPreviewDatabaseIsolation, type PreviewIsolationEnvironment } from "../app/preview-isolation";
import { migratePreview } from "../scripts/preview-migrate";
import { getDatabaseUrl, getDb, hasDatabase } from "../db";
import { GET as health } from "../app/api/health/route";

function isolated(overrides: PreviewIsolationEnvironment = {}): PreviewIsolationEnvironment {
  return {
    CARMELITA_PREVIEW_ISOLATED: "true",
    CARMELITA_PREVIEW_DATABASE_HOST: "ep-qa.example.neon.tech",
    CARMELITA_PRODUCTION_DATABASE_HOST: "ep-production.example.neon.tech",
    CARMELITA_PREVIEW_ORIGIN: "https://carmelita-git-preview.example.vercel.app/",
    CARMELITA_PREVIEW_DEPLOYMENT: "dpl_preview123",
    CARMELITA_PREVIEW_DATABASE_URL: "postgresql://qa:fake-test-password@ep-qa-pooler.example.neon.tech/qa?sslmode=require",
    CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED: "postgresql://qa:fake-test-password@ep-qa.example.neon.tech/qa?sslmode=require",
    ...overrides,
  };
}

test("preview isolation accepts explicit pooled and direct connections to the same QA database", () => {
  const env = isolated();
  assert.deepEqual(assertPreviewIsolation(env), {
    databaseUrl: env.CARMELITA_PREVIEW_DATABASE_URL,
    migrationDatabaseUrl: env.CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED,
    previewOrigin: "https://carmelita-git-preview.example.vercel.app",
    deployment: "dpl_preview123",
  });
  assert.equal(assertPreviewIsolation(isolated({ DATABASE_URL_DATABASE_URL: env.CARMELITA_PREVIEW_DATABASE_URL })).deployment, "dpl_preview123");
});

test("preview isolation requires explicit opt-in and every connection/target field", () => {
  for (const key of ["CARMELITA_PREVIEW_ISOLATED", "CARMELITA_PREVIEW_DATABASE_HOST", "CARMELITA_PREVIEW_ORIGIN", "CARMELITA_PREVIEW_DEPLOYMENT", "CARMELITA_PREVIEW_DATABASE_URL", "CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED"]) {
    assert.throws(() => assertPreviewIsolation(isolated({ [key]: undefined })), /preview_isolation_/);
  }
  assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PREVIEW_ISOLATED: "TRUE" })), /not_enabled/);
  for (const key of ["CARMELITA_PREVIEW_DATABASE_URL", "CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED"]) {
    assert.throws(() => assertPreviewIsolation(isolated({
      [key]: undefined,
      DATABASE_URL: isolated().CARMELITA_PREVIEW_DATABASE_URL,
      DATABASE_URL_UNPOOLED: isolated().CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED,
      DATABASE_URL_DATABASE_URL: isolated().CARMELITA_PREVIEW_DATABASE_URL,
      DATABASE_URL_DATABASE_URL_UNPOOLED: isolated().CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED,
    })), new RegExp(`missing_${key}`));
  }
});

test("preview isolation rejects production origins, production environment and production endpoint", () => {
  for (const origin of ["https://carmelita-agent.vercel.app", "https://agente-asistente.vercel.app", "https://CARMELITA-AGENT.vercel.app./"]) {
    assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PREVIEW_ORIGIN: origin })), /invalid_origin/);
  }
  assert.throws(() => assertPreviewIsolation(isolated({ VERCEL_ENV: "production" })), /production_environment/);
  assert.throws(() => assertPreviewIsolation(isolated({ VERCEL_TARGET_ENV: "production" })), /production_environment/);
  assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PRODUCTION_DATABASE_HOST: "ep-qa-pooler.example.neon.tech" })), /production_database/);
});

test("preview isolation rejects URL and hostname tricks, TLS bypass and connection overrides", () => {
  for (const databaseUrl of [
    "postgresql://qa:password@ep-production.example.neon.tech/qa?sslmode=require",
    "postgresql://qa:password@ep-qa.example.neon.tech.evil.test/qa?sslmode=require",
    "postgresql://ep-qa.example.neon.tech:password@evil.test/qa?sslmode=require",
    "postgresql://qa:password@ep-qa.example.neon.tech/qa?sslmode=disable",
    "postgresql://qa:password@ep-qa.example.neon.tech/qa?sslmode=require&sslmode=disable",
    "postgresql://qa:password@ep-qa.example.neon.tech/qa?sslmode=require&host=ep-production.example.neon.tech",
    "postgresql://qa:password@ep-qa.example.neon.tech/qa?sslmode=require&options=endpoint%3Dep-production",
    "https://qa:password@ep-qa.example.neon.tech/qa?sslmode=require",
  ]) {
    assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PREVIEW_DATABASE_URL: databaseUrl })), /preview_isolation_/);
  }
  assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PREVIEW_DATABASE_HOST: "*.neon.tech" })), /invalid_CARMELITA_PREVIEW_DATABASE_HOST/);
  assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED: isolated().CARMELITA_PREVIEW_DATABASE_URL })), /migration_connection_pooled/);
});

test("preview isolation rejects dedicated connections to different databases or roles", () => {
  const env = isolated();
  assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED: env.CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED!.replace("/qa?", "/production?") })), /database_connections_disagree/);
  assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED: env.CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED!.replace("//qa:", "//other:") })), /database_connections_disagree/);
});

test("Preview ignores Marketplace production URLs and selects only the dedicated QA connection pair", async () => {
  const production = "postgresql://production:fake-prod-password@ep-production.example.neon.tech/production?sslmode=require";
  const env = isolated({
    VERCEL_ENV: "preview",
    DATABASE_URL: production,
    DATABASE_URL_UNPOOLED: production,
    DATABASE_URL_DATABASE_URL: production,
    DATABASE_URL_DATABASE_URL_UNPOOLED: production,
  });
  const config = assertPreviewIsolation(env);
  assert.equal(config.databaseUrl, env.CARMELITA_PREVIEW_DATABASE_URL);
  assert.equal(config.migrationDatabaseUrl, env.CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED);
  await withRuntimeEnvironment(env, async () => {
    assert.equal(getDatabaseUrl(), env.CARMELITA_PREVIEW_DATABASE_URL);
    assert.equal(hasDatabase(), true);
    const response = health();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.previewIsolation.databaseFingerprint,
      createHash("sha256").update("ep-qa.example.neon.tech/qa").digest("hex"));
    assert.equal(JSON.stringify(body).includes("ep-production"), false);
  });
});

test("local acceptance database access uses dedicated QA URLs without needing VERCEL_ENV", async () => {
  const production = "postgresql://production:fake-prod-password@ep-production.example.neon.tech/production?sslmode=require";
  await withRuntimeEnvironment(isolated({
    DATABASE_URL: production,
    DATABASE_URL_UNPOOLED: production,
    DATABASE_URL_DATABASE_URL: production,
  }), async () => {
    assert.equal(process.env.VERCEL_ENV, undefined);
    assert.equal(requiresPreviewDatabaseIsolation(), true);
    assert.equal(getDatabaseUrl(), isolated().CARMELITA_PREVIEW_DATABASE_URL);
    assert.equal(hasDatabase(), true);
    const { default: migrationConfig } = await import("../drizzle.config");
    assert.ok("dbCredentials" in migrationConfig && migrationConfig.dbCredentials && "url" in migrationConfig.dbCredentials);
    assert.equal(migrationConfig.dbCredentials.url, isolated().CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED);
  });
  for (const dedicated of [
    { CARMELITA_PREVIEW_ISOLATED: "true" },
    { CARMELITA_PREVIEW_DATABASE_URL: isolated().CARMELITA_PREVIEW_DATABASE_URL },
    { CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED: isolated().CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED },
  ]) {
    await withRuntimeEnvironment({ DATABASE_URL: production, ...dedicated }, () => {
      assert.equal(requiresPreviewDatabaseIsolation(), true);
      assert.throws(getDatabaseUrl, /preview_isolation_/);
      assert.throws(getDb, /preview_isolation_/);
    });
  }
  await withRuntimeEnvironment(isolated({ VERCEL_ENV: "production" }), () => {
    assert.throws(getDatabaseUrl, /preview_isolation_production_environment/);
  });
});

test("preview isolation requires an HTTPS origin and a safe explicit deployment", () => {
  for (const origin of ["http://preview.vercel.app", "https://user:pass@preview.vercel.app", "https://preview.vercel.app/chat", "https://preview.vercel.app?token=test", "not a URL"]) {
    assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PREVIEW_ORIGIN: origin })), /invalid_origin/);
  }
  for (const deployment of ["https://carmelita-agent.vercel.app", "agente-asistente.vercel.app", "--production", "dpl one", "https://user:pass@preview.vercel.app"]) {
    assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PREVIEW_DEPLOYMENT: deployment })), /invalid_deployment/);
  }
});

test("preview validation errors never expose supplied database credentials", () => {
  const secret = "unique-fake-test-secret";
  assert.throws(() => assertPreviewIsolation(isolated({ CARMELITA_PREVIEW_DATABASE_URL: `postgresql://qa:${secret}@production.invalid/qa` })), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /^preview_isolation_/);
    assert.equal(error.message.includes(secret), false);
    assert.equal(error.message.includes("production.invalid"), false);
    return true;
  });
});

test("preview migrator rejects incomplete configuration before opening a database connection", async () => {
  await assert.rejects(migratePreview({}), /preview_isolation_not_enabled/);
  await assert.rejects(migratePreview(isolated({
    CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED: undefined,
    DATABASE_URL_UNPOOLED: isolated().CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED,
  })), /missing_CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED/);
});

async function withRuntimeEnvironment(env: PreviewIsolationEnvironment, run: () => void | Promise<void>) {
  const keys = new Set([...Object.keys(isolated()), "DATABASE_URL", "DATABASE_URL_UNPOOLED", "DATABASE_URL_DATABASE_URL", "DATABASE_URL_DATABASE_URL_UNPOOLED", "VERCEL_ENV", "VERCEL_TARGET_ENV", "VERCEL_URL", "VERCEL_GIT_COMMIT_SHA", ...Object.keys(env)]);
  const previous = Object.fromEntries([...keys].map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    await run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("all Preview runtime database entrypoints reject unverified configuration before connecting", async () => {
  for (const overrides of [
    { CARMELITA_PREVIEW_ISOLATED: undefined },
    { CARMELITA_PREVIEW_DATABASE_URL: "postgresql://qa:fake-test-password@ep-production.example.neon.tech/qa?sslmode=require" },
    { CARMELITA_PREVIEW_DATABASE_URL: undefined, DATABASE_URL_DATABASE_URL: isolated().CARMELITA_PREVIEW_DATABASE_URL },
  ]) {
    await withRuntimeEnvironment(isolated({ VERCEL_ENV: "preview", ...overrides }), () => {
      assert.throws(getDatabaseUrl, /preview_isolation_/);
      assert.throws(hasDatabase, /preview_isolation_/);
      assert.throws(getDb, /preview_isolation_/);
    });
  }
  await withRuntimeEnvironment(isolated({ VERCEL_ENV: "preview" }), () => {
    assert.equal(getDatabaseUrl(), isolated().CARMELITA_PREVIEW_DATABASE_URL);
    assert.equal(hasDatabase(), true);
  });
});

test("Preview health returns deployment identity and only a normalized database fingerprint", async () => {
  await withRuntimeEnvironment(isolated({
    VERCEL_ENV: "preview",
    VERCEL_URL: "carmelita-immutable.example.vercel.app",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  }), async () => {
    const response = health();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.previewIsolation, {
      verified: true,
      databaseFingerprint: createHash("sha256").update("ep-qa.example.neon.tech/qa").digest("hex"),
    });
    assert.deepEqual(body.deployment, {
      environment: "preview",
      gitCommitSha: "a".repeat(40),
      url: "https://carmelita-immutable.example.vercel.app",
    });
    assert.equal(body.persistence, "postgres");
    for (const privateValue of ["fake-test-password", "ep-qa", "postgresql://"]) {
      assert.equal(JSON.stringify(body).includes(privateValue), false);
    }
    process.env.CARMELITA_PREVIEW_DATABASE_URL = process.env.CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED;
    assert.deepEqual((await health().json()).previewIsolation, body.previewIsolation);
    process.env.CARMELITA_PREVIEW_DATABASE_URL = process.env.CARMELITA_PREVIEW_DATABASE_URL!.replace("/qa?", "/%71a?");
    process.env.CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED = process.env.CARMELITA_PREVIEW_DATABASE_URL;
    assert.equal((await health().json()).previewIsolation.databaseFingerprint,
      createHash("sha256").update("ep-qa.example.neon.tech/%71a").digest("hex"));
  });
});

test("unverified Preview health returns 503 and never reports healthy memory fallback", async () => {
  await withRuntimeEnvironment({ VERCEL_ENV: "preview" }, async () => {
    const response = health();
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.status, "error");
    assert.equal(body.error, "preview_isolation_not_verified");
    assert.deepEqual(body.previewIsolation, { verified: false });
    assert.equal(body.persistence, undefined);
    assert.equal(body.previewIsolation.databaseFingerprint, undefined);
  });
});

test("Production database fallback and health contract remain available without Preview metadata", async () => {
  const connection = "postgresql://test:fake-test-password@production.invalid/test";
  await withRuntimeEnvironment({ VERCEL_ENV: "production", DATABASE_URL_DATABASE_URL: connection }, async () => {
    assert.equal(getDatabaseUrl(), connection);
    assert.equal(hasDatabase(), true);
    const response = health();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.equal(body.persistence, "postgres");
    assert.equal(body.previewIsolation, undefined);
    assert.equal(JSON.stringify(body).includes("production.invalid"), false);
    assert.equal(body.environment, "stellar-testnet");
    assert.equal(body.payments.mainnet, "disabled");
  });
});
