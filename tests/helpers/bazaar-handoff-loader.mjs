// Test-only entrypoint for npm run test:bazaar:handoff. Production never imports
// this file. The immutable payer and derived intent hash are replaced solely
// in the two signer modules; no signature-verification bypass is installed.
import {registerHooks,createRequire} from 'node:module';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname,relative,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import http from 'node:http';import https from 'node:https';import net from 'node:net';import tls from 'node:tls';

const deny=()=>{throw Error('REAL_NETWORK_FORBIDDEN');};
globalThis.fetch=async()=>deny();http.request=deny;http.get=deny;https.request=deny;https.get=deny;net.connect=deny;net.createConnection=deny;tls.connect=deny;
process.env.CARMELITA_M6_FIXTURE='synthetic-key-only';
const root=resolve(import.meta.dirname,'../..'),require=createRequire(resolve(root,'package.json')),ts=require('typescript'),{Keypair}=require('@stellar/stellar-sdk');
const signer=resolve(root,'app/bazaar/pilot-signer.ts'),store=resolve(root,'app/bazaar/pilot-signer-store.ts');
const payer=Keypair.fromRawEd25519Seed(Buffer.alloc(32,77)).publicKey(),originalPayer='GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ',originalHash='668880738c6be6fde10b371a47c26c7474cc02dde964a1329116b6e15f88c6c5';
const raw=readFileSync(signer,'utf8'),marker='export const PILOT_TERMS = ';
const terms=JSON.parse(raw.slice(raw.indexOf(marker)+marker.length,raw.indexOf('} as const;',raw.indexOf(marker))+1));terms.payer=payer;
const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v);
const immutable=Object.fromEntries(['version','origin','operationId','card','cardHash','input','inputHash','payer','maxAtomic','paymentProtocol','createdAt'].map(k=>[k,terms[k]]));
const intentHash=createHash('sha256').update(canon({...immutable,phase:'prepared'})).digest('hex');
function own(path){return path.startsWith(root+sep)&&!path.startsWith(resolve(root,'node_modules')+sep);}
function find(path){for(const suffix of['','.ts','.tsx','/index.ts']){const file=path+suffix;if(existsSync(file)&&statSync(file).isFile())return file;}}
registerHooks({
  resolve(specifier,context,next){
    if(specifier==='@/app/privy-stellar')return {url:'fixture:no-real-auth',shortCircuit:true};
    if(specifier.startsWith('@/')){const file=find(resolve(root,specifier.slice(2)));if(!file||!own(file))throw Error('TEST_ALIAS_OUTSIDE_REPO');return next(pathToFileURL(file).href,context);}
    if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){const parent=fileURLToPath(context.parentURL);if(own(parent)&&!extname(specifier)){const file=find(resolve(dirname(parent),specifier));if(file&&own(file))return next(pathToFileURL(file).href,context);}}
    return next(specifier,context);
  },
  load(url,context,next){
    if(url==='fixture:no-real-auth')return {format:'module',source:'export function verifyPrivyAccessToken(){throw Error("REAL_AUTH_FORBIDDEN");} export function signStellarTransactionHash(){throw Error("REAL_SIGN_FORBIDDEN");}',shortCircuit:true};
    if(url.startsWith('file:')){const file=fileURLToPath(url);if(own(file)&&/\.tsx?$/.test(file)){let source=readFileSync(file,'utf8');
      if(file===signer||file===store)source=source.replaceAll(originalPayer,payer).replaceAll(originalHash,intentHash);
      return {format:'module',source:ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:file}).outputText,shortCircuit:true};}}
    return next(url,context);
  },
});
export const syntheticFixture={payer,intentHash,networkDenied:true,sourceModulesTransformed:[relative(root,signer),relative(root,store)]};
