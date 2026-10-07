const configurationErrors = new Set([
  "privy_not_configured",
  "stytch_config_disabled",
  "stytch_config_missing_carmelita_public_origin",
  "stytch_config_missing_stytch_project_domain",
  "stytch_config_missing_stytch_project_id",
  "stytch_config_missing_stytch_secret",
  "stytch_config_invalid_public_origin",
  "stytch_config_invalid_project_domain",
]);

const requestErrors = new Set([
  "stytch_email_required",
  "oauth_authorization_request_invalid",
  "oauth_response_type_unsupported",
  "oauth_pkce_method_unsupported",
  "oauth_pkce_required",
  "oauth_pkce_challenge_invalid",
  "oauth_resource_invalid",
  "stytch_user_id_invalid",
  "stytch_oauth_preflight_failed",
  "stytch_oauth_scope_not_grantable",
  "stytch_user_lookup_failed",
  "stytch_user_create_failed",
  "stytch_oauth_authorization_failed",
  "stytch_oauth_redirect_invalid",
  "oauth_subject_issuer_invalid",
  "oauth_subject_invalid",
  "oauth_subject_privy_did_invalid",
  "oauth_subject_link_conflict",
]);

// SDK errors can contain request details. Normalize only at the token-check boundary.
export function normalizeOAuthAuthenticationError(error: unknown): Error {
  const code = error instanceof Error ? error.message : "";
  return new Error(code === "privy_not_configured" || code === "privy_access_token_missing"
    ? code : "privy_access_token_invalid");
}

export function publicOAuthError(error: unknown, operation: "authorize" | "preflight") {
  const code = error instanceof Error ? error.message : "";
  if (["oauth_wallet_preparation_incomplete", "wallet_persistence_unavailable", "database_not_configured"].includes(code)) return { code: "oauth_wallet_preparation_incomplete", status: 503 };
  if (code === "wallet_identity_conflict") return { code, status: 409 };
  if (code === "invalid_origin") return { code, status: 403 };
  if (code === "privy_access_token_missing" || code === "privy_access_token_invalid") return { code, status: 401 };
  if (configurationErrors.has(code)) return { code, status: 503 };
  if (requestErrors.has(code)) return { code, status: 400 };
  return { code: operation === "authorize" ? "oauth_authorization_failed" : "oauth_preflight_failed", status: 400 };
}
