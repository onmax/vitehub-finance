export const LOCALES = ["en", "es", "fr", "de", "pt"] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English", es: "Español", fr: "Français", de: "Deutsch", pt: "Português",
}
export const FORMAT_LOCALES: Record<Locale, string> = {
  en: "en-IE", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-PT",
}
export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es" || value === "fr" || value === "de" || value === "pt"
}
export function preferredLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0]
    if (isLocale(base)) return base
  }
  return "en"
}
