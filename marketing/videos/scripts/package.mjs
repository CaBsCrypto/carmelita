import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const exclude=new Set(['node_modules','renders','snapshots','delivery','.hyperframes','.media','.browser','.git']);
const zip=new AdmZip(),files=[];
async function walk(dir,rel=''){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const next=rel?`${rel}/${entry.name}`:entry.name;
    if(exclude.has(entry.name)||entry.name.endsWith('.log')||entry.name.startsWith('.env')||/^compositions\/[^/]+\/assets(?:\/|$)/.test(next))continue;
    if(entry.isSymbolicLink())throw new Error(`Refusing symlink: ${next}`);
    if(entry.isDirectory())await walk(path.join(dir,entry.name),next);
    else{const bytes=await fs.readFile(path.join(dir,entry.name));zip.addFile(`carmelita-videos/${next}`,bytes);files.push({name:next,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  }
}
await walk(root);
await fs.mkdir(path.join(root,'delivery'),{recursive:true});
const output=path.join(root,'delivery/carmelita-videos-fuentes.zip');
zip.writeZip(output);
const reopened=new AdmZip(output);
if(reopened.getEntries().filter(e=>!e.isDirectory).length!==files.length)throw new Error('Archive count mismatch');
for(const file of files){const data=reopened.readFile(`carmelita-videos/${file.name}`);if(!data||createHash('sha256').update(data).digest('hex')!==file.sha256)throw new Error(`Archive hash mismatch: ${file.name}`);}
const archive=await fs.readFile(output);
await fs.writeFile(path.join(root,'delivery/source-manifest.json'),JSON.stringify({name:path.basename(output),sha256:createHash('sha256').update(archive).digest('hex'),size:archive.length,verifiedArchiveEntries:files.length,files},null,2)+'\n');
console.log(`Source ZIP verified: ${files.length} files, ${(archive.length/1024/1024).toFixed(1)} MB`);
