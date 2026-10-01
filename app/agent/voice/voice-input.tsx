"use client";
import {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import type {Locale} from "../../language-toggle";
import {sessionAbortable} from "../session-request";
import {createVoiceStore, voiceBlob, type VoiceDraft, type VoiceStore} from "./draft-store";
import {VoiceRecorder} from "./recorder";
import {decodeVoice, LocalTranscriber} from "./local-transcription";
import {voiceCopy} from "./copy";
import {isSpeechLanguage, type SpeechLanguage} from "./speech-language";
import {isVoiceModel, type VoiceModel} from "./transcription-model";
import {prepareTranscriptionAudio} from "./prepare-audio";

type Stage = "idle" | "asking" | "recording" | "saving" | "ready" | "loading" | "transcribing";
const unavailable = async () => { throw new Error("voice_storage_unavailable"); };
const fallbackStore: VoiceStore = {read: async () => null, begin: unavailable, append: unavailable, finish: unavailable, transcript: unavailable, remove: async () => {}};

export default function VoiceInput({userId, locale, container, disabled, onInsert, onBusyChange}: {
  userId: string; locale: Locale; container: HTMLElement | null; disabled: boolean;
  onInsert: (text: string) => boolean; onBusyChange: (busy: boolean) => void;
}) {
  const t = voiceCopy[locale];
  const [supported, setSupported] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [stage, setStage] = useState<Stage>("idle");
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>();
  const [text, setText] = useState("");
  const [speechLanguage, setSpeechLanguage] = useState<SpeechLanguage | null>(null);
  const [textLanguage, setTextLanguage] = useState<SpeechLanguage | null>(null);
  const [model, setModel] = useState<VoiceModel>("base");
  const [textModel, setTextModel] = useState<VoiceModel | null>(null);
  const [transcriptValid, setTranscriptValid] = useState(false);
  const [error, setError] = useState<keyof typeof t | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [downloadedMb, setDownloadedMb] = useState(0);
  const lifetime = useRef(new AbortController());
  const store = useRef<VoiceStore>(fallbackStore);
  const recorder = useRef<VoiceRecorder | undefined>(undefined);
  const transcriber = useRef<LocalTranscriber | undefined>(undefined);
  const job = useRef<AbortController | undefined>(undefined);
  const busy = ["asking", "recording", "saving", "loading", "transcribing"].includes(stage);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);

  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    store.current = typeof indexedDB !== "undefined" ? createVoiceStore(indexedDB) : fallbackStore;
    void sessionAbortable(() => store.current.read(userId), AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]))
      .then(saved => {
        if (!saved || controller.signal.aborted) return;
        setDraft({...saved, interrupted: saved.interrupted || !saved.completed}); setText(saved.transcript ?? "");
        const language = isSpeechLanguage(saved.speechLanguage) ? saved.speechLanguage : null;
        setSpeechLanguage(language); setTextLanguage(language);
        const savedModel = isVoiceModel(saved.transcriptModel) ? saved.transcriptModel : null;
        setModel(savedModel ?? "base"); setTextModel(savedModel); setTranscriptValid(Boolean(language && savedModel && saved.transcript));
        setStage("ready"); setRecovered(true); setExpanded(true);
      }).catch(() => { if (!controller.signal.aborted) setStorageWarning(true); })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSupported(typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined" && typeof Worker !== "undefined" && typeof AudioContext !== "undefined" && typeof OfflineAudioContext !== "undefined");
          setRestoring(false);
        }
      });
    const interrupt = () => { void recorder.current?.stop(true); };
    const hidden = () => { if (document.visibilityState === "hidden") interrupt(); };
    window.addEventListener("pagehide", interrupt); document.addEventListener("visibilitychange", hidden);
    return () => {
      controller.abort(); recorder.current?.dispose(); transcriber.current?.dispose();
      window.removeEventListener("pagehide", interrupt); document.removeEventListener("visibilitychange", hidden);
    };
  }, [userId]);
  useEffect(() => {
    const url = draft ? URL.createObjectURL(voiceBlob(draft)) : undefined;
    let disposed = false;
    queueMicrotask(() => { if (!disposed) setAudioUrl(url); });
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  }, [draft]);
  useEffect(() => {
    if (stage !== "recording") return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [stage]);

  async function start() {
    if (!supported || restoring || disabled || busy || draft) return;
    setStage("asking"); setSeconds(0); setError(null); setExpanded(true); setInserted(false); setRecovered(false); setStorageWarning(false);
    const current = new VoiceRecorder(userId, {media: navigator.mediaDevices, recorder: MediaRecorder, store: store.current}, () => setStorageWarning(true));
    recorder.current = current;
    try {
      await current.start(saved => {
        if (lifetime.current.signal.aborted || recorder.current !== current) return;
        setDraft(saved); setStage("ready"); setText(""); setTextLanguage(null); setTextModel(null); setTranscriptValid(false); setExpanded(true);
      });
      if (!lifetime.current.signal.aborted && recorder.current === current) setStage("recording");
    } catch {
      if (lifetime.current.signal.aborted || recorder.current !== current) return;
      setStage("idle"); setError("denied");
    }
  }
  function stop() { setStage("saving"); void recorder.current?.stop(); }
  function cancel() {
    if (stage === "asking") { recorder.current?.dispose(); recorder.current = undefined; setStage("idle"); }
    else job.current?.abort();
  }
  async function transcribe() {
    if (!draft || busy || !supported || !speechLanguage) return;
    const controller = new AbortController(); job.current = controller;
    const signal = AbortSignal.any([lifetime.current.signal, controller.signal, AbortSignal.timeout(240000)]);
    setStage("loading"); setError(null); setDownloadedMb(0); setInserted(false); setTranscriptValid(false);
    const downloads = new Map<string, number>();
    try {
      // Preserve old text, but do not recover it as the result of this retry.
      try { await sessionAbortable(() => store.current.transcript(userId, draft.id, text), AbortSignal.any([signal, AbortSignal.timeout(4000)])); }
      catch { if (!lifetime.current.signal.aborted) setStorageWarning(true); }
      signal.throwIfAborted();
      const audio = prepareTranscriptionAudio(await decodeVoice(voiceBlob(draft), signal));
      transcriber.current ??= new LocalTranscriber();
      const result = await transcriber.current.transcribe(audio, speechLanguage, signal, progress => {
        if (signal.aborted) return;
        if (progress.kind === "transcribing") setStage("transcribing");
        else { downloads.set(progress.file, progress.loaded); setDownloadedMb([...downloads.values()].reduce((sum, bytes) => sum + bytes, 0) / 1000000); }
      }, model);
      signal.throwIfAborted(); setText(result); setTextLanguage(speechLanguage); setTextModel(model); setTranscriptValid(true); setStage("ready");
      try { await sessionAbortable(() => store.current.transcript(userId, draft.id, result, speechLanguage, model), AbortSignal.any([lifetime.current.signal, AbortSignal.timeout(4000)])); }
      catch { if (!lifetime.current.signal.aborted) setStorageWarning(true); }
    } catch (caught) {
      if (lifetime.current.signal.aborted) return;
      setStage("ready");
      if (controller.signal.aborted) return;
      setError(signal.aborted ? "slow" : caught instanceof Error && caught.message === "voice_empty" ? "empty" : caught instanceof Error && caught.message === "voice_size" ? "size" : "failed");
    }
  }
  async function discard() {
    if (busy || !draft) return;
    try { await sessionAbortable(() => store.current.remove(userId, draft.id), AbortSignal.any([lifetime.current.signal, AbortSignal.timeout(4000)])); }
    catch { if (!lifetime.current.signal.aborted) { setStorageWarning(true); return; } }
    if (lifetime.current.signal.aborted) return;
    transcriber.current?.dispose(); setDraft(null); setText(""); setTextLanguage(null); setTextModel(null); setTranscriptValid(false); setError(null); setStage("idle"); setExpanded(false);
  }
  function useText() {
    if (!text.trim() || busy || !speechLanguage || textLanguage !== speechLanguage || textModel !== model || !transcriptValid) return;
    if (!onInsert(text)) { setError("tooLong"); return; }
    setInserted(true); setError(null);
    if (draft) void sessionAbortable(() => store.current.transcript(userId, draft.id, text, speechLanguage, model), AbortSignal.timeout(4000)).catch(() => { if (!lifetime.current.signal.aborted) setStorageWarning(true); });
  }
  const label = stage === "recording" ? t.stop : stage === "asking" ? t.cancel : draft ? t.saved : t.record;
  return <>
    <button type="button" className="voice-microphone" aria-label={supported ? label : t.unsupported} title={supported ? label : t.unsupported}
      disabled={!supported || restoring || (disabled && !busy) || ["saving", "loading", "transcribing"].includes(stage)} aria-expanded={expanded}
      onClick={() => { if (stage === "recording") stop(); else if (stage === "asking") cancel(); else if (draft) setExpanded(value => !value); else void start(); }}>
      {stage === "recording" ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8" fill="none" stroke="currentColor" strokeWidth="2"/></svg>}
    </button>
    {container && expanded && createPortal(<section className="voice-panel" aria-label={t.microphone}>
      <label>{t.language}<select value={speechLanguage ?? ""} disabled={busy} onChange={event => {setSpeechLanguage(isSpeechLanguage(event.target.value) ? event.target.value : null); setInserted(false);}}>
        <option value="">{t.chooseLanguage}</option><option value="es">Español</option><option value="en">English</option><option value="pt">Português</option>
      </select></label><small>{t.languageNote}</small>
      <label>{t.model}<select value={model} disabled={busy} onChange={event => {if (isVoiceModel(event.target.value)) setModel(event.target.value); setInserted(false);}}>
        <option value="base">{t.baseModel}</option><option value="tiny">{t.tinyModel}</option>
      </select></label><small>{t.modelNote}</small>
      {stage === "asking" && <p role="status">{t.asking}</p>}
      {stage === "recording" && <p role="status">{t.recording} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} · {t.limit}</p>}
      {stage === "saving" && <p role="status">{t.saving}</p>}
      {draft && <><p>{recovered ? t.recovered : t.saved}{draft.interrupted ? ` · ${t.interrupted}` : ""}</p>
        {audioUrl && <audio controls src={audioUrl} aria-label={t.player} preload="metadata"/>}<small>{t.privacy}</small>
        {stage === "loading" && <p role="status">{t.downloading}… {downloadedMb.toFixed(1)} MB</p>}
        {stage === "transcribing" && <p role="status">{t.processing}</p>}
        <div className="voice-actions">
          {busy ? <button type="button" onClick={cancel}>{t.cancel}</button> : <button type="button" disabled={!supported || !speechLanguage} onClick={() => void transcribe()}>{error ? t.retry : t.transcribe}</button>}
          {audioUrl && <a href={audioUrl} download={`carmelita-voice.${draft.mime.includes("mp4") ? "m4a" : "webm"}`}>{t.download}</a>}
          <button type="button" disabled={busy} onClick={() => void discard()}>{t.discard}</button>
        </div>
        {text && <><label>{t.text}<textarea value={text} maxLength={12000} onChange={event => {setText(event.target.value); setInserted(false);}}/></label>
          <small>{t.review}</small>{textLanguage !== speechLanguage || !speechLanguage || textModel !== model || !transcriptValid ? <p role="status">{t.reTranscribe}</p> : null}<button type="button" disabled={busy || !text.trim() || inserted || !speechLanguage || textLanguage !== speechLanguage || textModel !== model || !transcriptValid} onClick={useText}>{t.use}</button></>}
        {inserted && <p role="status">{t.inserted}</p>}
      </>}
      {storageWarning && <p role="alert">{t.storage}</p>}{error && <p role="alert">{t[error]}</p>}
    </section>, container)}
  </>;
}
