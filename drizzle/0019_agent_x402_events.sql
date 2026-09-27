CREATE TABLE "agent_x402_events" (
  "id" text PRIMARY KEY NOT NULL,
  "payment_id" text NOT NULL,
  "user_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_x402_events" ADD CONSTRAINT "agent_x402_events_payment_id_agent_x402_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."agent_x402_payments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_x402_events" ADD CONSTRAINT "agent_x402_events_user_id_agent_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."agent_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "agent_x402_events_payment_created_idx" ON "agent_x402_events" USING btree ("payment_id","created_at");
--> statement-breakpoint
CREATE INDEX "agent_x402_events_user_created_idx" ON "agent_x402_events" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "agent_x402_events_type_idx" ON "agent_x402_events" USING btree ("event_type");
