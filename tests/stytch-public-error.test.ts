import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOAuthAuthenticationError, publicOAuthError } from "../app/stytch/public-error";

test("OAuth only returns exact allowlisted codes and preserves meaningful HTTP status", () => {
  for (const operation of ["authorize", "preflight"] as const) {
    for (const [code, status] of [
      ["invalid_origin", 403], ["privy_access_token_missing", 401],
      ["privy_access_token_invalid", 401], ["privy_not_configured", 503],
      ["stytch_config_missing_stytch_secret", 503], ["stytch_config_invalid_project_domain", 503],
      ["oauth_resource_invalid", 400], ["oauth_subject_link_conflict", 400],
      ["stytch_oauth_scope_not_grantable", 400],
    ] as const) assert.deepEqual(publicOAuthError(new Error(code), operation), { code, status });
  }
});

test("OAuth strips database, SDK, JSON and lookalike errors without exposing details", () => {
  const errors = [
    new Error("postgresql://owner:private-password@example.test/db"),
    new Error("stytch_config_missing_secret-private-value"),
    new Error("oauth_resource_invalid: Bearer private-token"),
    new Error("private_token_that_looks_like_a_code"),
    new SyntaxError('Unexpected token in {"password":"private-password"}'),
    { message: "privy_not_configured", token: "private-token" },
    null,
  ];
  for (const error of errors) {
    assert.deepEqual(publicOAuthError(error, "authorize"), { code: "oauth_authorization_failed", status: 400 });
    assert.deepEqual(publicOAuthError(error, "preflight"), { code: "oauth_preflight_failed", status: 400 });
  }
});

test("Privy verification errors become an identifiable authentication rejection without SDK detail", () => {
  for (const error of [new Error("JWT expired: private-token"), new Error("SDK request with private-key"), null]) {
    assert.deepEqual(publicOAuthError(normalizeOAuthAuthenticationError(error), "authorize"), {
      code: "privy_access_token_invalid", status: 401,
    });
  }
  for (const code of ["privy_not_configured", "privy_access_token_missing"]) {
    assert.equal(normalizeOAuthAuthenticationError(new Error(code)).message, code);
  }
});
