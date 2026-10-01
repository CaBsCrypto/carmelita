import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import {isSpeechLanguage, whisperLanguages, type SpeechLanguage} from "./speech-language";
import {isVoiceModel, voiceModels, type VoiceModel} from "./transcription-model";

env.allowLocalModels = false;
env.useBrowserCache = true;
// Only public model files leave this worker. Audio is passed as PCM in memory.
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.wasmPaths = new URL("./", self.location.href).href;
let transcriber: Promise<AutomaticSpeechRecognitionPipeline> | undefined;
let loadedModel: VoiceModel | undefined;
let active = false;
self.onmessage = async (event: MessageEvent<{id: string; audio: Float32Array; language: SpeechLanguage; model: VoiceModel}>) => {
  const {id, audio, language, model: selected} = event.data;
  if (active || !(audio instanceof Float32Array) || !audio.length || audio.length > 16000 * 121 || !isSpeechLanguage(language) || !isVoiceModel(selected)) {
    self.postMessage({id, kind: "error"}); return;
  }
  active = true;
  try {
    if (transcriber && loadedModel !== selected) { await (await transcriber).dispose(); transcriber = undefined; }
    loadedModel = selected;
    transcriber ??= pipeline<"automatic-speech-recognition">("automatic-speech-recognition", voiceModels[selected].id, {
      revision: voiceModels[selected].revision, device: "wasm", dtype: "q8",
      progress_callback: progress => {
        if (progress.status === "progress") self.postMessage({id, kind: "progress", file: progress.file, loaded: progress.loaded, total: progress.total});
      },
    });
    const model = await transcriber;
    self.postMessage({id, kind: "transcribing"});
    const output = await model(audio, {language: whisperLanguages[language], task: "transcribe", chunk_length_s: 30, stride_length_s: 5});
    const result = Array.isArray(output) ? output[0] : output;
    const text = result.text.trim();
    self.postMessage({id, kind: text ? "complete" : "empty", text});
  } catch {
    transcriber = undefined;
    self.postMessage({id, kind: "error"});
  } finally { active = false; }
};
