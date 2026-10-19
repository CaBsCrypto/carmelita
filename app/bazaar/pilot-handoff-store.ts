import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { PILOT_ID, PILOT_INTENT_HASH, pilotHash, type PilotQuery } from "./pilot-signer-store";

export type HandoffState = "approved" | "simulation-claimed" | "submit-claimed" | "observed" | "recovery-approved" | "recovery-claimed";
export type HandoffRow = {operation_id:string;user_id:string;wallet_id:string;intent_hash:string;connection_hash:string;
  state:HandoffState;revision:number;nonce_hash:string;approval_expires_at:string;payload_encrypted:string;payload_hash:string|null;recovery_count:number};
const columns = "operation_id,user_id,wallet_id,intent_hash,connection_hash,state,revision,nonce_hash,approval_expires_at,payload_encrypted,payload_hash,recovery_count";
const table = "public.agent_bazaar_pilot_handoff";
async function productionQuery(query:string,params:unknown[]) {
  const [{neon},{getDatabaseUrl}] = await Promise.all([import("@neondatabase/serverless"),import("@/db")]);
  const url = getDatabaseUrl(); if (!url) throw Error("handoff_database_unavailable");
  return await neon(url).query(query,params,{fetchOptions:{signal:AbortSignal.timeout(10000),redirect:"error",cache:"no-store"}}) as unknown[];
}
/** Separate additive journal. No transition ever returns to approved after a claim.
 * A claim/finish ACK loss can have committed: callers must read owner status,
 * never repeat an outbound payment. Recovery fetches the same NEW order;
 * Bazaar may resume delivery of its already paid service from that GET. */
export function createHandoffStore(query:PilotQuery = productionQuery) {
  function row(value:unknown):HandoffRow|null {
    if (!value) return null;
    // The installed Neon HTTP parser for PostgreSQL timestamptz (OID1184)
    // returns Date. Normalize that genuine representation before strict shape
    // validation; arbitrary objects/coercion and invalid Dates stay rejected.
    const raw=value as Record<string,unknown>,date=raw.approval_expires_at;
    if (date instanceof Date) { if (!Number.isFinite(date.getTime())) throw Error("handoff_journal_invalid");value={...raw,approval_expires_at:date.toISOString()}; }
    const r = value as HandoffRow;
    if (Object.keys(r).sort().join(",")!==columns.split(",").sort().join(",") || r.operation_id !== PILOT_ID || r.intent_hash !== PILOT_INTENT_HASH
      || typeof r.user_id!=="string" || !/^did:privy:.{1,200}$/.test(r.user_id) || typeof r.wallet_id!=="string" || !/^[A-Za-z0-9_-]{1,200}$/.test(r.wallet_id)
      || !/^[a-f0-9]{64}$/.test(r.connection_hash) || !/^[a-f0-9]{64}$/.test(r.nonce_hash) || typeof r.approval_expires_at!=="string" || !Number.isFinite(Date.parse(r.approval_expires_at))
      || typeof r.payload_encrypted!=="string" || r.payload_encrypted.length>262144 || !/^bh1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(r.payload_encrypted)
      || !Number.isSafeInteger(r.revision) || r.revision<0 || r.revision>100000 || ![0,1].includes(r.recovery_count)
      || !["approved","simulation-claimed","submit-claimed","observed","recovery-approved","recovery-claimed"].includes(r.state)
      || (["approved","simulation-claimed"].includes(r.state)?r.payload_hash!==null || r.recovery_count!==0:!(/^[a-f0-9]{64}$/.test(r.payload_hash??"")))
      || r.state.startsWith("recovery-")&&r.recovery_count!==1) throw Error("handoff_journal_invalid");
    return r;
  }
  async function one(sql:string,params:unknown[]) { const result = await query(sql,params); if (result.length !== 1) throw Error("handoff_cas_unconfirmed_no_retry"); return row(result[0])!; }
  function bound(userId:string,before:HandoffRow) { if (before.user_id !== userId || before.operation_id !== PILOT_ID || before.intent_hash !== PILOT_INTENT_HASH) throw Error("handoff_owner_changed"); }
  return {
    async read(userId:string) { return row((await query(`SELECT ${columns} FROM ${table} WHERE operation_id=$1::uuid AND user_id=$2`,[PILOT_ID,userId]))[0]); },
    async approve(userId:string,walletId:string,connection:string,nonceHash:string,encrypted:string) {
      return one(`INSERT INTO ${table} (operation_id,user_id,wallet_id,intent_hash,connection_hash,state,nonce_hash,approval_expires_at,payload_encrypted)
        VALUES ($1::uuid,$2,$3,$4,$5,'approved',$6,clock_timestamp()+interval '120 seconds',$7) RETURNING ${columns}`,
      [PILOT_ID,userId,walletId,PILOT_INTENT_HASH,connection,nonceHash,encrypted]);
    },
    async claim(userId:string,before:HandoffRow,nonce:string,recovery = false) {
      bound(userId,before); const from = recovery ? "recovery-approved" : "approved", to = recovery ? "recovery-claimed" : "simulation-claimed";
      if (before.state !== from) throw Error("handoff_already_claimed_no_retry");
      return one(`UPDATE ${table} SET state=$8,revision=revision+1,updated_at=clock_timestamp()
        WHERE operation_id=$1::uuid AND user_id=$2 AND wallet_id=$3 AND intent_hash=$4 AND connection_hash=$5
        AND revision=$6 AND nonce_hash=$7 AND state=$9 AND approval_expires_at>clock_timestamp() RETURNING ${columns}`,
      [PILOT_ID,userId,before.wallet_id,PILOT_INTENT_HASH,before.connection_hash,before.revision,pilotHash(nonce),to,from]);
    },
    async dispatch(userId:string,before:HandoffRow,encrypted:string,payloadHash:string) {
      bound(userId,before); if (before.state !== "simulation-claimed" || !/^[a-f0-9]{64}$/.test(payloadHash)) throw Error("handoff_dispatch_invalid");
      return one(`UPDATE ${table} SET state='submit-claimed',revision=revision+1,payload_encrypted=$7,payload_hash=$8,updated_at=clock_timestamp()
        WHERE operation_id=$1::uuid AND user_id=$2 AND wallet_id=$3 AND intent_hash=$4 AND connection_hash=$5 AND revision=$6
        AND state='simulation-claimed' AND payload_hash IS NULL AND approval_expires_at>clock_timestamp() RETURNING ${columns}`,
      [PILOT_ID,userId,before.wallet_id,PILOT_INTENT_HASH,before.connection_hash,before.revision,encrypted,payloadHash]);
    },
    async finish(userId:string,before:HandoffRow,encrypted:string) {
      bound(userId,before); if (!["submit-claimed","recovery-claimed"].includes(before.state)) throw Error("handoff_finish_invalid");
      return one(`UPDATE ${table} SET state='observed',revision=revision+1,payload_encrypted=$8,updated_at=clock_timestamp()
        WHERE operation_id=$1::uuid AND user_id=$2 AND wallet_id=$3 AND intent_hash=$4 AND connection_hash=$5 AND revision=$6 AND state=$7 RETURNING ${columns}`,
      [PILOT_ID,userId,before.wallet_id,PILOT_INTENT_HASH,before.connection_hash,before.revision,before.state,encrypted]);
    },
    async approveRecovery(userId:string,before:HandoffRow,nonceHash:string) {
      bound(userId,before); if (!["submit-claimed","observed"].includes(before.state) || !before.payload_hash || before.recovery_count!==0) throw Error("handoff_read_recovery_unavailable");
      return one(`UPDATE ${table} SET state='recovery-approved',revision=revision+1,nonce_hash=$8,recovery_count=1,
        approval_expires_at=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp()
        WHERE operation_id=$1::uuid AND user_id=$2 AND wallet_id=$3 AND intent_hash=$4 AND connection_hash=$5 AND revision=$6 AND state=$7 AND recovery_count=0 RETURNING ${columns}`,
      [PILOT_ID,userId,before.wallet_id,PILOT_INTENT_HASH,before.connection_hash,before.revision,before.state,nonceHash]);
    },
  };
}
/** Existing root key, separate HKDF/AAD namespace. No JWT or AGENT token stored. */
export function handoffCipher(userId:string,keyProvider = () => Buffer.from(process.env.CONNECTOR_ENCRYPTION_KEY ?? "","base64")) {
  const context = Buffer.from(JSON.stringify(["carmelita.bazaar-handoff/v1",userId,PILOT_ID,PILOT_INTENT_HASH]));
  function key() { const root = keyProvider(); try { if (root.length !== 32) throw Error("handoff_encryption_unavailable"); return Buffer.from(hkdfSync("sha256",root,Buffer.from("carmelita-handoff/v1"),context,32)); } finally { root.fill(0); } }
  return {
    seal(value:unknown) { const plain = Buffer.from(JSON.stringify(value)); if (plain.length > 131072) throw Error("handoff_payload_too_large");
      const k=key(),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",k,iv); try { cipher.setAAD(context); const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);return ["bh1",iv.toString("base64url"),encrypted.toString("base64url"),cipher.getAuthTag().toString("base64url")].join("."); }
      finally { k.fill(0);plain.fill(0); }
    },
    open(value:string):unknown { if (value.length > 262144 || !/^bh1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw Error("handoff_cipher_invalid");
      const [,iv,body,tag]=value.split("."),k=key(),cipher=createDecipheriv("aes-256-gcm",k,Buffer.from(iv,"base64url")); let plain:Buffer|undefined;
      try { cipher.setAAD(context);cipher.setAuthTag(Buffer.from(tag,"base64url"));plain=Buffer.concat([cipher.update(Buffer.from(body,"base64url")),cipher.final()]); if (plain.length > 131072) throw Error("handoff_payload_too_large");return JSON.parse(plain.toString("utf8")); }
      finally { k.fill(0);plain?.fill(0); }
    },
  };
}
