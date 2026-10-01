/** Trim only quiet edges; keep the original recording and all internal pauses. */
export function prepareTranscriptionAudio(audio: Float32Array): Float32Array {
  const frameSize = 320; // 20 ms at the decoded 16 kHz sample rate.
  const levels: number[] = [];
  for (let offset = 0; offset < audio.length; offset += frameSize) {
    const end = Math.min(offset + frameSize, audio.length);
    let power = 0;
    for (let i = offset; i < end; i++) {
      if (!Number.isFinite(audio[i])) throw new Error("voice_empty");
      power += audio[i] * audio[i];
    }
    levels.push(Math.sqrt(power / (end - offset)));
  }
  let first = -1, last = -1;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] >= 0.001) {if (first < 0) first = i; last = i;}
  }
  if (first < 0) throw new Error("voice_empty");
  const padding = 8000; // Preserve 500 ms on both sides of audible material.
  return audio.slice(Math.max(0, first * frameSize - padding), Math.min(audio.length, (last + 1) * frameSize + padding));
}
