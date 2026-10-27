import { activeLocale, loadLocale, rememberLocale } from "~/lib/i18n"
import { isLocale, type Locale } from "#shared/locale"

export function useLanguage() {
  const { $auth } = useNuxtApp()
  const session = useAuthSession()
  const demo = useDemoPerson()
  const pending = ref(false)
  const notify = useNotify()
  async function select(locale: Locale) {
    pending.value = true
    try {
      if (!demo.value && session.user.value) {
        const result = await $auth.updateUser({ language: locale })
        if (result.error) throw result.error
        await session.refresh()
      }
      await loadLocale(locale)
      rememberLocale(locale)
    } catch (error) { notify.error(error) }
    finally { pending.value = false }
  }
  watch(() => session.user.value?.language, async (language) => {
    if (!demo.value && isLocale(language)) await loadLocale(language)
  }, { immediate: true })
  return { locale: activeLocale, select, pending }
}
