import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;
// Only public model files leave this worker. Audio is passed as PCM in memory.
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.wasmPaths = new URL("./", self.location.href).href;
let transcriber: Promise<AutomaticSpeechRecognitionPipeline> | undefined;
let active = false;
self.onmessage = async (event: MessageEvent<{id: string; audio: Float32Array; locale: "es" | "en" | "pt"}>) => {
  const {id, audio, locale} = event.data;
  if (active || !(audio instanceof Float32Array) || !audio.length || audio.length > 16000 * 121 || !["es", "en", "pt"].includes(locale)) {
    self.postMessage({id, kind: "error"}); return;
  }
  active = true;
  try {
    transcriber ??= pipeline<"automatic-speech-recognition">("automatic-speech-recognition", "onnx-community/whisper-tiny", {
      revision: "ff4177021cc41f7db950912b73ea4fdf7d01d8e7", device: "wasm", dtype: "q8",
      progress_callback: progress => {
        if (progress.status === "progress") self.postMessage({id, kind: "progress", file: progress.file, loaded: progress.loaded, total: progress.total});
      },
    });
    const model = await transcriber;
    self.postMessage({id, kind: "transcribing"});
    const output = await model(audio, {language: {es: "spanish", en: "english", pt: "portuguese"}[locale], task: "transcribe", chunk_length_s: 30, stride_length_s: 5});
    const result = Array.isArray(output) ? output[0] : output;
    const text = result.text.trim();
    self.postMessage({id, kind: text ? "complete" : "empty", text});
  } catch {
    transcriber = undefined;
    self.postMessage({id, kind: "error"});
  } finally { active = false; }
};
