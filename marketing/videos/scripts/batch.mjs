import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=path.join(project,'node_modules/hyperframes/bin/hyperframes.mjs');
const mode=process.argv[2]||'check';
const selection=process.argv[3];
const manifest=JSON.parse(await fs.readFile(path.join(project,'content/render-manifest.json'),'utf8'));
const videos=selection?manifest.videos.filter(v=>v.id.includes(selection)):manifest.videos;
if(!videos.length)throw new Error('No matching composition');
await fs.mkdir(path.join(project,'snapshots'),{recursive:true});
await fs.mkdir(path.join(project,'renders'),{recursive:true});
const run=(args,logPath,cwd)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[cli,...args],{cwd,windowsHide:true,env:{...process.env,HYPERFRAMES_NO_TELEMETRY:'1'}});
  const chunks=[],errors=[];
  child.stdout.on('data',d=>{chunks.push(d);});
  child.stderr.on('data',d=>{errors.push(d);});
  child.on('error',reject);
  child.on('close',async code=>{
    await fs.writeFile(logPath,Buffer.concat(chunks));
    if(errors.length)await fs.writeFile(logPath+'.stderr.log',Buffer.concat(errors));
    if(code===0){console.log('Completed');resolve();}else{console.error(Buffer.concat(chunks).toString().slice(-4500));console.error(Buffer.concat(errors).toString().slice(-2000));reject(new Error(`HyperFrames exited ${code}`));}
  });
});
for(const v of videos){
  const dir=path.join(project,v.dir);
  console.log(`\n${mode}: ${v.id}`);
  if(mode==='render'){
    const output=path.join(project,v.output);
    try{if((await fs.stat(output)).size>10000){console.log('Existing output retained');continue;}}catch{}
    await run(['render','--quality','delivery','--fps','30','--workers','4','--output',output],path.join(project,'renders',`${v.id}.log`),dir);
  }else if(mode==='snapshots'){
    const out=path.join(project,'snapshots',v.id);
    await run(['snapshot','--at',v.midpoints.join(','),'--output',out,'--describe','false'],path.join(project,'snapshots',`${v.id}.snapshot.log`),dir);
  }else if(mode==='check'){
    await run(['check','--at',v.midpoints.join(','),'--json'],path.join(project,'snapshots',`${v.id}.check.json`),dir);
  }else throw new Error('Expected check, snapshots or render');
}
