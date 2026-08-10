CREATE TABLE "agent_gateway_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"api_version" text NOT NULL,
	"environment" text NOT NULL,
	"capability_id" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safety" jsonb NOT NULL,
	"approval" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_gateway_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"network" text NOT NULL,
	"status" text NOT NULL,
	"transaction_hash" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_gateway_receipts" ADD CONSTRAINT "agent_gateway_receipts_plan_id_agent_gateway_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."agent_gateway_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_gateway_plans_actor_idempotency_uidx" ON "agent_gateway_plans" USING btree ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_gateway_plans_actor_status_idx" ON "agent_gateway_plans" USING btree ("actor_id","status");--> statement-breakpoint
CREATE INDEX "agent_gateway_plans_expires_idx" ON "agent_gateway_plans" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_gateway_receipts_plan_uidx" ON "agent_gateway_receipts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "agent_gateway_receipts_actor_created_idx" ON "agent_gateway_receipts" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_gateway_receipts_status_idx" ON "agent_gateway_receipts" USING btree ("status");