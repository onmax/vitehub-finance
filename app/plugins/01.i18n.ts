import { activeLocale, browserLocale, i18n, loadLocale } from "../lib/i18n"

export default defineNuxtPlugin(async (nuxtApp) => {
  await loadLocale(browserLocale())
  nuxtApp.vueApp.use(i18n)
  useHead(() => ({ htmlAttrs: { lang: activeLocale.value } }))
})
