export type VoiceModel = "base" | "tiny";
export function isVoiceModel(value: unknown): value is VoiceModel { return value === "base" || value === "tiny"; }
/** Public multilingual weights pinned independently of the UI and recording. */
export const voiceModels = {
  base: {id: "onnx-community/whisper-base", revision: "1846881b6b3a3024392c1eea3ad983695bc23925"},
  tiny: {id: "onnx-community/whisper-tiny", revision: "ff4177021cc41f7db950912b73ea4fdf7d01d8e7"},
} as const;
