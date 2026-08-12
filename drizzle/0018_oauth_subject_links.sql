CREATE TABLE "oauth_subject_links" (
  "id" text PRIMARY KEY NOT NULL,
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "privy_did" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_subject_links" ADD CONSTRAINT "oauth_subject_links_privy_did_agent_users_id_fk" FOREIGN KEY ("privy_did") REFERENCES "public"."agent_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_subject_links_issuer_subject_uidx" ON "oauth_subject_links" USING btree ("issuer","subject");
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_subject_links_issuer_privy_uidx" ON "oauth_subject_links" USING btree ("issuer","privy_did");
--> statement-breakpoint
CREATE INDEX "oauth_subject_links_privy_idx" ON "oauth_subject_links" USING btree ("privy_did");