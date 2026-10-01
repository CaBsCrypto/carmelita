/** Spoken language is selected independently from the interface language. */
export type SpeechLanguage = "es" | "en" | "pt";
export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return value === "es" || value === "en" || value === "pt";
}
export const whisperLanguages: Record<SpeechLanguage, string> = {es: "spanish", en: "english", pt: "portuguese"};
