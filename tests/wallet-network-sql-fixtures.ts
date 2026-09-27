import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildWalletPersistenceStatements,
  setPersistedWalletNetworkStatus,
  type PersistWalletNetworksInput,
  type WalletPersistenceStatement,
} from "../app/multichain-account";

export type WalletNetworkSqlFixture = {
  name: string;
  statements: WalletPersistenceStatement[];
  expectedErrorCode?: "22012" | "23505" | "23503" | "P0001";
};
const statement = (text: string, parameters: unknown[] = []): WalletPersistenceStatement => ({ text, parameters });
const userA = "did:privy:sql-fixture-a";
const userB = "did:privy:sql-fixture-b";
const addressA = `0x${"aB".repeat(20)}`;
const addressB = `0x${"cD".repeat(20)}`;
const networks = ["avalanche:fuji", "bnb:testnet", "base:sepolia"] as const;
const input = (userId = userA, id = "fixture-evm-a", address = addressA): PersistWalletNetworksInput => ({
  userId, email: null,
  wallet: { id, address, chainType: "ethereum", family: "evm", owner: "user", created: false },
  networks: [...networks],
});

const setup = [
  statement(`CREATE TEMP TABLE agent_users (
    id text PRIMARY KEY, email text, status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  ) ON COMMIT DROP`),
  statement(`CREATE TEMP TABLE agent_wallets (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES agent_users(id), address text NOT NULL UNIQUE,
    chain_type text NOT NULL, network text NOT NULL, status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  ) ON COMMIT DROP`),
  statement(`CREATE TEMP TABLE agent_activities (
    id text PRIMARY KEY, user_id text NOT NULL REFERENCES agent_users(id), event_type text NOT NULL,
    summary text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
  ) ON COMMIT DROP`),
  statement(`CREATE TEMP TABLE fixture_receipts (id text PRIMARY KEY, wallet_id text NOT NULL, frozen_network text NOT NULL) ON COMMIT DROP`),
  statement("SET LOCAL search_path = pg_temp"),
  statement(`SELECT 1 / CASE WHEN count(*) = 4 AND bool_and(relpersistence = 't' AND relnamespace = pg_my_temp_schema())
    THEN 1 ELSE 0 END AS only_temporary_tables FROM pg_class
    WHERE oid IN ('agent_users'::regclass, 'agent_wallets'::regclass, 'agent_activities'::regclass, 'fixture_receipts'::regclass)`),
  statement("INSERT INTO agent_users(id) VALUES ($1), ($2)", [userA, userB]),
  statement(`INSERT INTO agent_wallets(id, user_id, address, chain_type, network, status) VALUES
    ('fixture-stellar-a', $1, 'fixture-stellar-address-a', 'stellar', 'stellar:testnet', 'pending'),
    ('fixture-evm-a', $1, $3, 'ethereum', 'avalanche:fuji', 'active'),
    ('fixture-solana-a', $1, 'fixture-solana-address-a', 'solana', 'solana:devnet', 'active'),
    ('fixture-stellar-b', $2, 'fixture-stellar-address-b', 'stellar', 'stellar:testnet', 'active'),
    ('fixture-evm-b', $2, $4, 'ethereum', 'avalanche:fuji', 'active'),
    ('fixture-solana-b', $2, 'fixture-solana-address-b', 'solana', 'solana:devnet', 'active')`, [userA, userB, addressA, addressB]),
  statement("INSERT INTO fixture_receipts(id, wallet_id, frozen_network) VALUES ('receipt-a', 'fixture-evm-a', 'eip155:43113'), ('receipt-b', 'fixture-stellar-b', 'stellar:testnet')"),
];

/** No connection is opened here. Run each scenario as ONE transaction on guarded QA. */
export async function buildWalletNetworkSqlFixtures(): Promise<WalletNetworkSqlFixture[]> {
  const raw = (await readFile(new URL("../drizzle/0020_wallet_networks.sql", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.equal((raw.match(/CREATE TABLE "agent_wallet_networks"/g) ?? []).length, 1);
  assert.equal((raw.match(/ON DELETE cascade\n\);/g) ?? []).length, 1);
  // Only the new table's lifetime is changed. The actual migration checks,
  // indexes, foreign key and backfill run unchanged against temporary tables.
  const temporaryMigration = raw.replace('CREATE TABLE "agent_wallet_networks"', 'CREATE TEMP TABLE "agent_wallet_networks"')
    .replace("ON DELETE cascade\n);", "ON DELETE cascade\n) ON COMMIT DROP;");
  const migration = temporaryMigration.split("--> statement-breakpoint").map((text) => statement(text.trim())).filter(({ text }) => text.length > 0);
  const migrated = [...setup, ...migration,
    statement(`SELECT 1 / CASE WHEN count(*) = 5 AND bool_and(relpersistence = 't' AND relnamespace = pg_my_temp_schema())
      THEN 1 ELSE 0 END AS only_temporary_tables FROM pg_class WHERE oid IN (
        'agent_users'::regclass, 'agent_wallets'::regclass, 'agent_activities'::regclass, 'fixture_receipts'::regclass, 'agent_wallet_networks'::regclass)`),
    statement(`SELECT 1 / CASE WHEN (SELECT count(*) FROM agent_wallet_networks) = 6 AND NOT EXISTS (
      SELECT 1 FROM agent_wallets w LEFT JOIN agent_wallet_networks n ON n.wallet_id = w.id AND n.user_id = w.user_id AND n.network = w.network
      WHERE n.wallet_id IS NULL OR n.status <> w.status OR n.created_at <> w.created_at OR n.updated_at <> w.updated_at
    ) THEN 1 ELSE 0 END AS backfill_preserved`),
  ];
  let statusStatements: WalletPersistenceStatement[] = [];
  await setPersistedWalletNetworkStatus({ userId: userA, walletId: "fixture-evm-a", network: "bnb:testnet", status: "pending" }, {
    transaction: async (statements) => { statusStatements = statements; },
  });
  return [{
    name: "backfill, five networks per user, retry, casing preservation and frozen receipt identity",
    statements: [...migrated,
      ...buildWalletPersistenceStatements(input()),
      ...buildWalletPersistenceStatements(input(userB, "fixture-evm-b", addressB)),
      ...buildWalletPersistenceStatements(input(userA, "fixture-evm-a", addressA.toLowerCase())),
      ...buildWalletPersistenceStatements(input(userB, "fixture-evm-b", addressB)),
      ...statusStatements,
      statement(`SELECT 1 / CASE WHEN
        (SELECT count(*) FROM agent_users) = 2 AND (SELECT count(*) FROM agent_wallets) = 6 AND
        (SELECT count(*) FROM agent_wallet_networks) = 10 AND
        (SELECT count(*) FROM agent_wallet_networks WHERE user_id = $1) = 5 AND
        (SELECT count(*) FROM agent_wallet_networks WHERE user_id = $2) = 5 AND
        (SELECT count(*) FROM agent_wallets WHERE chain_type = 'ethereum' AND network = 'avalanche:fuji' AND status = 'active') = 2 AND
        (SELECT address FROM agent_wallets WHERE id = 'fixture-evm-a') = $3 AND
        (SELECT status FROM agent_wallet_networks WHERE wallet_id = 'fixture-evm-a' AND network = 'bnb:testnet') = 'pending' AND
        (SELECT count(*) FROM fixture_receipts r JOIN agent_wallets w ON w.id = r.wallet_id) = 2 AND
        (SELECT frozen_network FROM fixture_receipts WHERE id = 'receipt-a') = 'eip155:43113' AND
        NOT EXISTS (SELECT 1 FROM agent_wallet_networks n JOIN agent_wallets w ON w.id = n.wallet_id WHERE n.user_id <> w.user_id)
      THEN 1 ELSE 0 END AS identity_and_networks_preserved`, [userA, userB, addressA]),
    ],
  }, {
    name: "foreign owner cannot claim a canonical wallet ID", expectedErrorCode: "22012",
    statements: [...migrated, ...buildWalletPersistenceStatements(input(userB))],
  }, {
    name: "same owner cannot replace its EVM identity", expectedErrorCode: "23505",
    statements: [...migrated, ...buildWalletPersistenceStatements(input(userA, "fixture-evm-replacement", `0x${"ef".repeat(20)}`))],
  }, {
    name: "canonical address changes reject atomically", expectedErrorCode: "22012",
    statements: [...migrated, ...buildWalletPersistenceStatements(input(userA, "fixture-evm-a", `0x${"ef".repeat(20)}`))],
  }, {
    name: "case variants cannot transfer an EVM address to a new owner", expectedErrorCode: "23505",
    statements: [...migrated, ...buildWalletPersistenceStatements(input("did:privy:sql-fixture-c", "fixture-evm-c", addressA.toLowerCase()))],
  }, {
    name: "composite foreign key rejects cross-owner binding", expectedErrorCode: "23503",
    statements: [...migrated, statement("INSERT INTO agent_wallet_networks(wallet_id, user_id, network) VALUES ('fixture-evm-a', $1, 'bnb:testnet')", [userB])],
  }, {
    name: "migration rejects two legacy EVM identities for one owner", expectedErrorCode: "P0001",
    statements: [...setup, statement("INSERT INTO agent_wallets(id,user_id,address,chain_type,network) VALUES ('fixture-extra', $1, $2, 'ethereum', 'bnb:testnet')", [userA, `0x${"ef".repeat(20)}`]), ...migration],
  }, {
    name: "migration rejects legacy case-insensitive EVM collisions", expectedErrorCode: "P0001",
    statements: [...setup, statement("UPDATE agent_wallets SET address = $1 WHERE id = 'fixture-evm-b'", [addressA.toLowerCase()]), ...migration],
  }, {
    name: "migration rejects duplicate owner/network bindings", expectedErrorCode: "P0001",
    statements: [...setup, statement("INSERT INTO agent_wallets(id,user_id,address,chain_type,network) VALUES ('fixture-extra', $1, 'fixture-solana-extra', 'solana', 'solana:devnet')", [userA]), ...migration],
  }];
}

/** Dedicated-schema fixture only; the runner must set an exclusive search_path per transaction. */
export async function buildWalletNetworkConcurrencyFixture(): Promise<{
  setup: WalletPersistenceStatement[];
  input: PersistWalletNetworksInput;
  assertions: WalletPersistenceStatement[];
}> {
  const raw = await readFile(new URL("../drizzle/0020_wallet_networks.sql", import.meta.url), "utf8");
  const emptyTables = setup.slice(0, 3).map(({ text, parameters }) => {
    assert.ok(text.startsWith("CREATE TEMP TABLE ") && text.endsWith(" ON COMMIT DROP"));
    return statement(text.replace("CREATE TEMP TABLE ", "CREATE TABLE ").replace(/ ON COMMIT DROP$/, ""), parameters);
  });
  const concurrentInput = input();
  concurrentInput.wallet.created = true;
  return {
    setup: [...emptyTables, ...raw.split("--> statement-breakpoint").map((text) => statement(text.trim())).filter(({ text }) => text.length > 0)],
    input: concurrentInput,
    assertions: [statement(`SELECT 1 / CASE WHEN
      (SELECT count(*) FROM agent_users) = 1 AND
      (SELECT count(*) FROM agent_wallets) = 1 AND
      (SELECT count(*) FROM agent_wallet_networks) = 3 AND
      (SELECT count(*) FROM agent_activities) = 3 AND
      (SELECT address FROM agent_wallets WHERE id = $1 AND user_id = $2 AND network = 'avalanche:fuji') = $3 AND
      (SELECT count(*) FROM agent_wallet_networks WHERE wallet_id = $1 AND user_id = $2 AND status = 'active'
        AND network IN ('avalanche:fuji', 'bnb:testnet', 'base:sepolia')) = 3 AND
      (SELECT count(*) FROM pg_class WHERE oid IN (
        'agent_users'::regclass, 'agent_wallets'::regclass, 'agent_activities'::regclass, 'agent_wallet_networks'::regclass)
        AND relnamespace = current_schema()::regnamespace) = 4
      THEN 1 ELSE 0 END AS concurrent_replay_preserved`, [concurrentInput.wallet.id, concurrentInput.userId, concurrentInput.wallet.address])],
  };
}
