import type { Locale } from "../../shared/locale"

const loaders = {
  en: () => import("../../app/locales/en.json"), es: () => import("../../app/locales/es.json"),
  fr: () => import("../../app/locales/fr.json"), de: () => import("../../app/locales/de.json"), pt: () => import("../../app/locales/pt.json"),
}

/** Server-only copy has named interpolation, no HTML or plural branches. No Vue runtime is needed on the server. */
export async function translator(locale: Locale) {
  const messages: Record<string, string> = (await loaders[locale]()).default
  return (key: string, values: Record<string, string | number> = {}) => {
    const message = messages[key]
    if (message === undefined) throw new Error(`Missing ${locale} translation: ${key}`)
    return message.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? ""))
  }
}
