CREATE TABLE "agent_gateway_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"subject_pseudonym" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_gateway_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"actor_pseudonym" text,
	"token_pseudonym" text,
	"route" text NOT NULL,
	"tool" text,
	"outcome" text NOT NULL,
	"status" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_gateway_rate_limits_subject_scope_idx" ON "agent_gateway_rate_limits" USING btree ("subject_pseudonym","scope");--> statement-breakpoint
CREATE INDEX "agent_gateway_rate_limits_expires_idx" ON "agent_gateway_rate_limits" USING btree ("window_ends_at");--> statement-breakpoint
CREATE INDEX "agent_gateway_audit_events_created_idx" ON "agent_gateway_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_gateway_audit_events_route_outcome_idx" ON "agent_gateway_audit_events" USING btree ("route","outcome");--> statement-breakpoint
CREATE INDEX "agent_gateway_audit_events_actor_created_idx" ON "agent_gateway_audit_events" USING btree ("actor_pseudonym","created_at");



