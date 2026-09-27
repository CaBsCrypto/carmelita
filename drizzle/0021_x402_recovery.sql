-- Add recovery evidence without promoting historical settlement claims to proof.
ALTER TABLE "agent_x402_payments" ADD COLUMN IF NOT EXISTS "payment_state" text;
--> statement-breakpoint
ALTER TABLE "agent_x402_payments" ADD COLUMN IF NOT EXISTS "delivery_state" text;
--> statement-breakpoint
ALTER TABLE "agent_x402_payments" ADD COLUMN IF NOT EXISTS "execution" jsonb;
--> statement-breakpoint
ALTER TABLE "agent_x402_payments" ADD COLUMN IF NOT EXISTS "verification" jsonb;
--> statement-breakpoint
ALTER TABLE "agent_x402_payments" ADD COLUMN IF NOT EXISTS "resource_body" text;
--> statement-breakpoint
ALTER TABLE "agent_x402_payments" ADD COLUMN IF NOT EXISTS "reconciliation_cursor" text;
--> statement-breakpoint
UPDATE "agent_x402_payments" SET "payment_state" = CASE
  WHEN "status" = 'prepared' THEN 'pending' ELSE 'uncertain' END
WHERE "payment_state" IS NULL;
--> statement-breakpoint
UPDATE "agent_x402_payments" SET "delivery_state" = 'pending' WHERE "delivery_state" IS NULL;
--> statement-breakpoint
ALTER TABLE "agent_x402_payments" ALTER COLUMN "payment_state" SET DEFAULT 'pending', ALTER COLUMN "payment_state" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_x402_payments" ALTER COLUMN "delivery_state" SET DEFAULT 'pending', ALTER COLUMN "delivery_state" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'agent_x402_payments'::regclass AND conname = 'agent_x402_payment_state_check') THEN
    ALTER TABLE "agent_x402_payments" ADD CONSTRAINT "agent_x402_payment_state_check" CHECK ("payment_state" IN ('pending', 'confirmed', 'uncertain'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'agent_x402_payments'::regclass AND conname = 'agent_x402_delivery_state_check') THEN
    ALTER TABLE "agent_x402_payments" ADD CONSTRAINT "agent_x402_delivery_state_check" CHECK ("delivery_state" IN ('pending', 'received'));
  END IF;
END $$;
