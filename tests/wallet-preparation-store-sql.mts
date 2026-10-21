// Opt-in real SQL acceptance. Requires explicit Preview isolation; uses only session-local temporary tables.
import assert from "node:assert/strict";
import { mock } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { assertPreviewIsolation } from "../app/preview-isolation";
import * as neonModule from "@neondatabase/serverless";
import ws from "ws";
const isolation=assertPreviewIsolation();
neonModule.neonConfig.webSocketConstructor=ws;
const pool=new neonModule.Pool({connectionString:isolation.migrationDatabaseUrl});
const client=await pool.connect();
try {
 await client.query('CREATE TEMP TABLE agent_users(id text PRIMARY KEY,status text NOT NULL)');
 const migration=readFileSync(new URL('../drizzle/0022_wallet_preparation.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
 for(const statement of migration) await client.query(statement.replace(/^CREATE TABLE/,'CREATE TEMP TABLE'));
 await client.query("INSERT INTO agent_users VALUES ('active-user','active'),('disabled-user','disabled')");
 mock.module('@neondatabase/serverless',{namedExports:{...neonModule,neon:()=>({query:async(text:string,parameters:unknown[]) => (await client.query(text,parameters)).rows})}});
 const store=await import('../app/wallets/preparation-store');
 await store.enqueue('active-user','v1','normal_login');
 await store.enqueue('active-user','v1','normal_login');
 assert.equal((await store.getStatus('active-user','v1'))[0].families.length,3);
 assert.equal((await client.query('SELECT count(*)::int AS n FROM wallet_preparation_jobs')).rows[0].n,1);
 assert.equal(await store.enqueue('disabled-user','v1','backfill'),undefined);
 await client.query("UPDATE agent_users SET status='active' WHERE id='disabled-user'");
 await store.enqueue('disabled-user','v1','normal_login');
 await client.query("UPDATE agent_users SET status='disabled' WHERE id='disabled-user'");
 assert.deepEqual(await store.listDueUsers('v1'),['active-user']);
 assert.equal(await store.claimJob('disabled-user','v1'),null);
 assert.equal(await store.claimJob('active-user','disabled-catalog'),null);
 const first=await store.claimJob('active-user','v1');assert.ok(first);
 assert.equal(first.fence,1);assert.equal(first.attempt,1);
 assert.equal(await store.finishFamily('wrong-token',first.family,{status:'complete'}),false);
 await client.query('UPDATE wallet_preparation_families SET lease_expires_at=now()-interval \'1 second\' WHERE lease_token=$1',[first.token]);
 assert.equal(await store.finishFamily(first.token,first.family,{status:'complete'}),false);
 await store.listDueUsers('v1');
 await client.query('UPDATE wallet_preparation_families SET next_attempt_at=now()-interval \'1 day\' WHERE job_id=$1 AND family=$2',[first.jobId,first.family]);
 const second=await store.claimJob('active-user','v1');assert.ok(second);assert.equal(second.family,first.family);assert.equal(second.fence,2);
 assert.equal(await store.finishFamily(first.token,first.family,{status:'complete'}),false);
 assert.equal((await client.query(store.PREPARATION_FENCE_LOCK_SQL,[first.jobId,first.family,first.token,first.fence])).rows.length,0);
 assert.equal((await client.query(store.PREPARATION_FENCE_LOCK_SQL,[second.jobId,second.family,second.token,second.fence])).rows.length,1);
 assert.equal(await store.finishFamily(second.token,second.family,{status:'conflict',code:'raw secret'}),true);
 await store.retryTransient('active-user','v1');
 const family=(await store.getStatus('active-user','v1'))[0].families.find(f=>f.family===first.family)!;
 assert.equal(family.status,'conflict');assert.equal(family.errorCode,'preparation_failed');
 assert.equal((await client.query("SELECT bool_and(relpersistence='t' AND relnamespace=pg_my_temp_schema()) AS temporary_only FROM pg_class WHERE oid IN ('agent_users'::regclass,'wallet_preparation_jobs'::regclass,'wallet_preparation_families'::regclass)")).rows[0].temporary_only,true);
 const report={at:new Date().toISOString(),status:'PASS',implementation:'actual preparation-store exports with session-bound Neon adapter',checks:['idempotent enqueue','inactive enqueue and claim rejected','inactive user excluded from due list','catalog isolation','expired and replaced token rejected','monotonic fence','transaction lock rejects old fence','conflict preserved across manual retry','raw errors sanitized','all tables temporary'],limitations:['Single database session; no simultaneous SKIP LOCKED race demonstrated'],cleanup:'temporary tables dropped with session close'};
 writeFileSync('work/preparation-store-sql-result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} catch(error) {console.error({code:(error as {code?:string}).code ?? 'preparation_store_sql_failed',location:(error as Error).stack?.split('\n').find(line=>line.includes('wallet-preparation-store-sql.mts:'))});process.exitCode=1;} finally {client.release(true);await pool.end();}


