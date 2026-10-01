export const MAX_VOICE_SECONDS = 120;
export const MAX_VOICE_BYTES = 3 * 1024 * 1024;
export const VOICE_RECOVERY_MS = 24 * 60 * 60 * 1000;
export type VoiceDraft = {
  owner: string; id: string; startedAt: number; mime: string; chunks: Blob[];
  completed: boolean; interrupted: boolean; transcript?: string;
};
export interface VoiceStore {
  read(owner: string): Promise<VoiceDraft | null>;
  begin(draft: VoiceDraft): Promise<void>;
  append(owner: string, id: string, chunk: Blob): Promise<void>;
  finish(owner: string, id: string, interrupted: boolean): Promise<void>;
  transcript(owner: string, id: string, text: string): Promise<void>;
  remove(owner: string, id: string): Promise<void>;
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open("carmelita-voice-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", {keyPath: "owner"});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("voice_storage_unavailable"));
    request.onblocked = () => reject(new Error("voice_storage_unavailable"));
  });
}

/** Local audio only. Authentication tokens and wallet data are never stored here. */
export function createVoiceStore(factory: IDBFactory, now = Date.now): VoiceStore {
  async function access<T>(owner: string, mutate: (draft: VoiceDraft | undefined, store: IDBObjectStore) => T): Promise<T> {
    const db = await open(factory);
    return new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      const request = store.get(owner);
      let value: T;
      request.onsuccess = () => {
        try { value = mutate(request.result as VoiceDraft | undefined, store); }
        catch { tx.abort(); }
      };
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onabort = tx.onerror = () => { db.close(); reject(new Error("voice_storage_unavailable")); };
    });
  }
  async function update(owner: string, id: string, mutate: (draft: VoiceDraft) => void) {
    await access(owner, (draft, store) => {
      if (!draft || draft.owner !== owner || draft.id !== id) return;
      mutate(draft); store.put(draft);
    });
  }
  return {
    read: owner => access(owner, (draft, store) => {
      if (!draft || draft.owner !== owner) return null;
      if (now() - draft.startedAt > VOICE_RECOVERY_MS) { store.delete(owner); return null; }
      return draft.chunks.length ? draft : null;
    }),
    begin: draft => access(draft.owner, (_, store) => { store.put(draft); }),
    append: (owner, id, chunk) => update(owner, id, draft => { draft.chunks.push(chunk); }),
    finish: (owner, id, interrupted) => update(owner, id, draft => { draft.completed = true; draft.interrupted = interrupted; }),
    transcript: (owner, id, text) => update(owner, id, draft => { draft.transcript = text; }),
    remove: (owner, id) => access(owner, (draft, store) => { if (draft?.id === id && draft.owner === owner) store.delete(owner); }),
  };
}

export function voiceBlob(draft: VoiceDraft): Blob { return new Blob(draft.chunks, {type: draft.mime}); }
export function appendVoiceText(draft: string, transcript: string): string | null {
  const result = [draft.trimEnd(), transcript.trim()].filter(Boolean).join("\n");
  return result.length <= 2000 ? result : null;
}
