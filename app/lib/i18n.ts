import { createI18n } from "vue-i18n"
import { ref } from "vue"
import { FORMAT_LOCALES, isLocale, preferredLocale, type Locale } from "../../shared/locale"

// This app is a client-only SPA. Utilities and event handlers share its composer without a setup-context dependency.
export const i18n = createI18n({ legacy: false, locale: "en", fallbackLocale: false, messages: {} as Record<string, Record<string, string>> })
const loaders = {
  en: () => import("../locales/en.json"),
  es: () => import("../locales/es.json"),
  fr: () => import("../locales/fr.json"),
  de: () => import("../locales/de.json"),
  pt: () => import("../locales/pt.json"),
}
export const activeLocale = ref<Locale>("en")
export const localeStorageKey = "finance.language"
let pending = 0

export async function loadLocale(locale: Locale) {
  const request = ++pending
  if (!i18n.global.availableLocales.includes(locale)) {
    i18n.global.setLocaleMessage(locale, (await loaders[locale]()).default)
  }
  if (request !== pending) return
  i18n.global.locale.value = locale
  activeLocale.value = locale
}

export function browserLocale(): Locale {
  try {
    const stored = localStorage.getItem(localeStorageKey)
    if (isLocale(stored)) return stored
  } catch { /* Storage can be unavailable in a private browser. */ }
  return preferredLocale(navigator.languages)
}
export function rememberLocale(locale: Locale) {
  try { localStorage.setItem(localeStorageKey, locale) } catch { /* The current visit still uses this language. */ }
}
export const currentFormatLocale = () => FORMAT_LOCALES[activeLocale.value]
