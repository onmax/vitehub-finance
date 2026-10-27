import type { Insight } from "#shared/api"
import { formatMoney } from "#shared/money"
import { activeLocale, currentFormatLocale } from "../lib/i18n"

export function insightText(insight: Insight) {
  const data = insight.translation
  if (activeLocale.value === "en" || !data) return { title: insight.title, detail: insight.detail }
  const money = (minor: number, currency: string) => formatMoney(minor, currency, { locale: currentFormatLocale() })
  switch (data.kind) {
    case "price_increase": {
      const cadence = translate({ weekly: "aWeek", monthly: "aMonth", quarterly: "aQuarter", yearly: "aYear" }[data.cadence])
      return {
        title: translate("insightPriceTitle", { name: data.name, percent: formatCount(data.percent) }),
        detail: translate("insightPriceDetail", { latest: money(data.latest, data.currency), cadence, account: data.account, previous: money(data.previous, data.currency), savings: money(insight.savingsMinor, data.base) }),
      }
    }
    case "duplicate": return {
      title: translate(data.count === 2 ? "insightDuplicateTwice" : "insightDuplicateTitle", { name: data.name, count: formatCount(data.count) }),
      detail: translate("insightDuplicateDetail", { owners: new Intl.ListFormat(currentFormatLocale(), { type: "conjunction" }).format(data.owners), name: data.name, amounts: data.monthly.map((minor) => money(minor, data.currency)).join(" + "), savings: money(insight.savingsMinor, data.currency) }),
    }
    case "large_subscription": return {
      title: translate("insightLargeTitle", { name: data.name, amount: money(data.monthly, data.currency) }),
      detail: translate("insightLargeDetail", { amount: money(data.yearly, data.currency), account: data.account }),
    }
  }
}
