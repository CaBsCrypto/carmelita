/** This acceptance never reads the application's DATABASE_URL or any .env file. */
export function localProposalPostgresConfig(connection) {
  if (!connection) throw new Error("proposal_pg_url_required");
  let url;
  try { url = new URL(connection); } catch { throw new Error("proposal_pg_url_invalid"); }
  const host = url.hostname === "[::1]" ? "::1" : url.hostname;
  if (!/^postgres(?:ql)?:$/.test(url.protocol) || !["127.0.0.1", "::1"].includes(host)) {
    throw new Error("proposal_pg_loopback_required");
  }
  // Query parameters can override the validated host, SSL, service or search_path.
  if (url.search || url.hash) throw new Error("proposal_pg_url_options_forbidden");
  const database = url.pathname.slice(1);
  if (!/^carmelita_proposal_qa(?:_[a-z0-9_]{1,40})?$/.test(database)) {
    throw new Error("proposal_pg_disposable_database_required");
  }
  let user; let password;
  try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); }
  catch { throw new Error("proposal_pg_credentials_invalid"); }
  if (!user || user.length > 63 || /[\u0000-\u001f]/.test(user + password)) {
    throw new Error("proposal_pg_credentials_invalid");
  }
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("proposal_pg_port_invalid");
  return {
    host, port, user, password, database, ssl: false,
    application_name: "carmelita-proposal-local-acceptance",
    connectionTimeoutMillis: 5000, query_timeout: 5000,
  };
}

export function proposalPostgresSchema(name) {
  if (!/^carmelita_proposal_qa_[a-f0-9]{32}$/.test(name)) throw new Error("proposal_pg_schema_invalid");
  return `"${name}"`;
}
