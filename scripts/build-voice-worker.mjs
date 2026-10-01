import {build} from "esbuild";
import {mkdir, copyFile, readFile, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const output=resolve(root,"public/voice");
await mkdir(output,{recursive:true});
await build({absWorkingDir:root,entryPoints:[resolve(root,"app/agent/voice/whisper-worker.ts")],outfile:resolve(output,"whisper-worker.js"),bundle:true,format:"esm",platform:"browser",target:"es2022",minify:true,legalComments:"eof",alias:{"onnxruntime-web":"onnxruntime-web/wasm"},conditions:["onnxruntime-web-use-extern-wasm"]});
for(const file of ["ort-wasm-simd-threaded.mjs","ort-wasm-simd-threaded.wasm"])
  await copyFile(resolve(root,"node_modules/onnxruntime-web/dist",file),resolve(output,file));
const licenses=await Promise.all([readFile(resolve(root,"node_modules/@huggingface/transformers/LICENSE"),"utf8"),readFile(resolve(root,"scripts/voice-licenses/onnxruntime-LICENSE"),"utf8")]);
await writeFile(resolve(output,"licenses.txt"),"Transformers.js (Apache-2.0)\n"+licenses[0]+"\nONNX Runtime (MIT)\n"+licenses[1]+"\nWhisper model: https://github.com/openai/whisper/blob/main/LICENSE\n");
console.log("Local Whisper worker and WASM assets built; model weights download only on explicit transcription.");
