ALTER TABLE "integration_recommendations" ADD COLUMN "review_version" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "integration_recommendations" ADD COLUMN "review_reason" text;
--> statement-breakpoint
ALTER TABLE "integration_recommendations" ADD COLUMN "review_actor" text;
--> statement-breakpoint
ALTER TABLE "integration_recommendations" ADD COLUMN "reviewed_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "integration_recommendations" ADD COLUMN "review_request_id" text;
--> statement-breakpoint
CREATE TABLE "personal_app_definitions" (
  "id" text PRIMARY KEY,
  "data" jsonb NOT NULL,
  CHECK(data->>'id'=id),
  CHECK(data->>'approval' IN ('awaiting_review','approved','suspended'))
);
--> statement-breakpoint
CREATE TABLE "personal_app_installations" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES agent_users(id) ON DELETE CASCADE,
  "app_id" text NOT NULL REFERENCES personal_app_definitions(id),
  "data" jsonb NOT NULL,
  CHECK(data->>'userId'=user_id),
  CHECK(data->>'appId'=app_id),
  CHECK(data->>'id'=id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "personal_app_installations_owner_app_uidx" ON "personal_app_installations" ("user_id","app_id");
--> statement-breakpoint
CREATE TABLE "personal_app_changes" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES agent_users(id) ON DELETE CASCADE,
  "app_id" text NOT NULL REFERENCES personal_app_definitions(id),
  "idempotency_key" text NOT NULL,
  "data" jsonb NOT NULL,
  CHECK(data->>'userId'=user_id),
  CHECK(data->>'appId'=app_id),
  CHECK(data->>'id'=id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "personal_app_changes_owner_key_uidx" ON "personal_app_changes" ("user_id","idempotency_key");
--> statement-breakpoint
CREATE TABLE "personal_app_enrollments" (
  "user_id" text NOT NULL REFERENCES agent_users(id) ON DELETE CASCADE,
  "app_id" text NOT NULL REFERENCES personal_app_definitions(id),
  "creation_id" text NOT NULL,
  "owner_id" text,
  "data" jsonb NOT NULL,
  PRIMARY KEY(user_id,app_id),
  CHECK(data->>'userId'=user_id),
  CHECK(data->>'appId'=app_id),
  CHECK(data->>'creationId'=creation_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "personal_app_enrollments_creation_uidx" ON "personal_app_enrollments" ("creation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "personal_app_enrollments_remote_owner_uidx" ON "personal_app_enrollments" ("app_id","owner_id");
--> statement-breakpoint
CREATE TABLE "agent_app_operations" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES agent_users(id) ON DELETE CASCADE,
  "app_id" text NOT NULL,
  "remote_operation_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "phase" text NOT NULL DEFAULT 'preparing',
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "version" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_app_operations_owner_key_uidx" ON "agent_app_operations" ("user_id","app_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_app_operations_remote_uidx" ON "agent_app_operations" ("app_id","remote_operation_id");
--> statement-breakpoint
CREATE INDEX "agent_app_operations_owner_created_idx" ON "agent_app_operations" ("user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_app_operations_one_pending_uidx" ON "agent_app_operations" ("user_id","app_id")
  WHERE phase IN ('preparing','preparing_remote','awaiting_confirmation','preparation_pending','submitting','uncertain');
--> statement-breakpoint
-- Neon HTTP cannot run interactive transactions. Lock the persisted owner row
-- inside this function so duplicate confirmations and remote completions are
-- serialized in the database, including when two server instances race.
CREATE FUNCTION personal_apps_mutate(p_user text, p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c jsonb; i jsonb; e jsonb; d jsonb; a text; g integer; n jsonb; op text:=p->>'operation';
BEGIN
  IF p_user !~ '^did:privy:[^[:space:]]+$' THEN RAISE EXCEPTION 'app_owner_invalid'; END IF;
  PERFORM 1 FROM agent_users WHERE id=p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'app_owner_missing'; END IF;
  IF op='prepare' THEN
    c:=p->'change'; a:=c->>'appId';
    IF c->>'userId'<>p_user THEN RAISE EXCEPTION 'app_owner_invalid'; END IF;
    SELECT data INTO d FROM personal_app_definitions WHERE id=a FOR SHARE;
    IF d IS NULL THEN RAISE EXCEPTION 'app_not_approved'; END IF;
    SELECT data INTO n FROM personal_app_changes WHERE user_id=p_user AND idempotency_key=c->>'idempotencyKey';
    IF n IS NOT NULL THEN RETURN jsonb_build_object('change',n); END IF;
    SELECT data INTO i FROM personal_app_installations WHERE user_id=p_user AND app_id=a;
    IF c->>'action'='add' AND i->>'status'='active' AND i->'definition'->>'definitionHash'=c->'definition'->>'definitionHash' THEN RAISE EXCEPTION 'app_already_active'; END IF;
    INSERT INTO personal_app_changes(id,user_id,app_id,idempotency_key,data)
      VALUES(c->>'id',p_user,a,c->>'idempotencyKey',c) ON CONFLICT(user_id,idempotency_key) DO NOTHING;
    SELECT data INTO c FROM personal_app_changes WHERE user_id=p_user AND idempotency_key=c->>'idempotencyKey';
    RETURN jsonb_build_object('change',c);
  END IF;
  IF op IN ('confirm','cancel') THEN
    SELECT data INTO c FROM personal_app_changes WHERE id=p->>'changeId' AND user_id=p_user;
    IF c IS NULL OR c->>'channel'<>p->>'channel' THEN RAISE EXCEPTION 'app_change_not_found'; END IF;
    a:=c->>'appId';
    SELECT data INTO i FROM personal_app_installations WHERE user_id=p_user AND app_id=a;
    IF op='cancel' THEN
      IF c->>'status'='confirmed' THEN RAISE EXCEPTION 'app_change_already_confirmed'; END IF;
      c:=jsonb_set(c,'{status}','"cancelled"'::jsonb);
    ELSE
      IF c->>'tokenHash'<>p->>'tokenHash' THEN RAISE EXCEPTION 'app_confirmation_invalid'; END IF;
      IF c->>'status'='confirmed' THEN RETURN jsonb_build_object('change',c,'installation',i); END IF;
      IF c->>'status'<>'prepared' THEN RAISE EXCEPTION 'app_change_cancelled'; END IF;
      IF (c->>'expiresAt')::timestamptz <= (p->>'now')::timestamptz THEN RAISE EXCEPTION 'app_change_expired'; END IF;
      g:=COALESCE((i->>'generation')::int,0);
      IF g<>(c->>'expectedGeneration')::int THEN RAISE EXCEPTION 'app_change_conflict'; END IF;
      SELECT data INTO d FROM personal_app_definitions WHERE id=a FOR SHARE;
      IF c->>'action'='add' AND (d->>'approval'<>'approved' OR d->>'definitionHash'<>c->'definition'->>'definitionHash') THEN RAISE EXCEPTION 'app_not_approved'; END IF;
      c:=jsonb_set(c,'{status}','"confirmed"'::jsonb);
      n:=jsonb_build_object('id',COALESCE(i->>'id','appi_'||(c->>'id')),'userId',p_user,'appId',a,
        'definition',c->'definition','status',CASE WHEN c->>'action'='add' THEN 'preparing' ELSE 'removed' END,
        'generation',g+1,'changeId',c->>'id','error',NULL,'createdAt',COALESCE(i->>'createdAt',p->>'now'),'updatedAt',p->>'now');
      INSERT INTO personal_app_installations(id,user_id,app_id,data) VALUES(n->>'id',p_user,a,n)
        ON CONFLICT(user_id,app_id) DO UPDATE SET data=EXCLUDED.data;
      i:=n;
      IF c->>'action'='remove' THEN
        UPDATE personal_app_enrollments SET data=data||jsonb_build_object('status','revocation_pending','leaseToken',NULL,'leaseExpiresAt',NULL,'managementId',c->>'id')
          WHERE user_id=p_user AND app_id=a AND data->>'status'<>'revoked';
      END IF;
    END IF;
    UPDATE personal_app_changes SET data=c WHERE id=c->>'id' AND user_id=p_user;
    RETURN jsonb_build_object('change',c,'installation',i);
  END IF;
  SELECT data INTO i FROM personal_app_installations WHERE id=p->>'installationId' AND user_id=p_user;
  IF i IS NULL THEN RAISE EXCEPTION 'app_installation_not_found'; END IF;
  a:=i->>'appId';
  SELECT data INTO e FROM personal_app_enrollments WHERE user_id=p_user AND app_id=a;
  IF (i->>'generation')::int<>(p->>'generation')::int THEN RETURN jsonb_build_object('installation',i,'enrollment',e,'claimed',false); END IF;
  IF op='claim' THEN
    IF i->>'status' NOT IN ('preparing','error','removed') THEN RETURN jsonb_build_object('installation',i,'enrollment',e,'claimed',false); END IF;
    IF i->>'status'='error' THEN
      i:=i||jsonb_build_object('status','preparing');
      UPDATE personal_app_installations SET data=i WHERE user_id=p_user AND app_id=a;
    END IF;
    IF e->>'leaseToken' IS NOT NULL AND (e->>'leaseExpiresAt')::timestamptz>(p->>'now')::timestamptz THEN RETURN jsonb_build_object('installation',i,'enrollment',e,'claimed',false); END IF;
    IF e IS NULL THEN e:=p->'intent';
    ELSIF i->>'status'='preparing' AND e->>'ownerId' IS NOT NULL AND jsonb_array_length(e->'grants')=2 AND (e->>'credentialGeneration')::int<>(i->>'generation')::int THEN
      e:=e||jsonb_build_object('webCredentialEncrypted',p->'intent'->>'webCredentialEncrypted','readCredentialEncrypted',p->'intent'->>'readCredentialEncrypted',
        'credentialGeneration',(i->>'generation')::int,'managementId',i->>'changeId','status','prepared');
    END IF;
    e:=e||jsonb_build_object('leaseToken',p->>'leaseToken','leaseExpiresAt',p->>'leaseExpiresAt','error',NULL);
    INSERT INTO personal_app_enrollments(user_id,app_id,creation_id,owner_id,data) VALUES(p_user,a,e->>'creationId',e->>'ownerId',e)
      ON CONFLICT(user_id,app_id) DO UPDATE SET data=EXCLUDED.data;
    RETURN jsonb_build_object('installation',i,'enrollment',e,'claimed',true);
  END IF;
  IF e IS NULL OR (e->>'leaseToken') IS DISTINCT FROM (p->>'leaseToken') THEN RETURN jsonb_build_object('installation',i,'enrollment',e,'claimed',false); END IF;
  IF op='save' THEN
    n:=p->'enrollment';
    IF n->>'userId'<>p_user OR n->>'appId'<>a OR n->>'creationId'<>e->>'creationId' OR (e->>'ownerId' IS NOT NULL AND n->>'ownerId' IS DISTINCT FROM e->>'ownerId') THEN RAISE EXCEPTION 'app_bazaar_owner_mismatch'; END IF;
    IF n->>'status'='active' THEN
      SELECT data INTO d FROM personal_app_definitions WHERE id=a FOR SHARE;
      IF i->>'status'<>'preparing' OR d->>'approval'<>'approved' OR d->>'definitionHash'<>i->'definition'->>'definitionHash' THEN
        n:=n||jsonb_build_object('status','revocation_pending');
        i:=i||jsonb_build_object('error','app_not_approved','updatedAt',p->>'now');
      ELSE i:=i||jsonb_build_object('status','active','error',NULL,'updatedAt',p->>'now'); END IF;
    END IF;
    e:=n;
  ELSIF op='fail' THEN
    e:=e||jsonb_build_object('error',p->>'error','leaseToken',NULL,'leaseExpiresAt',NULL);
    i:=i||jsonb_build_object('error',p->>'error','updatedAt',p->>'now');
  ELSE RAISE EXCEPTION 'app_mutation_invalid'; END IF;
  UPDATE personal_app_enrollments SET data=e,owner_id=e->>'ownerId' WHERE user_id=p_user AND app_id=a;
  UPDATE personal_app_installations SET data=i WHERE user_id=p_user AND app_id=a;
  RETURN jsonb_build_object('installation',i,'enrollment',e,'claimed',true);
END;
$$;
