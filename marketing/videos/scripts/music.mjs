/**
 * Carmelita — Conversación abierta.
 * Original, deterministic instrumental synthesis. No sampled recordings,
 * external music, voice, API calls, or package dependencies are used.
 * This composition and its synthesized WAV assets are dedicated to CC0 1.0.
 * Run: node scripts/music.mjs (requires ffmpeg and ffprobe on PATH).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'assets', 'audio');
const sampleRate = 48000;
const bpm = 90;
const beat = 60 / bpm;
const seconds = 60;
const frames = sampleRate * seconds;
const left = new Float32Array(frames);
const right = new Float32Array(frames);
const tau = Math.PI * 2;
const seed = 0x4341524d;
let randomState = seed;

function random() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 4294967296 * 2 - 1;
}

const hz = midi => 440 * 2 ** ((midi - 69) / 12);
const smooth = x => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

function sound(start, length, gain, pan, oscillator) {
  const first = Math.max(0, Math.round(start * sampleRate));
  const last = Math.min(frames, Math.round((start + length) * sampleRate));
  const l = Math.cos((pan + 1) * Math.PI / 4) * gain;
  const r = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let i = first; i < last; i++) {
    const localTime = i / sampleRate - start;
    const value = oscillator(localTime, length);
    left[i] += value * l;
    right[i] += value * r;
  }
}

// Dmaj9 / Bm9 / Gmaj9 / Asus4: original voicing and melodic arrangement.
const chords = [
  [50, 57, 61, 64, 66],
  [47, 54, 57, 61, 66],
  [43, 50, 54, 57, 62],
  [45, 52, 57, 59, 62],
];
const topLines = [
  [74, 76, 78, 81],
  [78, 76, 73, 69],
  [74, 78, 81, 78],
  [76, 74, 71, 73],
];

for (let section = 0; section * beat * 8 < seconds; section++) {
  const start = section * beat * 8;
  const chord = chords[section % chords.length];
  chord.forEach((note, index) => {
    const frequency = hz(note);
    sound(start, beat * 8 + 0.8, 0.034, (index - 2) * 0.27, (t, duration) => {
      const envelope = smooth(t / 0.6) * smooth((duration - t) / 1.1);
      const shimmer = 0.94 + 0.06 * Math.sin(tau * 0.13 * t + index);
      const tone = 0.65 * Math.sin(tau * frequency * t)
        + 0.23 * Math.sin(tau * frequency * 1.0015 * t + 0.4)
        + 0.09 * Math.sin(tau * frequency * 2 * t + 0.2)
        + 0.03 * Math.sin(tau * frequency * 3 * t);
      return tone * envelope * shimmer;
    });
  });
  // Sparse bass pulses support the text without competing with it.
  for (let pulse = 0; pulse < 4; pulse++) {
    const frequency = hz(chord[0] - 12);
    sound(start + pulse * beat * 2, 1.35, 0.077, 0, t => {
      const envelope = smooth(t / 0.018) * Math.exp(-t * 2.9);
      return (Math.sin(tau * frequency * t) + 0.12 * Math.sin(tau * frequency * 2 * t)) * envelope;
    });
  }
  const melody = topLines[section % topLines.length];
  melody.forEach((note, index) => {
    const frequency = hz(note);
    const place = start + (index * 2 + 0.5) * beat;
    const gain = start < 10 ? 0.05 : start < 42 ? 0.067 : 0.075;
    sound(place, 1.75, gain, index % 2 ? 0.2 : -0.2, t => {
      const envelope = smooth(t / 0.008) * Math.exp(-t * 3.2);
      return (0.82 * Math.sin(tau * frequency * t)
        + 0.14 * Math.sin(tau * frequency * 2 * t)
        + 0.04 * Math.sin(tau * frequency * 3 * t)) * envelope;
    });
    // A quiet second voice enters in the latter half of the 60-second cut.
    if (start >= 32 && index % 2 === 0) {
      const echoFrequency = frequency / 2;
      sound(place + beat * 0.75, 1.6, 0.026, -0.4, t =>
        Math.sin(tau * echoFrequency * t) * smooth(t / 0.018) * Math.exp(-t * 3));
    }
  });
}

for (let tick = 0; tick * beat < seconds; tick++) {
  const start = tick * beat;
  const energy = 0.45 + 0.55 * smooth(start / 12);
  if (tick % 2 === 0) {
    sound(start, 0.28, 0.075 * energy, 0, t => {
      const phase = tau * (48 * t + 2.4 * (1 - Math.exp(-t * 35)));
      return Math.sin(phase) * smooth(t / 0.003) * Math.exp(-t * 17);
    });
  } else {
    // Soft filtered noise: a synthesized brush, never a sampled clap.
    let lowPass = 0;
    sound(start, 0.13, 0.018 * energy, 0.06, t => {
      lowPass = lowPass * 0.77 + random() * 0.23;
      return lowPass * smooth(t / 0.005) * Math.exp(-t * 35);
    });
  }
  for (let half = 0; half < 2; half++) {
    let previous = 0;
    const accent = half === 0 ? 0.011 : 0.0075;
    sound(start + half * beat / 2, 0.055, accent * energy, half ? 0.36 : -0.36, t => {
      const current = random();
      const highPass = (current - previous) * 0.5;
      previous = current;
      return highPass * smooth(t / 0.002) * Math.exp(-t * 75);
    });
  }
}

// One quiet crossed delay adds space while retaining mono compatibility.
const delay = Math.round(0.122 * sampleRate);
for (let i = frames - 1; i >= delay; i--) {
  const l = left[i - delay];
  const r = right[i - delay];
  left[i] += r * 0.115;
  right[i] += l * 0.115;
}

function writePcmWave(file, duration) {
  const count = Math.round(duration * sampleRate);
  const pcm = Buffer.alloc(44 + count * 4);
  pcm.write('RIFF', 0);
  pcm.writeUInt32LE(pcm.length - 8, 4);
  pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(sampleRate, 24);
  pcm.writeUInt32LE(sampleRate * 4, 28);
  pcm.writeUInt16LE(4, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36);
  pcm.writeUInt32LE(count * 4, 40);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const fade = smooth(t / 0.5) * smooth((duration - t) / 2);
    pcm.writeInt16LE(Math.round(Math.tanh(left[i] * 1.2) * fade * 32767), 44 + i * 4);
    pcm.writeInt16LE(Math.round(Math.tanh(right[i] * 1.2) * fade * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, pcm);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message ?? result.stderr}`);
  }
  return result;
}

function measure(file) {
  const result = run('ffmpeg', ['-hide_banner', '-nostdin', '-i', file,
    '-af', 'loudnorm=I=-18:TP=-1:LRA=7:print_format=json', '-f', 'null', '-']);
  const json = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!json) throw new Error('Loudness measurement missing');
  return JSON.parse(json[0]);
}

fs.mkdirSync(output, { recursive: true });
const report = {
  composition: 'Carmelita — Conversación abierta',
  license: 'CC0-1.0',
  origin: 'Original procedural synthesis: pads, plucks, bass and percussion; no third-party samples.',
  seed,
  bpm,
  sampleRate,
  channels: 2,
  sampleFormat: 'PCM signed 16-bit little-endian',
  fades: { inSeconds: 0.5, outSeconds: 2 },
  normalization: { integratedLufs: -18, truePeakLimitDbtp: -1, lraTargetLu: 7 },
  ffmpegVersion: run('ffmpeg', ['-version']).stdout.split(/\r?\n/)[0],
  files: [],
};

for (const duration of [60, 15]) {
  const raw = path.join(output, `.brand-bed-${duration}s-raw.wav`);
  const file = path.join(output, `brand-bed-${duration}s.wav`);
  try {
    writePcmWave(raw, duration);
    const first = measure(raw);
    const filter = `loudnorm=I=-18:TP=-1:LRA=7:measured_I=${first.input_i}`
      + `:measured_TP=${first.input_tp}:measured_LRA=${first.input_lra}`
      + `:measured_thresh=${first.input_thresh}:offset=${first.target_offset}`
      + ':linear=true:print_format=json';
    run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-i', raw, '-af', filter,
      '-ar', String(sampleRate), '-ac', '2', '-c:a', 'pcm_s16le', '-map_metadata', '-1', file]);
    const final = measure(file);
    const metadata = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries',
      'stream=codec_name,sample_rate,channels:format=duration,size', '-of', 'json', file]).stdout);
    const lufs = Number(final.input_i);
    const truePeak = Number(final.input_tp);
    if (!Number.isFinite(lufs) || Math.abs(lufs + 18) > 2 || truePeak > -1) {
      throw new Error(`Audio acceptance failed for ${duration}s: ${lufs} LUFS / ${truePeak} dBTP`);
    }
    report.files.push({
      file: path.basename(file),
      durationSeconds: Number(metadata.format.duration),
      bytes: Number(metadata.format.size),
      codec: metadata.streams[0].codec_name,
      sampleRate: Number(metadata.streams[0].sample_rate),
      channels: metadata.streams[0].channels,
      integratedLufs: lufs,
      truePeakDbtp: truePeak,
      loudnessRangeLu: Number(final.input_lra),
      sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    });
  } finally {
    if (fs.existsSync(raw)) fs.unlinkSync(raw);
  }
}
fs.writeFileSync(path.join(output, 'music-probes.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
