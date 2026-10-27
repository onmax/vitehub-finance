import { afterEach, describe, expect, it, vi } from "vitest"
import { createI18n } from "vue-i18n"
import en from "../../app/locales/en.json"
import es from "../../app/locales/es.json"
import fr from "../../app/locales/fr.json"
import de from "../../app/locales/de.json"
import pt from "../../app/locales/pt.json"
import { activeLocale, currentFormatLocale, loadLocale } from "../../app/lib/i18n"
import { translate } from "../../app/utils/translate"
import { formatCount, formatDay, formatMonth, timeAgo } from "../../app/utils/format"
import { formatMoney } from "../../shared/money"
import { LOCALES, preferredLocale } from "../../shared/locale"
import { DEFAULT_CATEGORIES } from "../../shared/categories"
import { translator } from "../../server/utils/translate"
import { HTTPError } from "../../server/utils/http-error"
import { errorText, providerErrorText } from "../../app/utils/errors"

const catalogs = { en, es, fr, de, pt }
const parameters = (message: string) => [...new Set([...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort()
afterEach(() => vi.restoreAllMocks())

describe("locale catalogs", () => {
  for (const locale of LOCALES) {
    it(`${locale} has exactly the English keys and interpolation parameters`, () => {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(Object.keys(en).sort())
      for (const key of Object.keys(en) as Array<keyof typeof en>) {
        expect(catalogs[locale][key].trim(), key).not.toBe("")
        expect(parameters(catalogs[locale][key]), key).toEqual(parameters(en[key]))
      }
    })
    it(`${locale} compiles every message without errors`, () => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {})
      const warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
      const composer = createI18n({ legacy: false, locale, fallbackLocale: false, messages: { [locale]: catalogs[locale] } }).global
      for (const [key, message] of Object.entries(catalogs[locale])) {
        const values = Object.fromEntries(parameters(message).map((name) => [name, "example"]))
        expect(composer.t(key, values, 2), key).not.toBe("")
      }
      expect(errors.mock.calls).toEqual([])
      expect(warnings.mock.calls).toEqual([])
    })
  }
  it("renders reserved punctuation literally", async () => {
    await loadLocale("en")
    expect(translate("youExampleCom")).toBe("you@example.com")
    expect(translate("pipe")).toBe("Pipe (|)")
  })
  it("uses singular and plural account labels", async () => {
    for (const [locale, one, many] of [["en", "1 account", "2 accounts"], ["es", "1 cuenta", "2 cuentas"], ["fr", "1 compte", "2 comptes"], ["de", "1 Konto", "2 Konten"], ["pt", "1 conta", "2 contas"]] as const) {
      await loadLocale(locale)
      expect(translate("account2", { count: 1 }, 1)).toBe(one)
      expect(translate("account2", { count: 2 }, 2)).toBe(many)
    }
  })
  it("matches browser language variants and falls back to English", () => {
    expect(preferredLocale(["es-MX", "en"])).toBe("es")
    expect(preferredLocale(["ca", "fr-CA"])).toBe("fr")
    expect(preferredLocale(["pt-BR"])).toBe("pt")
    expect(preferredLocale(["ja", "zh-CN"])).toBe("en")
  })
})

describe("active-language formatting", () => {
  it("switches money, numbers, dates, months and relative time together", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-27T15:00:00Z").getTime())
    await loadLocale("en")
    expect(formatMoney(123456, "EUR", { locale: currentFormatLocale() })).toBe("€1,234.56")
    expect(formatCount(12345)).toBe("12,345")
    expect(formatDay("2026-10-27", { relative: false })).toContain("27 Oct")
    expect(formatMonth("2026-10")).toBe("October 2026")
    expect(timeAgo("2026-10-27T00:00:00Z")).toBe("15 hours ago")
    await loadLocale("es")
    expect(formatMoney(123456, "EUR", { locale: currentFormatLocale() })).toBe("1.234,56\u00a0€")
    expect(formatCount(12345)).toBe("12.345")
    expect(formatDay("2026-10-27", { relative: false })).toContain("27 de octubre")
    expect(formatMonth("2026-10")).toBe("octubre de 2026")
    expect(timeAgo("2026-10-27T00:00:00Z")).toBe("hace 15 horas")
    expect(activeLocale.value).toBe("es")
  })
})

describe("server copy", () => {
  it("keeps API diagnostics in English and translates stable codes in the browser", async () => {
    const error = new HTTPError({ status: 404, statusText: "No such account." })
    expect(error.statusText).toBe("No such account.")
    expect(error.data).toEqual({ code: "errorNoSuchAccount" })
    await loadLocale("es")
    expect(errorText({ data: { statusText: error.statusText, data: error.data } })).toBe(es.errorNoSuchAccount)
    expect(providerErrorText("Expired bank consent", "providerExpired")).toBe(es.providerExpired)
    await loadLocale("en")
    expect(errorText({ data: { statusText: error.statusText, data: error.data } })).toBe("No such account.")
  })
  it("has translated seed names without changing the English categories or keywords", async () => {
    const t = await translator("en")
    for (const category of DEFAULT_CATEGORIES) {
      const key = `category${category.name.replace(/[^a-zA-Z]/g, "")}`
      expect(t(key)).toBe(category.name)
      for (const locale of LOCALES) expect((await translator(locale))(key)).toBeTruthy()
    }
  })
  it("interpolates email links and names in each recipient language", async () => {
    for (const locale of LOCALES) {
      const t = await translator(locale)
      const link = "https://finance.example/invite/example?token=abc"
      expect(t("emailInviteBody", { name: "Lucía", url: link })).toContain(link)
      expect(t("emailInviteBody", { name: "Lucía", url: link })).toContain("Lucía")
      expect(t("emailMagicBody", { url: link })).toContain(link)
      expect(t("emailMagicSubject")).toBe(catalogs[locale].emailMagicSubject)
    }
  })
})
