import { MAX_VOICE_BYTES, MAX_VOICE_SECONDS, type VoiceDraft, type VoiceStore } from "./draft-store";
import { sessionAbortable } from "../session-request";

type Dependencies = {
  media: Pick<MediaDevices, "getUserMedia">;
  recorder: typeof MediaRecorder;
  store: VoiceStore;
  now?: () => number;
  id?: () => string;
};
export class VoiceRecorder {
  private capture?: MediaRecorder;
  private stream?: MediaStream;
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private writes = Promise.resolve();
  private stopped?: Promise<VoiceDraft>;
  private draft?: VoiceDraft;
  private interrupted = false;
  private storageFailed = false;
  constructor(private owner: string, private deps: Dependencies, private onStorageFailure: () => void) {}

  private save(operation: () => Promise<void>) {
    this.writes = this.writes.then(async () => {
      if (this.storageFailed) return;
      try { await sessionAbortable(operation, AbortSignal.timeout(4000)); }
      catch { this.storageFailed = true; if (!this.controller.signal.aborted) this.onStorageFailure(); }
    });
  }
  async start(onStopped: (draft: VoiceDraft) => void): Promise<void> {
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(15000)]);
    const pending = this.deps.media.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true}, video: false})
      .then(stream => { if (signal.aborted) stream.getTracks().forEach(track => track.stop()); return stream; });
    try {
      this.stream = await sessionAbortable(() => pending, signal);
      signal.throwIfAborted();
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(type => this.deps.recorder.isTypeSupported(type));
      this.capture = new this.deps.recorder(this.stream, {...(mime ? {mimeType: mime} : {}), audioBitsPerSecond: 64000});
      this.draft = {owner: this.owner, id: this.deps.id?.() ?? crypto.randomUUID(), startedAt: this.deps.now?.() ?? Date.now(), mime: this.capture.mimeType, chunks: [], completed: false, interrupted: false};
      const draft = this.draft;
      this.save(() => this.deps.store.begin({...draft, chunks: []}));
      this.capture.ondataavailable = event => {
        if (!event.data.size) return;
        draft.chunks.push(event.data);
        this.save(() => this.deps.store.append(this.owner, draft.id, event.data));
        if (draft.chunks.reduce((sum, chunk) => sum + chunk.size, 0) >= MAX_VOICE_BYTES) this.stop(true);
      };
      this.stopped = new Promise(resolve => {
        this.capture!.onstop = () => {
          clearTimeout(this.timer);
          this.stream?.getTracks().forEach(track => track.stop());
          draft.completed = true; draft.interrupted = this.interrupted;
          this.save(() => this.deps.store.finish(this.owner, draft.id, draft.interrupted));
          void sessionAbortable(() => this.writes, AbortSignal.timeout(8000)).catch(() => {
            if (!this.storageFailed) {
              this.storageFailed = true;
              if (!this.controller.signal.aborted) this.onStorageFailure();
            }
          }).then(() => { resolve(draft); if (!this.controller.signal.aborted) onStopped(draft); });
        };
      });
      this.capture.onerror = () => this.stop(true);
      this.capture.start(1000);
      this.timer = setTimeout(() => this.stop(true), MAX_VOICE_SECONDS * 1000);
    } catch (error) {
      this.controller.abort();
      this.stream?.getTracks().forEach(track => track.stop());
      throw error;
    }
  }
  stop(interrupted = false): Promise<VoiceDraft> | undefined {
    this.interrupted ||= interrupted;
    if (this.capture?.state === "recording" || this.capture?.state === "paused") this.capture.stop();
    return this.stopped;
  }
  /** Native permission requests cannot be canceled; a late stream is stopped on arrival. */
  dispose() {
    this.controller.abort(); this.stop(true);
    this.stream?.getTracks().forEach(track => track.stop());
    clearTimeout(this.timer);
  }
}
