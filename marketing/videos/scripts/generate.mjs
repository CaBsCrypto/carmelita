import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaigns = JSON.parse(await fs.readFile(path.join(project, 'content/campaigns.json'), 'utf8'));
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const palette = { green:'#153F32', coral:'#FF5B3A', paper:'#F7F2E8', white:'#FFFDF8', ink:'#20211E' };
const rows = [];
const networks = ['Avalanche Fuji','Base Sepolia','BNB Testnet','Solana Devnet','Stellar Testnet'];

function visual(scene) {
  const items = scene.items?.length ? scene.items : networks;
  if (scene.kind === 'chat') return `<div class="visual chat-card"><div class="card-top"><img src="../../assets/brand/carmelita-mark.svg" alt=""/><span>Carmelita</span><span class="online">Consulta</span></div><div class="prompt">${e(scene.prompt || 'Muéstrame mis billeteras registradas')}</div><div class="response"><span class="response-label">TU CUENTA · TUS WALLETS</span><p>${e(scene.reply || 'Consulta tus direcciones registradas y abre el explorador de cada red.')}</p></div><div class="mini-networks">${networks.map(n=>`<span>${e(n)}</span>`).join('')}</div><div class="illustration">Ejemplo ilustrativo · sin datos personales</div></div>`;
  if (scene.kind === 'steps') return `<div class="visual steps-card">${items.map((item,i)=>`<div class="step"><span class="step-number">${i+1}</span><div>${e(item)}</div></div>`).join('')}<div class="illustration">Conexión manual · autorización del usuario</div></div>`;
  if (scene.kind === 'vision') return `<div class="visual vision-card"><div class="vision-badge">VISIÓN EN DESARROLLO</div><div class="hub"><img src="../../assets/brand/carmelita-mark.svg" alt=""/><span>Carmelita</span></div><div class="flow-line"></div><div class="vision-items">${(scene.items?.length?scene.items:['Descubrir','Autorizar','Consultar']).map((item,i)=>`<div><span class="node-index">0${i+1}</span><strong>${e(item)}</strong></div>`).join('')}</div><p class="vision-note">Integraciones de servicios en preparación</p></div>`;
  if (scene.kind === 'wallets') return `<div class="visual wallet-card"><div class="card-top"><span>Cinco redes de prueba</span><span class="online">Testnet</span></div>${items.map((item,i)=>`<div class="network-row"><span class="network-symbol">${['A','B','B','S','S'][i%5]}</span><strong>${e(item)}</strong><span class="network-check">↗</span></div>`).join('')}<div class="illustration">Direcciones propias · exploradores por red</div></div>`;
  if (scene.kind === 'cta') return `<div class="visual cta-card"><div class="mark-ring"><img src="../../assets/brand/carmelita-mark.svg" alt=""/></div><div class="cta-pill">${e(scene.items?.[0] || 'Conoce Carmelita')} <span>↗</span></div><div class="url-card">carmelita.browns.studio${scene.isEnterprise?'':'<span style="display:block;font-size:24px;margin-top:6px">/connect-chatgpt</span>'}</div><div class="illustration">${scene.isEnterprise ? 'Conoce el proyecto y su visión' : 'Guía de conexión paso a paso'}</div></div>`;
  return `<div class="visual value-card"><div class="value-mark"><img src="../../assets/brand/carmelita-mark.svg" alt=""/></div><div class="value-caption">${e(items[0] || 'Una conversación')}</div><div class="value-lines">${items.slice(1,4).map(item=>`<div><span class="dot"></span>${e(item)}</div>`).join('')}</div><div class="illustration">${scene.roadmap ? 'Propuesta de integración piloto' : 'Carmelita + ChatGPT'}</div></div>`;
}

function compose(campaign, scenes, width, height, duration, id) {
  const vertical = height > width;
  let cursor=0;
  const timed=scenes.map((scene,i)=>{const start=cursor;cursor+=scene.duration;return {...scene,start,index:i};});
  if (cursor !== duration) throw new Error(`${id}: duration ${cursor}`);
  const body=timed.map(scene=>{
    const dark=scene.index===0 || scene.kind==='cta';
    scene.isEnterprise=campaign.id==='empresas';
    if(scene.kind==='cta') scene.items=[campaign.ctaLabel];
    if(scene.kind==='vision' && scene.roadmap?.length) scene.items=scene.roadmap;
    return `<section id="s${scene.index}" class="clip scene ${dark?'dark':'light'}" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="${scene.index+1}"><div class="scene-ground"></div><div class="scene-inner"><div class="copy"><div class="eyebrow"><span class="eyebrow-line"></span>${e(scene.label)}</div><h1>${e(scene.title)}</h1><p class="body-copy">${e(scene.body)}</p>${scene.roadmap ? '<span class="scope-label">Visión en desarrollo · piloto por validar</span>' : '<span class="scope-label">Wallets Testnet / Devnet</span>'}</div>${visual(scene)}</div><div class="scene-counter">${String(scene.index+1).padStart(2,'0')} <span>/ ${String(scenes.length).padStart(2,'0')}</span></div></section>`;
  }).join('\n');
  const animations=timed.map(s=>`
  tl.fromTo('#s${s.index} .copy', {opacity:0,y:26}, {opacity:1,y:0,duration:.7,ease:'power2.out',immediateRender:false}, ${s.start+.08});
  tl.fromTo('#s${s.index} .visual', {opacity:0,y:38,scale:.97}, {opacity:1,y:0,scale:1,duration:.85,ease:'power2.out',immediateRender:false}, ${s.start+.3});
  ${['steps','wallets','vision'].includes(s.kind)?`tl.fromTo('#s${s.index} .visual .step, #s${s.index} .visual .network-row, #s${s.index} .visual .vision-items > div', {opacity:0,x:16}, {opacity:1,x:0,duration:.45,stagger:.12,ease:'power2.out',immediateRender:false}, ${s.start+.9});`:''}
  tl.to('#s${s.index} .scene-inner', {opacity:0,duration:.24,ease:'power1.in'}, ${s.start+s.duration-.24});`).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${e(campaign.title)} · ${duration}s · ${vertical?'Vertical':'Horizontal'}</title>
<style>
@font-face{font-family:Inter;src:url('../../assets/fonts/InterVariable.woff2') format('woff2');font-weight:100 900;font-style:normal;font-display:block}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${palette.paper};font-family:Inter,sans-serif}#root{position:relative;width:100%;height:100%;overflow:hidden;color:${palette.ink}}
.scene{position:absolute;inset:0;overflow:hidden}.scene-ground{position:absolute;inset:0;background:${palette.paper}}.dark{color:${palette.white}}.dark .scene-ground{background:${palette.green}}.scene-inner{position:absolute;inset:${vertical?'280px 88px 305px':'235px 136px 190px'};display:${vertical?'flex':'grid'};${vertical?'flex-direction:column;justify-content:center;gap:64px':'grid-template-columns:1fr 1fr;gap:108px;align-items:center'}}
.copy{position:relative;min-width:0;opacity:0}.eyebrow{font-size:${vertical?29:26}px;font-weight:650;letter-spacing:2.5px;text-transform:uppercase;display:flex;align-items:center;gap:18px;line-height:1.4}.eyebrow-line{display:block;flex:0 0 40px;height:4px;background:${palette.coral}}
h1{font-size:${vertical?85:78}px;font-weight:720;line-height:1.08;letter-spacing:-4px;margin:28px 0 24px;max-width:100%;overflow-wrap:normal;white-space:pre-line}.body-copy{font-size:${vertical?35:31}px;line-height:1.46;font-weight:430;max-width:100%;margin:0 0 28px}.scope-label{display:inline-block;font-size:${vertical?24:23}px;line-height:1.3;padding:10px 17px;border:1px solid rgba(21,63,50,.25);border-radius:30px;color:${palette.green}}.dark .scope-label{color:#DAE8DC;border-color:#638378}
.visual{opacity:0;position:relative;color:${palette.green};background:${palette.white};border:1px solid #DFD8CC;border-radius:34px;${vertical?'width:100%;flex:0 0 auto;max-height:655px':'width:100%;min-height:430px;max-height:580px'};padding:${vertical?43:34}px;overflow:hidden}.card-top{display:flex;align-items:center;gap:15px;font-size:${vertical?32:28}px;font-weight:700;padding-bottom:26px}.card-top img{width:43px;height:43px}.online{margin-left:auto;font-size:18px;font-weight:600;background:#E1EEE4;border-radius:20px;padding:8px 13px;white-space:nowrap}.illustration{font-size:${vertical?23:19}px;color:#506C5F;line-height:1.4;margin-top:26px;border-top:1px solid #DED8CD;padding-top:20px}
.prompt{font-size:${vertical?32:27}px;line-height:1.4;font-weight:550;background:#DBEADF;border-radius:20px 20px 5px 20px;padding:23px;max-width:94%;margin-left:auto}.response{margin-top:30px}.response-label{font-size:18px;font-weight:650;letter-spacing:1px;color:#496D59}.response p{font-size:${vertical?30:26}px;line-height:1.45;margin:14px 0 22px}.mini-networks{display:flex;gap:11px;flex-wrap:wrap}.mini-networks span{font-size:${vertical?21:19}px;background:${palette.paper};border-radius:8px;padding:9px 12px}
.step{display:flex;gap:23px;align-items:center;border-bottom:1px solid #DFD8CC;padding:20px 0;font-size:${vertical?32:29}px;line-height:1.35;font-weight:550}.step:first-child{padding-top:0}.step:last-of-type{border-bottom:0}.step-number{display:flex;align-items:center;justify-content:center;flex:0 0 51px;height:51px;border-radius:50%;background:#E0EEE5;color:${palette.green};font-weight:700;font-size:24px}
.network-row{display:flex;align-items:center;gap:18px;padding:15px 0;border-bottom:1px solid #DFD8CC}.network-row strong{font-size:${vertical?30:27}px;font-weight:570}.network-symbol{display:flex;width:43px;height:43px;align-items:center;justify-content:center;font-size:22px;border-radius:12px;background:#E4EEE6}.network-check{margin-left:auto;font-size:30px;color:#476A57}
.value-card{text-align:left;padding:${vertical?52:45}px}.value-mark{width:110px;height:110px;display:flex;align-items:center;justify-content:center;background:#E4EEE6;border-radius:28px;margin-bottom:24px}.value-mark img{width:78px;height:78px}.value-caption{font-size:${vertical?47:43}px;font-weight:680;line-height:1.16;letter-spacing:-1.5px}.value-lines{margin-top:27px}.value-lines>div{display:flex;gap:17px;font-size:${vertical?30:27}px;padding:11px 0;align-items:center;line-height:1.25}.dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:${palette.coral}}
.vision-card{padding:40px}.vision-badge{display:inline-block;font-size:20px;font-weight:700;letter-spacing:1px;background:#F6E1DA;color:#74351E;padding:10px 13px;border-radius:8px;margin-bottom:28px}.hub{display:flex;gap:20px;align-items:center;font-size:43px;font-weight:730}.hub img{width:65px;height:65px}.flow-line{height:45px;width:2px;background:#BECFC2;margin-left:32px}.vision-items{display:flex;gap:13px}.vision-items>div{flex:1;min-width:0;background:#E9EFE7;border-radius:15px;padding:21px 16px}.node-index{font-size:20px;font-weight:550;color:#456859;display:block;margin-bottom:12px}.vision-items strong{font-size:${vertical?24:22}px;font-weight:600;line-height:1.3;display:block;overflow-wrap:anywhere}.vision-note{font-size:${vertical?25:22}px;line-height:1.4;margin:28px 0 0;color:#4E6A5B}
.cta-card{display:flex;flex-direction:column;align-items:center;text-align:center;padding:50px 32px}.mark-ring{width:150px;height:150px;border-radius:50%;background:#E1EEE4;display:flex;align-items:center;justify-content:center;margin-bottom:30px}.mark-ring img{width:100px;height:100px}.cta-pill{padding:21px 25px;border-radius:15px;background:${palette.green};color:${palette.white};font-size:${vertical?28:25}px;font-weight:700;line-height:1.35;width:100%}.cta-pill span{margin-left:8px}.url-card{font-size:${vertical?27:25}px;letter-spacing:-.5px;margin-top:24px;font-weight:580}
.brand{position:absolute;left:${vertical?88:136}px;top:${vertical?110:73}px;z-index:30;display:flex;align-items:center;gap:18px;color:${palette.green};background:${palette.white};border-radius:22px;padding:15px 21px}.brand img{width:49px;height:49px}.brand span{font-size:32px;font-weight:750;letter-spacing:-1px}.edition{position:absolute;right:${vertical?88:136}px;top:${vertical?131:96}px;z-index:30;font-size:21px;background:#E0EBDF;color:${palette.green};padding:9px 16px;border-radius:20px;font-weight:550}
.footer{position:absolute;left:${vertical?88:136}px;right:${vertical?88:136}px;bottom:${vertical?168:65}px;z-index:30;display:flex;justify-content:space-between;align-items:center;gap:20px;color:${palette.green};background:${palette.white};padding:17px 22px;border-radius:14px;font-size:${vertical?24:22}px;line-height:1.4}.footer .small{font-size:${vertical?20:19}px;text-align:right;max-width:45%;color:#486654}.scene-counter{position:absolute;right:${vertical?94:141}px;bottom:${vertical?251:155}px;font-size:26px;letter-spacing:1px;font-weight:600}.scene-counter span{opacity:.55}
.accent{position:absolute;right:${vertical?94:144}px;top:${vertical?216:177}px;width:34px;height:34px;background:${palette.coral};z-index:20;border-radius:7px}
</style></head><body><div id="root" data-composition-id="${id}" data-width="${width}" data-height="${height}" data-duration="${duration}" data-fps="30">
${body}<div class="brand"><img src="../../assets/brand/carmelita-mark.svg" alt=""/><span>Carmelita</span></div><div class="edition">${campaign.id==='empresas'?'Visión + piloto':'Piloto Testnet'}</div><div class="accent"></div><div class="footer"><span>carmelita.browns.studio</span><span class="small">${campaign.id==='empresas'?'Servicios en preparación':'MCP personalizado · cuenta compatible'}</span></div><audio id="brand-music" src="../../assets/audio/brand-bed-${duration}s.wav" data-start="0" data-duration="${duration}" data-track-index="20" data-volume="0.8"></audio>
</div><script src="../../assets/vendor/gsap.min.js"></script><script>
const tl=gsap.timeline({paused:true});${animations}
tl.fromTo('.accent',{rotation:0},{rotation:90,duration:${duration},ease:'none'},0);
window.__timelines = window.__timelines || {};
window.__timelines['${id}']=tl;
</script></body></html>`;
}

for (const campaign of campaigns) {
  for (const duration of [60,15]) for (const format of ['horizontal','vertical']) {
    const width=format==='horizontal'?1920:1080, height=format==='horizontal'?1080:1920;
    const id=`${campaign.id}-${duration}s-${format}`;
    const dir=path.join(project,'compositions',id);
    await fs.mkdir(dir,{recursive:true});
    const scenes=duration===60?campaign.longScenes:campaign.shortScenes;
    await fs.cp(path.join(project,'assets'),path.join(dir,'assets'),{recursive:true});
    await fs.writeFile(path.join(dir,'index.html'),compose(campaign,scenes,width,height,duration,id).replaceAll('../../assets/','assets/').replace(/[ \t]+$/gm,''));
    await fs.writeFile(path.join(dir,'hyperframes.json'),JSON.stringify({name:id,entry:'index.html',width,height,fps:30,duration,skill:'product-launch-video'},null,2)+'\n');
    rows.push({id,campaign:campaign.id,duration,format,width,height,fps:30,dir:`compositions/${id}`,output:`renders/carmelita-${id}.mp4`,thumbnail:`delivery/miniaturas/carmelita-${id}.png`,midpoints:scenes.reduce((a,s)=>{const start=a.cursor;a.times.push(Number((start+s.duration/2).toFixed(2)));a.cursor+=s.duration;return a;},{cursor:0,times:[]}).times});
  }
}
await fs.writeFile(path.join(project,'content/render-manifest.json'),JSON.stringify({version:1,brand:palette,sourceCommit:'caa3cd3757dbe6e2473bc78eeedca45ee2bb1542',videos:rows},null,2)+'\n');
console.log(`Generated ${rows.length} compositions, 450 seconds total.`);
