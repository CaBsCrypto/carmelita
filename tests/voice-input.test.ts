import assert from "node:assert/strict";
import {test} from "node:test";
import {IDBFactory} from "fake-indexeddb";
import {appendVoiceText, createVoiceStore, voiceBlob, VOICE_RECOVERY_MS, MAX_VOICE_SECONDS, type VoiceDraft, type VoiceStore} from "../app/agent/voice/draft-store";
import {VoiceRecorder} from "../app/agent/voice/recorder";
import {LocalTranscriber} from "../app/agent/voice/local-transcription";
import {isSpeechLanguage, type SpeechLanguage} from "../app/agent/voice/speech-language";

const draft = (owner = "A", id = "first"): VoiceDraft => ({owner, id, startedAt: 1000, mime: "audio/webm", chunks: [], completed: false, interrupted: false});
test("local recovery retains chunks in order, interruption and editable transcript", async () => {
  const store = createVoiceStore(new IDBFactory(), () => 1000);
  await store.begin(draft()); await store.append("A", "first", new Blob(["one"])); await store.append("A", "first", new Blob(["two"]));
  await store.finish("A", "first", true); await store.transcript("A", "first", "Consulta SOL", "es");
  const saved = (await store.read("A"))!;
  assert.equal(await voiceBlob(saved).text(), "onetwo"); assert.equal(saved.completed, true); assert.equal(saved.interrupted, true); assert.equal(saved.transcript, "Consulta SOL");
  assert.equal(saved.speechLanguage, "es");
});
test("recovery is scoped to the owner, stale writers and deletes cannot replace a newer recording", async () => {
  const store = createVoiceStore(new IDBFactory(), () => 1000);
  await store.begin(draft()); await store.append("A", "first", new Blob(["private"])); assert.equal(await store.read("B"), null);
  await store.begin(draft("A", "second")); await store.append("A", "second", new Blob(["new"]));
  await store.transcript("A", "second", "new", "es");
  await store.append("A", "first", new Blob(["stale"])); await store.transcript("A", "first", "stale", "pt"); await store.remove("A", "first");
  assert.equal(await voiceBlob((await store.read("A"))!).text(), "new");
  assert.equal((await store.read("A"))!.speechLanguage, "es");
  await store.remove("A", "second"); assert.equal(await store.read("A"), null);
});
test("old recordings expire and empty recordings are not recovered", async () => {
  let now = 1000; const store = createVoiceStore(new IDBFactory(), () => now);
  await store.begin(draft()); assert.equal(await store.read("A"), null); await store.append("A", "first", new Blob(["old"]));
  now += VOICE_RECOVERY_MS + 1; assert.equal(await store.read("A"), null);
});
test("dictation preserves the existing draft and refuses overflow instead of truncating", () => {
  assert.equal(appendVoiceText("Mi borrador  ", " Consulta XLM "), "Mi borrador\nConsulta XLM");
  assert.equal(appendVoiceText("a".repeat(1999), "b"), null); assert.equal(appendVoiceText("", "SOL"), "SOL");
});

class FakeRecorder {
  static latest: FakeRecorder; static supported = "audio/webm;codecs=opus";
  static isTypeSupported(type: string) { return type === this.supported; }
  state = "inactive"; mimeType: string; ondataavailable?: (event: {data: Blob}) => void; onstop?: () => void; onerror?: () => void;
  constructor(_stream: unknown, options: {mimeType?: string}) { this.mimeType = options.mimeType ?? "audio/webm"; FakeRecorder.latest = this; }
  start() { this.state = "recording"; }
  chunk(text: string) { this.ondataavailable?.({data: new Blob([text])}); }
  stop() { this.state = "inactive"; this.chunk("final"); this.onstop?.(); }
}
function setup(store: VoiceStore = createVoiceStore(new IDBFactory(), () => 1000)) {
  let tracksStopped = 0, warnings = 0;
  const stream = {getTracks: () => [{stop: () => tracksStopped++}]} as unknown as MediaStream;
  const recorder = new VoiceRecorder("A", {media: {getUserMedia: async () => stream}, recorder: FakeRecorder as unknown as typeof MediaRecorder, store, id: () => "first", now: () => 1000}, () => warnings++);
  return {recorder, store, stream, stops: () => tracksStopped, warnings: () => warnings};
}
test("stop persists the final native chunk before reporting success and releases the microphone", async () => {
  const fixture = setup(); let completed = false;
  await fixture.recorder.start(() => {completed = true;}); FakeRecorder.latest.chunk("first");
  const result = (await fixture.recorder.stop())!;
  assert.equal(completed, true); assert.equal(await voiceBlob(result).text(), "firstfinal");
  assert.equal(await voiceBlob((await fixture.store.read("A"))!).text(), "firstfinal"); assert.ok(fixture.stops() > 0);
});
test("storage errors preserve in-memory audio and report recovery limitations", async () => {
  const failing = async () => { throw new Error("quota"); };
  const fixture = setup({read: async () => null, begin: failing, append: failing, finish: failing, transcript: failing, remove: failing});
  await fixture.recorder.start(() => {}); FakeRecorder.latest.chunk("keep");
  assert.equal(await voiceBlob((await fixture.recorder.stop())!).text(), "keepfinal"); assert.equal(fixture.warnings(), 1);
});
test("owner disposal saves interrupted audio without delivering a stale UI result", async () => {
  const fixture = setup(); let callbacks = 0;
  await fixture.recorder.start(() => callbacks++); FakeRecorder.latest.chunk("old-owner"); fixture.recorder.dispose();
  const result = (await fixture.recorder.stop())!;
  assert.equal(callbacks, 0); assert.equal(result.interrupted, true); assert.equal(await voiceBlob((await fixture.store.read("A"))!).text(), "old-ownerfinal");
});
test("a late microphone permission after cancel immediately releases its tracks", async () => {
  let provide!: (stream: MediaStream) => void, stops = 0;
  const recorder = new VoiceRecorder("A", {media: {getUserMedia: () => new Promise(resolve => {provide = resolve;})}, recorder: FakeRecorder as unknown as typeof MediaRecorder, store: createVoiceStore(new IDBFactory())}, () => {});
  const started = recorder.start(() => assert.fail("canceled session must not complete")); recorder.dispose();
  await assert.rejects(started, {name: "AbortError"}); provide({getTracks: () => [{stop: () => stops++}]} as unknown as MediaStream);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(stops, 1);
});
test("Safari-compatible MP4 is chosen when WebM is unsupported", async () => {
  FakeRecorder.supported = "audio/mp4";
  try {const fixture = setup(); await fixture.recorder.start(() => {}); assert.equal((await fixture.recorder.stop())!.mime, "audio/mp4");}
  finally { FakeRecorder.supported = "audio/webm;codecs=opus"; }
});

class FakeWorker {
  onmessage: ((event: {data: unknown}) => void) | null = null; onerror: (() => void) | null = null;
  payload?: {id: string; language: string}; terminated = false;
  postMessage(value: {id: string; language: string}) {this.payload = value;}
  terminate() {this.terminated = true;}
  reply(data: object) {this.onmessage?.({data: {id: this.payload!.id, ...data}});}
}
test("local transcription ignores stale replies, sends explicit spoken language and reuses a warm worker", async () => {
  const worker = new FakeWorker(); let created = 0;
  const transcriber = new LocalTranscriber(() => {created++; return worker as unknown as Worker;});
  const first = transcriber.transcribe(new Float32Array([1]), "es", new AbortController().signal, () => {});
  worker.reply({id: "wrong", kind: "complete", text: "wrong owner"}); worker.reply({kind: "complete", text: " Consulta SOL "});
  assert.equal(await first, "Consulta SOL"); assert.equal(worker.payload!.language, "es"); assert.equal("locale" in worker.payload!, false);
  const second = transcriber.transcribe(new Float32Array([1]), "pt", new AbortController().signal, () => {}); worker.reply({kind: "complete", text: "BNB"});
  assert.equal(await second, "BNB"); assert.equal(created, 1); transcriber.dispose(); assert.equal(worker.terminated, true);
});
test("missing or unsupported spoken language cannot silently fall back to a UI language", async () => {
  let workers = 0;
  const transcriber = new LocalTranscriber(() => {workers++; return new FakeWorker() as unknown as Worker;});
  for (const value of [undefined, null, "", "fr", "Português"]) {
    assert.equal(isSpeechLanguage(value), false);
    await assert.rejects(transcriber.transcribe(new Float32Array([1]), value as SpeechLanguage, new AbortController().signal, () => {}), /voice_language_required/);
  }
  assert.equal(workers, 0);
});
test("legacy recordings without spoken-language metadata remain recoverable", async () => {
  const store = createVoiceStore(new IDBFactory(), () => 1000);
  await store.begin({...draft(), chunks: [new Blob(["original"])], transcript: "old text"});
  const saved = (await store.read("A"))!;
  assert.equal(saved.speechLanguage, undefined); assert.equal(saved.transcript, "old text"); assert.equal(await voiceBlob(saved).text(), "original");
});
test("cancellation terminates inference, rejects concurrency and permits a fresh retry", async () => {
  const workers: FakeWorker[] = []; const transcriber = new LocalTranscriber(() => {const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker;});
  const controller = new AbortController(); const pending = transcriber.transcribe(new Float32Array([1]), "en", controller.signal, () => {});
  await assert.rejects(transcriber.transcribe(new Float32Array([1]), "en", controller.signal, () => {}), /voice_busy/);
  controller.abort(); await assert.rejects(pending, {name: "AbortError"}); assert.equal(workers[0].terminated, true);
  const retry = transcriber.transcribe(new Float32Array([1]), "en", new AbortController().signal, () => {}); workers[1].reply({kind: "complete", text: "Retry"}); assert.equal(await retry, "Retry"); transcriber.dispose();
});
test("empty and failed inference never produce a message", async () => {
  for (const kind of ["empty", "error"]) {
    const worker = new FakeWorker(); const transcriber = new LocalTranscriber(() => worker as unknown as Worker);
    const pending = transcriber.transcribe(new Float32Array([1]), "es", new AbortController().signal, () => {}); worker.reply({kind}); await assert.rejects(pending); assert.equal(worker.terminated, true);
  }
});
test("recordings stop at the time limit and preserve their final chunk", async context => {
  context.mock.timers.enable({apis: ["setTimeout"]}); const fixture = setup();
  await fixture.recorder.start(() => {}); context.mock.timers.tick(MAX_VOICE_SECONDS * 1000);
  const saved = (await fixture.recorder.stop())!; assert.equal(saved.interrupted, true); assert.equal(await voiceBlob(saved).text(), "final");
});
