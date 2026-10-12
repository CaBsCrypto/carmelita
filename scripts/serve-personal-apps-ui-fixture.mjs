import { createServer } from "node:http";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "work/personal-apps-qa/ui"), port = 8152;
await mkdir(output, { recursive: true });
const mockPath = resolve(output, "auth.mock.jsx");
await writeFile(mockPath, `import React,{useCallback,useSyncExternalStore} from "react";
let account="a";try{const saved=localStorage.getItem("carmelita-ui-fixture-account");if(["a","b","none","loading"].includes(saved))account=saved;}catch{}
const subscribers=new Set();const subscribe=fn=>{subscribers.add(fn);return()=>subscribers.delete(fn);};
export function selectAccount(value){account=value;try{localStorage.setItem("carmelita-ui-fixture-account",value);}catch{}for(const fn of subscribers)fn();}
export function usePrivy(){const current=useSyncExternalStore(subscribe,()=>account,()=>"a");const getAccessToken=useCallback(async()=>current==="a"||current==="b"?"fixture-user-"+current:null,[current]);return {ready:current!=="loading",authenticated:current==="a"||current==="b",user:current==="a"||current==="b"?{id:"did:privy:ui-fixture-"+current}:null,login:()=>selectAccount("a"),logout:()=>selectAccount("none"),getAccessToken};}
export function useSignRawHash(){return {signRawHash:async()=>{throw new Error("fixture_signing_disabled");}};}
export function FixtureControls(){const current=useSyncExternalStore(subscribe,()=>account,()=>"a");
async function state(value){await fetch("/fixture/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({account:current==="b"?"b":"a",...value})});location.reload();}
return <aside className="fixture-banner" aria-label="Local fixture controls"><strong>Local UI fixture — synthetic accounts, no payments</strong><div className="fixture-controls"><label>Synthetic account <select value={current} onChange={event=>selectAccount(event.target.value)}><option value="a">Account A</option><option value="b">Account B</option><option value="none">Signed out</option><option value="loading">Loading</option></select></label><button onClick={()=>state({status:"active"})}>Set connected</button><button onClick={()=>state({status:"empty"})}>Reset account</button><button onClick={()=>state({status:"preparing"})}>Pending connection</button><label>Catalog state <select defaultValue="ok" onChange={event=>state({catalog:event.target.value})}><option value="ok">Available</option><option value="partial">Partial</option><option value="unavailable">Unavailable</option></select></label><label>Response delay <select defaultValue="0" onChange={event=>state({delayMs:Number(event.target.value)})}><option value="0">None</option><option value="1500">1.5 seconds</option></select></label></div><small>Actual AppsClient and BazaarPanel; HTTP receipts and balances are synthetic. Signing is disabled. This is visual QA, not hosted acceptance.</small></aside>;}
`);
await writeFile(resolve(output, "link.mock.jsx"), `import React from "react";export default function Link({href,children,prefetch,replace,scroll,locale,...props}){return <a {...props} href={typeof href==="string"?href:href.pathname}>{children}</a>;}`);
await writeFile(resolve(output, "image.mock.jsx"), `import React from "react";export default function Image({priority,fill,unoptimized,loader,quality,...props}){return <img {...props}/>;}`);
await writeFile(resolve(output, "entry.jsx"), `import React from "react";import {createRoot} from "react-dom/client";import AppsClient from ${JSON.stringify(resolve(root, "app/apps/apps-client.tsx"))};import {FixtureControls} from "./auth.mock.jsx";createRoot(document.getElementById("fixture-root")).render(<><FixtureControls/><AppsClient configured={true}/></>);`);
const resolveSource = async path => {
  for (const candidate of [path, `${path}.tsx`, `${path}.ts`, `${path}.jsx`, `${path}.js`]) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* Next candidate. */ }
  }
  throw Error("Fixture source import is unavailable");
};
const bundle = await build({ absWorkingDir: root, entryPoints: [resolve(output, "entry.jsx")], outfile: resolve(output, "assets/index.js"),
  bundle: true, platform: "browser", format: "esm", jsx: "automatic", sourcemap: false, metafile: true,
  external: ["/fonts/*", "/brand/*"], define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "isolated-ui-aliases", setup(plugin) {
    plugin.onResolve({ filter: /^@privy-io\/react-auth(?:\/extended-chains)?$/ }, () => ({ path: mockPath }));
    plugin.onResolve({ filter: /^next\/link$/ }, () => ({ path: resolve(output, "link.mock.jsx") }));
    plugin.onResolve({ filter: /^next\/image$/ }, () => ({ path: resolve(output, "image.mock.jsx") }));
    plugin.onResolve({ filter: /^@\// }, async args => ({ path: await resolveSource(resolve(root, args.path.slice(2))) }));
    plugin.onLoad({ filter: /\.module\.css$/ }, async args => ({ contents: await readFile(args.path, "utf8"), loader: "local-css" }));
  } }],
});
await writeFile(resolve(output, "metafile.json"), JSON.stringify(bundle.metafile, null, 2));
const globals = (await readFile(resolve(root, "app/globals.css"), "utf8")).replace('@import "tailwindcss";', "");
await writeFile(resolve(output, "assets/global.css"), globals);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Carmelita apps UI fixture</title><link rel="stylesheet" href="/assets/global.css"><link rel="stylesheet" href="/assets/index.css"><style>.fixture-banner{padding:16px 24px;background:#fff1cf;color:#493919;border-bottom:1px solid #cfb678;font:14px/1.6 system-ui,sans-serif}.fixture-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:12px 0}.fixture-controls label{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.fixture-controls button,.fixture-controls select{min-height:44px;padding:8px 12px;font:14px system-ui,sans-serif}.fixture-banner small{font-size:14px}</style></head><body><div id="fixture-root"></div><script type="module" src="/assets/index.js"></script></body></html>`;
await writeFile(resolve(output, "index.html"), html);
await build({ absWorkingDir: root, entryPoints: [resolve(root, "app/apps/confirmation-resource.ts")],
  outfile: resolve(output, "confirmation-resource.mjs"), bundle: true, platform: "node", format: "esm" });
const { appConfirmationHtml } = await import(pathToFileURL(resolve(output, "confirmation-resource.mjs")).href);
const nativeHostHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local native app confirmation fixture</title><style>*{box-sizing:border-box}body{margin:0;background:#fcfdfb;color:#20372e;font:16px/1.6 system-ui,sans-serif}main{width:min(1080px,calc(100% - 32px));margin:32px auto}.notice{padding:16px;background:#fff1cf;border-bottom:1px solid #cfb678;font-size:14px}.controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:24px 0}.controls label{display:flex;align-items:center;gap:8px}button,select{font:inherit;min-height:44px;padding:8px 14px;border:1px solid #153f32;border-radius:8px;background:white;color:#153f32}button:focus-visible,select:focus-visible{outline:3px solid #ff5b3a;outline-offset:3px}iframe{display:block;width:100%;min-height:360px;border:1px solid #c8dacd;border-radius:16px;background:white}pre{padding:16px;background:#eef4ef;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}.metrics{font-size:16px}</style></head><body><aside class="notice"><strong>Local UI fixture — synthetic accounts, no payments</strong><p>Actual Carmelita MCP Apps confirmation resource, inside a local synthetic host. This does not verify ChatGPT support, OAuth or authenticated ownership.</p></aside><main><h1>Native app confirmation</h1><div class="controls"><label>Preview action <select id="host-action"><option value="add">Add Bazaar</option><option value="remove">Remove Bazaar</option></select></label><label>Preview language <select id="host-locale"><option value="en">EN</option><option value="es">ES</option><option value="pt">PT</option></select></label><label>Simulated result <select id="host-result"><option value="complete">Complete</option><option value="pending">Connection or revocation pending</option></select></label><label>Tool reply delay <select id="host-delay"><option value="0">None</option><option value="1500">1.5 seconds</option></select></label><button id="host-preview">Send preview</button><button id="host-reset">Reset widget and log</button></div><p class="metrics">Tool calls: <strong id="host-count">0</strong> · Initialized: <span id="host-ready">waiting</span></p><iframe id="host-frame" title="Actual app permission confirmation resource" sandbox="allow-scripts" src="/apps/native-confirmation/resource"></iframe><h2>App-only calls log</h2><p>No tool action occurs during initialization or rendering. A call requires an explicit button inside the resource.</p><pre id="host-log">[]</pre></main><script>
(()=>{const frame=document.getElementById('host-frame'),log=[],byId=id=>document.getElementById(id);let preview=null,nonce=null,lastApp=null;
function send(value){frame.contentWindow.postMessage(value,'*');}function show(){byId('host-count').textContent=String(log.length);byId('host-log').textContent=JSON.stringify(log,null,2);}
function reply(id,result,error){send({jsonrpc:'2.0',id,...(error?{error:{code:-32601,message:error}}:{result})});}
function appReply(id,result,error){const saved=result?structuredClone(result):null;const delay=Number(byId('host-delay').value);setTimeout(()=>reply(id,saved,error),delay===1500?1500:0);}
addEventListener('message',event=>{if(event.source!==frame.contentWindow||!event.data||event.data.jsonrpc!=='2.0')return;const message=event.data;
if(message.method==='ui/initialize'){reply(message.id,{protocolVersion:'2026-01-26',hostInfo:{name:'Local synthetic host',version:'1.0.0'},hostCapabilities:{}});return;}
if(message.method==='ui/notifications/initialized'){byId('host-ready').textContent='ready';return;}
if(message.method==='ui/notifications/size-changed'){const height=Number(message.params?.height);if(Number.isFinite(height))frame.style.height=Math.max(360,Math.min(850,height))+'px';return;}
if(message.method!=='tools/call')return;
const name=message.params?.name,args=message.params?.arguments??{};if(!['confirm_app_change','cancel_app_change','retry_app_connection'].includes(name)){appReply(message.id,null,'Only local app-management actions are supported');return;}
log.push({name,arguments:{...args,...(args.confirmationToken?{confirmationToken:'<synthetic nonce omitted>'}:{})}});show();
if(name==='retry_app_connection'){if(!lastApp||args.appId!=='bazaar'||args.installationId!==lastApp.id){appReply(message.id,null,'No pending synthetic connection');return;}lastApp={...lastApp,status:lastApp.status==='removed'?'removed':'active',remoteStatus:lastApp.status==='removed'?'revoked':'linked'};appReply(message.id,{structuredContent:{app:lastApp}});return;}
if(!preview||preview.status!=='prepared'||args.changeId!==preview.id||(name==='confirm_app_change'&&args.confirmationToken!==nonce)){appReply(message.id,null,'Send a fresh synthetic preview');return;}
preview={...preview,status:name==='confirm_app_change'?'confirmed':'cancelled'};nonce=null;
if(name==='confirm_app_change'){const pending=byId('host-result').value==='pending';lastApp={id:'synthetic-native-installation',appId:'bazaar',status:preview.action==='remove'?'removed':pending?'preparing':'active',remoteStatus:preview.action==='remove'?(pending?'revocation_pending':'revoked'):pending?'pending':'linked'};}
appReply(message.id,{structuredContent:{change:preview,...(name==='confirm_app_change'?{app:lastApp}:{})}});
});
byId('host-preview').addEventListener('click',()=>{preview={id:crypto.randomUUID(),appId:'bazaar',action:byId('host-action').value,channel:'chatgpt',status:'prepared',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),definition:{id:'bazaar',name:'Bazaar',version:'1',permissions:['catalog:read','consumption:read']}};nonce='synthetic-native-nonce-'+crypto.randomUUID();lastApp=null;send({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:{change:preview},_meta:{carmelitaConfirmation:{confirmationToken:nonce,locale:byId('host-locale').value}}}});});
byId('host-reset').addEventListener('click',()=>{preview=null;nonce=null;lastApp=null;log.length=0;show();byId('host-ready').textContent='waiting';frame.src='/apps/native-confirmation/resource?reset='+Date.now();});
})();</script></body></html>`;
await writeFile(resolve(output, "native-confirmation-host.html"), nativeHostHtml);

const configuration = { catalog: "ok", purchases: true, approval: "approved", delayMs: 0 };
const definition = { id: "bazaar", name: "Bazaar", version: "1", adapter: "bazaar-v1", description: "Explore reviewed services with your own Carmelita account. This local preview uses illustrative catalog entries.", permissions: ["catalog:read", "consumption:read"], definitionHash: "e".repeat(64), approval: "approved", approvalRevision: 1, evidence: null };
const users = new Map([...["a", "b"].map(id => [id, { own: null, operations: [] }])]);
const changes = new Map();
const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const catalog = Array.from({ length: 20 }, (_, index) => ({ id: index === 0 ? "guionista-bazaar-production-text-v1" : `synthetic-service-${index + 1}`,
  name: index === 0 ? "Guionista · Stellar Testnet" : `Synthetic service ${index + 1}`, description: index === 0 ? "Create a short video script. Illustrative service and declared Testnet price for visual review only." : "Illustrative catalog entry. Availability and delivery have not been validated.", provider: "Synthetic fixture provider", kind: "http", network: "stellar:testnet",
  input: index === 0 ? [{ name: "topic", type: "string", required: true }, { name: "durationSeconds", type: "number", required: false }, { name: "tone", type: "string", required: false }] : [],
  tags: ["synthetic", "text"], payment: { scheme: "exact", asset: "USDC", amount: "0.01", destination: address }, delivery: null, cardHash: "c".repeat(64), submissionId: `synthetic-submission-${index + 1}`, declaredStatus: "published", declaredExecution: "synthetic-ui-fixture", declaredAvailability: null, purchaseDescriptor: null, readiness: { publication: "published", providerAvailability: "not_verified", executable: false }, consumable: false, executionEnabled: false }));
let apiRequests = 0;
function owned(id, status = "active") { return { id: `synthetic-installation-${id}`, appId: "bazaar", definition: { ...definition }, status,
  generation: 1, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), remoteStatus: status === "removed" ? "revoked" : status === "active" ? "linked" : "pending" }; }
async function body(request) { let size = 0; const chunks = []; for await (const chunk of request) { size += chunk.length; if (size > 8192) throw Error("fixture_body_limit"); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
const reply = (response, value, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify({ fixture: true, ...value })); };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/health") return reply(response, { status: "local-ui-fixture", noPayments: true, apiRequests });
    if (url.pathname === "/apps/native-confirmation" || url.pathname === "/apps/native-confirmation/resource") {
      response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store",
        ...(url.pathname.endsWith("/resource") ? { "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'" } : {}) });
      response.end(url.pathname.endsWith("/resource") ? appConfirmationHtml : nativeHostHtml); return;
    }
    if (url.pathname === "/fixture/state") {
      if (request.method === "GET") return reply(response, { configuration, accounts: [...users].map(([account, state]) => ({ account, status: state.own?.status ?? "empty" })) });
      const data = await body(request), state = users.get(data.account === "b" ? "b" : "a");
      if (["empty", "active", "preparing", "removed"].includes(data.status)) { state.own = data.status === "empty" ? null : owned(data.account === "b" ? "b" : "a", data.status); state.operations = []; }
      if (["ok", "partial", "unavailable"].includes(data.catalog)) configuration.catalog = data.catalog;
      if ([0, 1500].includes(data.delayMs)) configuration.delayMs = data.delayMs;
      return reply(response, { status: "synthetic-state-updated" });
    }
    if (url.pathname.startsWith("/api/agent/apps")) {
      apiRequests++; const id = request.headers.authorization === "Bearer fixture-user-a" ? "a" : request.headers.authorization === "Bearer fixture-user-b" ? "b" : null;
      if (!id) return reply(response, { error: "fixture_authentication_required" }, 401);
      const state = users.get(id);
      if (configuration.delayMs) await new Promise(done => setTimeout(done, configuration.delayMs));
      if (url.pathname === "/api/agent/apps") {
        if (request.method === "GET") return reply(response, { available: [{ ...definition, approval: configuration.approval }], own: state.own ? [state.own] : [] });
        const data = await body(request);
        if (data.operation === "prepare") { const change = { id: randomUUID(), appId: "bazaar", action: data.action === "remove" ? "remove" : "add", channel: "web", definition, status: "prepared", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString() }, confirmationToken = `fixture-confirmation-${randomUUID()}`; changes.set(change.id, { id, change, confirmationToken }); return reply(response, { change, confirmationToken }); }
        if (data.operation === "confirm" || data.operation === "cancel") { const pending = changes.get(data.changeId); if (!pending || pending.id !== id || data.operation === "confirm" && pending.confirmationToken !== data.confirmationToken) return reply(response, { error: "fixture_confirmation_invalid" }, 403);
          pending.change.status = data.operation === "confirm" ? "confirmed" : "cancelled"; if (data.operation === "confirm") state.own = owned(id, pending.change.action === "add" ? "active" : "removed"); return reply(response, { change: pending.change, app: state.own }); }
        if (data.operation === "retry") { if (state.own?.status === "preparing") state.own = owned(id); return reply(response, { app: state.own }); }
      }
      if (url.pathname === "/api/agent/apps/bazaar") {
        if (state.own?.status !== "active") return reply(response, { error: "fixture_app_not_added" }, 403);
        if (request.method === "GET") { const query = (url.searchParams.get("q") ?? "").toLowerCase(); const services = configuration.catalog === "unavailable" ? [] : catalog.filter(card => !query || `${card.name} ${card.description}`.toLowerCase().includes(query));
          return reply(response, { catalog: { status: configuration.catalog, services, partialResults: configuration.catalog === "partial", nextCursor: null, paused: false, purchasesEnabled: configuration.purchases, purchaseAdmission: "synthetic-ui-fixture", acceptance: "pending", source: "synthetic-ui-fixture", readOnly: true, executionEnabled: false }, operations: state.operations, webConsumptionEnabled: configuration.purchases }); }
        const data = await body(request);
        if (data.operation === "execute") return reply(response, { error: "fixture_signing_disabled" }, 403);
        if (data.operation === "prepare") { const operation = { operationId: randomUUID(), phase: "awaiting_confirmation", terms: { serviceId: data.serviceId, cardHash: data.cardHash, inputHash: "a".repeat(64), payer: address, amountAtomic: "100000", amount: "0.01", destination: address, network: "stellar:testnet", asset: "USDC", assetSymbol: "USDC" }, input: { durationSeconds: 60, tone: "neutral", ...data.input }, expiresAt: new Date(Date.now() + 600000).toISOString(), signingHash: "f".repeat(64), error: null }; state.operations.push(operation); return reply(response, { operation }); }
        const operation = state.operations.find(operation => operation.operationId === data.operationId); if (!operation) return reply(response, { error: "fixture_operation_not_found" }, 404);
        if (data.operation === "cancel") { operation.phase = "cancelled"; operation.signingHash = null; } return reply(response, { operation });
      }
      return reply(response, { error: "fixture_route_not_supported" }, 404);
    }
    let path;
    if (["/", "/apps"].includes(url.pathname)) path = resolve(output, "index.html");
    else if (/^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname)) path = resolve(output, url.pathname.slice(1));
    else if (/^\/(?:fonts|brand)\/[a-zA-Z0-9_.-]+$/.test(url.pathname)) path = resolve(root, "public", url.pathname.slice(1));
    else return reply(response, { error: "Local UI fixture exposes /apps only" }, 404);
    const permitted = path.startsWith(output + sep) || path.startsWith(resolve(root, "public") + sep);
    if (!permitted || relative(root, path).startsWith("..")) return reply(response, { error: "fixture_path_denied" }, 403);
    const content = await readFile(path), type = path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "text/javascript" : path.endsWith(".woff2") ? "font/woff2" : path.endsWith(".svg") ? "image/svg+xml" : "text/html";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }); response.end(content);
  } catch { reply(response, { error: "fixture_request_failed" }, 400); }
});
server.listen(port, "127.0.0.1", () => console.log(`Local UI fixture: http://127.0.0.1:${port}/apps — synthetic accounts, no payments`));
