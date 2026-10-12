import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(project,'content/render-manifest.json'),'utf8'));
await fs.mkdir(path.join(project,'delivery/miniaturas'),{recursive:true});
let results=[];
try{results=JSON.parse(await fs.readFile(path.join(project,'delivery/media-verification.json'),'utf8')).videos;}catch{}
const selection=process.argv[2];
for(const video of manifest.videos.filter(v=>!selection||v.id.includes(selection))){
  const file=path.join(project,video.output);
  const bytes=await fs.readFile(file);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const previous=results.find(r=>r.name===path.basename(file));
  if(previous?.sha256===sha256){try{await fs.stat(path.join(project,video.thumbnail));console.log(`${video.id}: retained verified hash`);continue;}catch{}}
  results=results.filter(r=>r.name!==path.basename(file));
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8',windowsHide:true}));
  const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
  if(!v||!a||v.width!==video.width||v.height!==video.height||v.r_frame_rate!=='30/1'||Math.abs(Number(probe.format.duration)-video.duration)>.08||v.codec_name!=='h264'||a.codec_name!=='aac'||a.channels!==2)throw new Error(`${video.id}: unexpected media format`);
  execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const analysis=await new Promise((resolve,reject)=>{
    // execFile's bounded stderr carries the loudnorm summary, not file contents.
    import('node:child_process').then(({execFile})=>execFile('ffmpeg',['-hide_banner','-nostats','-i',file,'-af','loudnorm=I=-18:TP=-1:LRA=9:print_format=json','-f','null','-'],{windowsHide:true},(err,out,stderr)=>err?reject(err):resolve(stderr)));
  });
  const match=String(analysis).match(/\{\s*"input_i"[\s\S]*?\}/);
  if(!match)throw new Error(`${video.id}: missing audio measurement`);
  const audio=JSON.parse(match[0]);
  if(Number(audio.input_tp)>-1||Number(audio.input_i)>-14||Number(audio.input_i)<-23)throw new Error(`${video.id}: audio level out of bounds`);
  const thumbnail=path.join(project,video.thumbnail);
  execFileSync('ffmpeg',['-v','error','-y','-ss','2','-i',file,'-frames:v','1',thumbnail],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  results.push({name:path.basename(file),duration:Number(probe.format.duration),width:v.width,height:v.height,fps:v.r_frame_rate,videoCodec:v.codec_name,pixelFormat:v.pix_fmt,audioCodec:a.codec_name,sampleRate:a.sample_rate,channels:a.channels,loudnessLufs:Number(audio.input_i),truePeakDb:Number(audio.input_tp),size:bytes.length,sha256,thumbnail:path.basename(thumbnail),decode:'passed'});
  console.log(`${video.id}: ${video.duration}s, ${video.width}x${video.height}, 30fps, ${audio.input_i} LUFS, decode passed`);
}
await fs.writeFile(path.join(project,'delivery/media-verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),sourceCommit:manifest.sourceCommit,videos:results},null,2)+'\n');
await fs.writeFile(path.join(project,'delivery/SHA256SUMS'),results.map(r=>`${r.sha256}  ${r.name}`).join('\n')+'\n');
console.log(`Verified ${results.length}/${manifest.videos.length} MP4 files and ${results.length} thumbnails.`);
