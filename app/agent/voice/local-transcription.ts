import {isSpeechLanguage, type SpeechLanguage} from "./speech-language";
import { sessionAbortable } from "../session-request";
import { MAX_VOICE_BYTES, MAX_VOICE_SECONDS } from "./draft-store";
import {isVoiceModel, type VoiceModel} from "./transcription-model";

export type VoiceProgress = {kind: "progress"; file: string; loaded: number; total: number} | {kind: "transcribing"};
export class LocalTranscriber {
  private worker?: Worker;
  private workerModel?: VoiceModel;
  private cancelPending?: () => void;
  // Version the message protocol so a cached Tiny-only worker cannot handle Base.
  constructor(private factory = () => new Worker("/voice/whisper-worker.js?v=2", {type: "module"})) {}
  async transcribe(audio: Float32Array, language: SpeechLanguage, signal: AbortSignal, progress: (event: VoiceProgress) => void, model: VoiceModel = "tiny"): Promise<string> {
    signal.throwIfAborted();
    if (!isSpeechLanguage(language)) throw new Error("voice_language_required");
    if (!isVoiceModel(model)) throw new Error("voice_model_required");
    if (this.cancelPending) throw new Error("voice_busy");
    if (this.worker && this.workerModel !== model) { this.worker.terminate(); this.worker = undefined; }
    this.worker ??= this.factory();
    this.workerModel = model;
    const worker = this.worker;
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, text?: string) => {
        signal.removeEventListener("abort", aborted);
        this.cancelPending = undefined;
        worker.onmessage = worker.onerror = null;
        if (error) { worker.terminate(); this.worker = undefined; reject(error); }
        else resolve(text!);
      };
      const aborted = () => finish(new DOMException("Canceled", "AbortError"));
      this.cancelPending = aborted;
      signal.addEventListener("abort", aborted, {once: true});
      worker.onerror = () => finish(new Error("voice_transcription_failed"));
      worker.onmessage = event => {
        const data = event.data;
        if (data?.id !== id || signal.aborted) return;
        if (data.kind === "complete" && typeof data.text === "string" && data.text.trim() && data.text.length <= 12000) finish(undefined, data.text.trim());
        else if (data.kind === "error" || data.kind === "empty" || data.kind === "complete") finish(new Error(data.kind === "empty" ? "voice_empty" : "voice_transcription_failed"));
        else if (data.kind === "transcribing") progress({kind: "transcribing"});
        else if (data.kind === "progress" && typeof data.file === "string" && Number.isFinite(data.loaded) && Number.isFinite(data.total)) progress({kind: "progress", file: data.file, loaded: Math.max(0, data.loaded), total: Math.max(0, data.total)});
      };
      try { worker.postMessage({id, audio, language, model}, [audio.buffer]); }
      catch { finish(new Error("voice_transcription_failed")); }
    });
  }
  dispose() { this.cancelPending?.(); this.worker?.terminate(); this.worker = undefined; }
}

export async function decodeVoice(blob: Blob, signal: AbortSignal): Promise<Float32Array> {
  if (!blob.size || blob.size > MAX_VOICE_BYTES) throw new Error("voice_size");
  const decoder = new AudioContext();
  try {
    const bytes = await sessionAbortable(() => blob.arrayBuffer(), signal);
    const audio = await sessionAbortable(() => decoder.decodeAudioData(bytes), signal);
    if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > MAX_VOICE_SECONDS + 1) throw new Error("voice_size");
    const offline = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
    const source = offline.createBufferSource(); source.buffer = audio;
    source.connect(offline.destination); source.start();
    const mono = await sessionAbortable(() => offline.startRendering(), signal);
    signal.throwIfAborted();
    return new Float32Array(mono.getChannelData(0));
  } finally { void decoder.close().catch(() => {}); }
}
