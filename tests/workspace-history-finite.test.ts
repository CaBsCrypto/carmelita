import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createBazaarWebHistory} from '../app/bazaar/workspace-history-web';
import {createBazaarWorkspaceReadAdapter, type NativeReadDependencies, type BazaarBinding} from '../app/bazaar/workspace-read-adapter';

const userId='did:privy:synthetic-history', ownerId='ow_'+'a'.repeat(32), other='ow_'+'b'.repeat(32), agentAccess='t'.repeat(43);
const binding:BazaarBinding={userId,ownerId,workspaceId:'workspace-synthetic',agentId:'agent-synthetic',generation:7,agentSecretReference:'secret-synthetic'};
const order={operationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',serviceId:'synthetic-service',buyerOwnerId:ownerId,sellerOwnerId:other,perspective:'purchase',phase:'delivered',paymentVerifiedAt:'2026-10-20T00:00:00.000Z',transactionHash:'c'.repeat(64)};
const page={orders:[order],nextCursor:'opaque_cursor_1',partialResults:false};
const json=(v:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json',...headers}});
function fixture(response:()=>Response=()=>json(page)){
 let reads=0;const calls:Array<{url:string;init:RequestInit|undefined}>=[];
 const deps:NativeReadDependencies={authenticatedUserId:async()=>userId,bindingForUser:async()=>{reads++;return {...binding};},agentSecretForUser:async()=>({userId,ownerId,agentAccess}),fetcher:async(url,init)=>{calls.push({url:String(url),init});return response();}};
 return {deps,calls,read:()=>reads,run:()=>createBazaarWebHistory(deps)()};
}
test('one native owner GET with fixed limit, credential only at Bazaar, and wrapped cursor',async()=>{
 const f=fixture(),got=await f.run();assert.equal(f.calls.length,1);const call=f.calls[0];
 assert.equal(call.url,'https://bazaar.browns.studio/api/market/orders?limit=1');assert.equal(call.init?.method,'GET');assert.equal(call.init?.body,undefined);
 assert.deepEqual(call.init?.headers,{Accept:'application/json',Authorization:'Bearer '+agentAccess});assert.equal(call.init?.redirect,'error');assert.equal(call.init?.credentials,'omit');assert.equal(call.init?.cache,'no-store');assert(call.init?.signal instanceof AbortSignal);
 assert.deepEqual(got.orders,[{operationId:order.operationId,serviceId:order.serviceId,perspective:'purchase',phase:'delivered',paymentVerifiedByBazaar:true,delivered:true}]);
 assert.deepEqual(got.nextCursor,{ownerId,generation:7,value:page.nextCursor});assert.equal(got.readOnly,true);assert.equal(got.independentlyVerifiedChainPayment,false);
});
test('native web projection equals the unchanged MCP adapter projection',async()=>{
 const direct=fixture(),expected=await direct.run(),seen:string[]=[];
 const deps={...direct.deps,fetcher:async(url:RequestInfo|URL,init?:RequestInit)=>{
   seen.push(String(url));if(new URL(String(url)).pathname==='/api/integration')return json({version:'bazaar.integration/v1',endpoints:{mcp:{path:'/api/mcp'},catalogue:{path:'/api/market/catalog'},orders:{path:'/api/market/orders'}},transport:{testedMcpProtocolVersion:'2024-11-05'},identity:{ownerAssignedByServer:true,authenticatedRoleField:'role'}});
   const rpc=JSON.parse(String(init?.body));if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
   let result:unknown=rpc.method==='initialize'?{protocolVersion:'2024-11-05'}:rpc.method==='tools/list'?{tools:['get_bazaar_identity','get_bazaar_capabilities','list_market_orders'].map(name=>({name}))}:undefined;
   if(rpc.method==='tools/call'){const value=rpc.params.name==='get_bazaar_identity'?{...binding,role:'agent',network:'stellar:testnet'}:page;result={content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};}
   return json({jsonrpc:'2.0',id:rpc.id,result});
 }};
 assert.deepEqual(await createBazaarWorkspaceReadAdapter(deps).history({limit:1}),expected);assert.equal(seen.length,6);assert.equal(direct.calls.length,1);
});
test('rotated or revoked credential rejects on native 401 without retry',async()=>{const f=fixture(()=>json({},401));await assert.rejects(f.run,/bazaar_native_access_denied/);assert.equal(f.calls.length,1);});
test('foreign native owner and incorrect perspective never return private rows',async()=>{
 for(const altered of [{...order,buyerOwnerId:other,sellerOwnerId:other},{...order,perspective:'sale'}]){const f=fixture(()=>json({...page,orders:[altered]}));await assert.rejects(f.run,/bazaar_native_history_owner_mismatch/);assert.equal(f.calls.length,1);}
});
test('foreign owner or generation cursor rejects before fetching or opening a secret',async()=>{
 for(const cursor of [{ownerId:other,generation:7,value:'valid'},{ownerId,generation:8,value:'valid'},{ownerId,generation:7,value:'bad+/'}]){
   const f=fixture();let secrets=0;f.deps.agentSecretForUser=async()=>{secrets++;throw Error('MUST_NOT_OPEN');};await assert.rejects(()=>createBazaarWebHistory(f.deps)({cursor}));assert.equal(f.calls.length,0);assert.equal(secrets,0);
 }
});
test('valid opaque pagination stays on the native fixed endpoint',async()=>{const f=fixture(()=>json({orders:[],nextCursor:null,partialResults:false}));const got=await createBazaarWebHistory(f.deps)({cursor:{ownerId,generation:7,value:'valid_opaque'}});assert.equal(f.calls[0].url,'https://bazaar.browns.studio/api/market/orders?limit=1&cursor=valid_opaque');assert.deepEqual(got.orders,[]);assert.equal(got.nextCursor,null);});
test('link changed before dispatch prevents all fetches',async()=>{const f=fixture();let n=0;f.deps.bindingForUser=async()=>({...binding,generation:++n===1?7:8});await assert.rejects(f.run,/bazaar_native_binding_changed/);assert.equal(f.calls.length,0);});
test('link or authenticated user changed after response never returns its rows',async()=>{
 const f=fixture();let n=0;f.deps.bindingForUser=async()=>({...binding,generation:++n<3?7:8});await assert.rejects(f.run,/bazaar_native_binding_changed/);assert.equal(f.calls.length,1);
 const g=fixture();let u=0;g.deps.authenticatedUserId=async()=>++u<3?userId:'did:privy:other';await assert.rejects(g.run,/bazaar_native_binding_changed/);assert.equal(g.calls.length,1);
});
test('wrong secret ownership and absent binding never open a native request',async()=>{
 for(const secret of [{userId:'did:privy:other',ownerId,agentAccess},{userId,ownerId:other,agentAccess},{userId,ownerId,agentAccess:'bad'}]){const f=fixture();f.deps.agentSecretForUser=async()=>secret;await assert.rejects(f.run,/bazaar_native_secret_owner_mismatch/);assert.equal(f.calls.length,0);}
 const f=fixture();f.deps.bindingForUser=async()=>null;await assert.rejects(f.run,/bazaar_native_link_required/);assert.equal(f.calls.length,0);
});
test('response size and redirects reject once without following credentials',async()=>{
 const big=fixture(()=>json({padding:'x'.repeat(131073)}));await assert.rejects(big.run,/bazaar_native_response_too_large/);assert.equal(big.calls.length,1);
 for(const response of [()=>json({},302,{Location:'https://foreign.invalid/'}),()=>{const r=json(page);Object.defineProperty(r,'url',{value:'https://foreign.invalid/'});return r;},()=>{const r=json(page);Object.defineProperty(r,'redirected',{value:true});return r;}]){const f=fixture(response);await assert.rejects(f.run,/bazaar_native_redirect_forbidden/);assert.equal(f.calls.length,1);}
});
test('timeout and uncertain network acknowledgement never retry',async()=>{
 for(const error of [new DOMException('synthetic deadline','TimeoutError'),new Error('synthetic uncertain ACK')]){const f=fixture();f.deps.fetcher=async(url,init)=>{f.calls.push({url:String(url),init});throw error;};await assert.rejects(f.run,/bazaar_native_read_unconfirmed/);assert.equal(f.calls.length,1);}
 const f=fixture(),abort=new AbortController();abort.abort();f.deps.signal=abort.signal;await assert.rejects(f.run,/bazaar_native_read_unconfirmed/);assert.equal(f.calls.length,0);
});
test('malformed pages, multiple rows, invalid next cursor and invalid content type reject',async()=>{
 for(const body of [{...page,orders:[order,order]},{...page,partialResults:'false'},{...page,nextCursor:'bad+/'},[]]){const f=fixture(()=>json(body));await assert.rejects(f.run,/bazaar_native_response_invalid/);assert.equal(f.calls.length,1);}
 const f=fixture(()=>new Response('{}',{headers:{'Content-Type':'text/html'}}));await assert.rejects(f.run,/bazaar_native_response_invalid/);assert.equal(f.calls.length,1);
});
test('sale perspective and empty bounded first page preserve private pagination semantics',async()=>{
 const sale={...order,buyerOwnerId:other,sellerOwnerId:ownerId,perspective:'sale'},f=fixture(()=>json({...page,orders:[sale]}));assert.equal((await f.run()).orders[0].perspective,'sale');
 const g=fixture(()=>json({orders:[],nextCursor:'next_opaque',partialResults:true})),r=await g.run();assert.deepEqual(r.orders,[]);assert.equal(r.partialResults,true);assert.deepEqual(r.nextCursor,{ownerId,generation:7,value:'next_opaque'});
});
