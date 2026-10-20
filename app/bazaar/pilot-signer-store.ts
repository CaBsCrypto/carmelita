import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

export const PILOT_ID = "ed6c4530-e76f-49e0-8f39-5ec8578820e2";
export const PILOT_INTENT_HASH = "668880738c6be6fde10b371a47c26c7474cc02dde964a1329116b6e15f88c6c5";
export const pilotHash = (value: string) => createHash("sha256").update(value).digest("hex");
export type PilotState = "review" | "challenge-claimed" | "challenge-bound" | "dispatch-claimed" | "signed" | "uncertain";
export type PilotRow = { operation_id: string; user_id: string; wallet_id: string; intent_hash: string;
  connection_hash: string; state: PilotState; revision: number; nonce_hash: string;
  approval_expires_at: string; payload_encrypted: string; dispatch_digest: string | null; claimed_at: string | null };
export type PilotQuery = (query: string, params: unknown[]) => Promise<unknown[]>;
const columns = "operation_id,user_id,wallet_id,intent_hash,connection_hash,state,revision,nonce_hash,approval_expires_at,payload_encrypted,dispatch_digest,claimed_at";
const table = "public.agent_bazaar_pilot_signer";
export function decodePilotRootKey(value: string | undefined) {
  const encoded = value?.trim() ?? "";
  // The existing connector accepts Node's base64/base64url forms. Keep the same
  // 32 root bytes, while rejecting noncanonical or silently truncated input.
  if (!/^(?:[A-Za-z0-9+/]{43}=?|[A-Za-z0-9_-]{43})$/.test(encoded)) throw Error("pilot_encryption_unavailable");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || ![key.toString("base64"), key.toString("base64").replace(/=$/, ""), key.toString("base64url")].includes(encoded)) {
    key.fill(0); throw Error("pilot_encryption_unavailable");
  }
  return key;
}
function requiredKey() { return decodePilotRootKey(process.env.CONNECTOR_ENCRYPTION_KEY); }
/** Own HKDF namespace + owner/operation AAD; never encrypt a JWT/agent token. */
export function pilotCipher(userId: string, existingKey: () => Buffer = requiredKey) {
  const context = Buffer.from(JSON.stringify(["carmelita.bazaar-pilot/v1", userId, PILOT_ID, PILOT_INTENT_HASH]));
  function key() { const root = existingKey(); try { if (root.length !== 32) throw Error("pilot_encryption_unavailable"); return Buffer.from(hkdfSync("sha256", root, Buffer.from("carmelita-pilot-signer/v1"), context, 32)); } finally { root.fill(0); } }
  return {
    seal(value: unknown) {
      const plaintext = Buffer.from(JSON.stringify(value));
      if (plaintext.length > 65536) throw Error("pilot_payload_too_large");
      const derived = key(), iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", derived, iv);
      try { cipher.setAAD(context); const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return ["bp1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
      } finally { derived.fill(0); plaintext.fill(0); }
    },
    open(ciphertext: string): unknown {
      if (ciphertext.length > 131072 || !/^bp1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ciphertext)) throw Error("pilot_cipher_invalid");
      const [, iv, tag, body] = ciphertext.split("."), derived = key(), decipher = createDecipheriv("aes-256-gcm", derived, Buffer.from(iv, "base64url"));
      let plain: Buffer | undefined;
      try { decipher.setAAD(context); decipher.setAuthTag(Buffer.from(tag, "base64url")); plain = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]);
        if (plain.length > 65536) throw Error("pilot_payload_too_large"); return JSON.parse(plain.toString("utf8"));
      } finally { derived.fill(0); plain?.fill(0); }
    },
  };
}
async function productionQuery(query: string, params: unknown[]) {
  const [{ neon }, { getDatabaseUrl }] = await Promise.all([import("@neondatabase/serverless"), import("@/db")]);
  const url = getDatabaseUrl(); if (!url) throw Error("pilot_database_unavailable");
  // Installed Neon HTTP execute() issues one fetch and contains no retry loop.
  return await neon(url).query(query, params, {fetchOptions:{signal:AbortSignal.timeout(10000),redirect:"error",cache:"no-store"}}) as unknown[];
}
export function createPilotStore(query: PilotQuery = productionQuery) {
  function row(value: unknown): PilotRow | null {
    if (!value) return null;
    const r = value as PilotRow;
    if (r.operation_id !== PILOT_ID || r.intent_hash !== PILOT_INTENT_HASH || !Number.isSafeInteger(r.revision)
      || !["review","challenge-claimed","challenge-bound","dispatch-claimed","signed","uncertain"].includes(r.state)) throw Error("pilot_journal_invalid");
    return r;
  }
  return {
    async read(userId: string) { return row((await query(`SELECT ${columns} FROM ${table} WHERE operation_id=$1::uuid AND user_id=$2`, [PILOT_ID,userId]))[0]); },
    async approve(userId: string, before: PilotRow, nonceHash: string) {
      if (before.user_id !== userId || before.state !== "challenge-bound") throw Error("pilot_approval_invalid");
      const rows = await query(`UPDATE ${table} SET nonce_hash=$6,approval_expires_at=clock_timestamp()+interval '120 seconds',
        revision=revision+1,updated_at=clock_timestamp() WHERE operation_id=$1::uuid AND user_id=$2 AND wallet_id=$3
        AND connection_hash=$4 AND intent_hash=$7 AND revision=$5 AND state='challenge-bound' AND dispatch_digest IS NULL AND claimed_at IS NULL
        RETURNING ${columns}`,[PILOT_ID,userId,before.wallet_id,before.connection_hash,before.revision,nonceHash,PILOT_INTENT_HASH]);
      if (rows.length !== 1) throw Error("pilot_approval_conflict_no_retry"); return row(rows[0])!;
    },
    async review(userId: string, walletId: string, connection: string, nonceHash: string, encrypted: string, revision: number) {
      const result = await query(`INSERT INTO ${table} AS journal (operation_id,user_id,wallet_id,intent_hash,connection_hash,state,nonce_hash,approval_expires_at,payload_encrypted)
        VALUES ($1::uuid,$2,$3,$4,$5,'review',$6,clock_timestamp()+interval '120 seconds',$7)
        ON CONFLICT (operation_id) DO UPDATE SET nonce_hash=EXCLUDED.nonce_hash,payload_encrypted=EXCLUDED.payload_encrypted,
        approval_expires_at=clock_timestamp()+interval '120 seconds',revision=journal.revision+1,updated_at=clock_timestamp()
        WHERE journal.user_id=$2 AND journal.wallet_id=$3 AND journal.connection_hash=$5 AND journal.intent_hash=$4
        AND journal.state='review' AND journal.revision=$8 RETURNING ${columns}`,
      [PILOT_ID,userId,walletId,PILOT_INTENT_HASH,connection,nonceHash,encrypted,revision]);
      if (result.length !== 1) throw Error("pilot_review_conflict_no_retry"); return row(result[0])!;
    },
    async claim(userId: string, before: PilotRow, nonce: string, kind: "challenge" | "dispatch", digest: string | null = null) {
      const from = kind === "challenge" ? "review" : "challenge-bound", to = kind === "challenge" ? "challenge-claimed" : "dispatch-claimed";
      if (before.user_id !== userId || before.state !== from || kind === "dispatch" && !/^[a-f0-9]{64}$/.test(digest ?? "")) throw Error("pilot_claim_invalid");
      const rows = await query(`UPDATE ${table} SET state=$8,revision=revision+1,updated_at=clock_timestamp(),
        dispatch_digest=$9,claimed_at=CASE WHEN $8='dispatch-claimed' THEN clock_timestamp() ELSE NULL END
        WHERE operation_id=$1::uuid AND user_id=$2 AND wallet_id=$3 AND connection_hash=$4 AND intent_hash=$5
        AND revision=$6 AND nonce_hash=$7 AND state=$10 AND approval_expires_at>clock_timestamp()
        RETURNING ${columns}`,[PILOT_ID,userId,before.wallet_id,before.connection_hash,PILOT_INTENT_HASH,before.revision,pilotHash(nonce),to,digest,from]);
      if (rows.length !== 1) throw Error("pilot_claim_conflict_or_expired_no_retry"); return row(rows[0])!;
    },
    async finish(userId: string, before: PilotRow, state: "challenge-bound" | "signed" | "uncertain", encrypted: string, nonceHash: string) {
      if (before.user_id !== userId || !(state === "challenge-bound" && before.state === "challenge-claimed"
        || state === "signed" && before.state === "dispatch-claimed" || state === "uncertain" && ["challenge-claimed","dispatch-claimed"].includes(before.state))) throw Error("pilot_finish_invalid");
      const rows = await query(`UPDATE ${table} SET state=$7,revision=revision+1,payload_encrypted=$8,nonce_hash=$9,
        approval_expires_at=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp()
        WHERE operation_id=$1::uuid AND user_id=$2 AND connection_hash=$3 AND intent_hash=$4 AND revision=$5 AND state=$6
        RETURNING ${columns}`,[PILOT_ID,userId,before.connection_hash,PILOT_INTENT_HASH,before.revision,before.state,state,encrypted,nonceHash]);
      if (rows.length !== 1) throw Error("pilot_result_unconfirmed_no_retry"); return row(rows[0])!;
    },
  };
}
