-- Preserve every Privy identity. Ambiguous legacy rows must be resolved explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "agent_wallets" WHERE "chain_type" = 'ethereum'
    GROUP BY "user_id" HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'wallet_migration_ambiguous_evm_owner'; END IF;
  IF EXISTS (
    SELECT 1 FROM "agent_wallets" WHERE "chain_type" = 'ethereum'
    GROUP BY lower("address") HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'wallet_migration_evm_address_conflict'; END IF;
  IF EXISTS (
    SELECT 1 FROM "agent_wallets" GROUP BY "user_id", "network" HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'wallet_migration_network_owner_conflict'; END IF;
  IF EXISTS (
    SELECT 1 FROM "agent_wallets" WHERE NOT (
      ("chain_type" = 'stellar' AND "network" = 'stellar:testnet') OR
      ("chain_type" = 'ethereum' AND "network" IN ('avalanche:fuji', 'bnb:testnet', 'base:sepolia')) OR
      ("chain_type" = 'solana' AND "network" = 'solana:devnet')
    )
  ) THEN RAISE EXCEPTION 'wallet_migration_network_family_conflict'; END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_wallets_id_user_uidx" ON "agent_wallets" ("id", "user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_wallets_evm_user_uidx" ON "agent_wallets" ("user_id") WHERE "chain_type" = 'ethereum';
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_wallets_evm_address_uidx" ON "agent_wallets" (lower("address")) WHERE "chain_type" = 'ethereum';
--> statement-breakpoint
CREATE TABLE "agent_wallet_networks" (
  "wallet_id" text NOT NULL,
  "user_id" text NOT NULL,
  "network" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_wallet_networks_pkey" PRIMARY KEY ("wallet_id", "network"),
  CONSTRAINT "agent_wallet_networks_wallet_owner_fk" FOREIGN KEY ("wallet_id", "user_id") REFERENCES "agent_wallets" ("id", "user_id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_wallet_networks_user_network_uidx" ON "agent_wallet_networks" ("user_id", "network");
--> statement-breakpoint
INSERT INTO "agent_wallet_networks" ("wallet_id", "user_id", "network", "status", "created_at", "updated_at")
SELECT "id", "user_id", "network", "status", "created_at", "updated_at" FROM "agent_wallets";
