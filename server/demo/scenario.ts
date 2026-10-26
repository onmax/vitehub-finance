// The demo household as plain data: Lucía and Pablo in Madrid, 13 months of bank statements up to `today`. Pure and
// deterministic (a PRNG seeded with the date), so vitest checks the story without a database; server/demo/seed.ts
// writes what this returns. Fictional people, companies, IBANs, and addresses throughout.
import { addDays, addMonths, daysInMonth, monthOf } from "../utils/dates"

export type DemoPerson = "lucia" | "pablo"

export const DEMO_PEOPLE: Record<DemoPerson, { name: string; email: string }> = {
  lucia: { name: "Lucía Martín", email: "lucia@demo.vitehub.dev" },
  pablo: { name: "Pablo García", email: "pablo@demo.vitehub.dev" },
}

export const DEMO_HOUSEHOLD = "Lucía & Pablo"

export interface DemoConnection {
  key: string
  owner: DemoPerson
  provider: "enable_banking" | "bitcoin"
  name: string
  institution: string
  country: string | null
  externalId: string
  /** Days from today until the bank consent ends; null for wallets. */
  consentDays: number | null
}

export interface DemoAccount {
  key: string
  owner: DemoPerson
  connection: string | null
  externalId: string | null
  name: string
  institution: string
  kind: "checking" | "savings" | "credit" | "investment" | "crypto"
  iban: string | null
  visibility: "household" | "private"
  householdPermission: "view" | "edit"
  balanceMinor: number
}

export interface DemoTransaction {
  account: string
  date: string
  amountMinor: number
  description: string
  counterparty: string | null
  /** A default category's name (shared/categories.ts), or null for uncategorized. */
  category: string | null
  /** Picked by hand: a rule would have chosen another category, or none. */
  locked?: boolean
  note?: string
  /** Only the account's owner sees it. */
  hidden?: boolean
}

export interface DemoGoal {
  name: string
  icon: string
  targetMinor: number
  savedMinor: number
  targetDate: string | null
  /** An account key: progress is its balance. */
  account?: string
  /** Set: a personal goal only its owner sees. */
  owner?: DemoPerson
}

export interface DemoScenario {
  today: string
  start: string
  connections: DemoConnection[]
  accounts: DemoAccount[]
  holdings: Array<{ account: string; symbol: string; name: string; quantity: number; priceMinor: number; valueMinor: number }>
  /** Daily balances for accounts without transactions (the index fund and the wallet). */
  snapshots: Array<{ account: string; date: string; balanceMinor: number }>
  transactions: DemoTransaction[]
  budgets: Array<{ category: string; amountMinor: number }>
  goals: DemoGoal[]
  /** Recurring series (merchant keys, server/utils/recurring-core.ts `seriesKey`) the couple confirmed. */
  confirmed: string[]
}

export const DEMO_BUDGETS = [
  { category: "Groceries", amountMinor: 60_000 },
  { category: "Eating out", amountMinor: 25_000 },
  { category: "Transport", amountMinor: 12_000 },
  { category: "Subscriptions", amountMinor: 6_000 },
  { category: "Shopping", amountMinor: 20_000 },
]

/** FNV-1a, then mulberry32: the same date always gives the same household. */
export function seededRandom(seed: string) {
  let hash = 2166136261
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  let state = hash >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()
const pad = (value: number) => String(value).padStart(2, "0")

/** Card masks as Spanish banks print them. */
const ING_CARD = "5402XXXXXXXX1234"
const INDEX_FUND_MONTHLY = 30_000
const BTC_MONTHLY = 20_000
const BBVA_DEBIT = "4940XXXXXXXX8812"
const BBVA_CREDIT = "4599XXXXXXXX3307"

export function demoScenario(today: string): DemoScenario {
  const random = seededRandom(`vitehub-finance-demo:${today}`)
  const between = (min: number, max: number) => min + random() * (max - min)
  const chance = (probability: number) => random() < probability
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!
  const euros = (min: number, max: number) => Math.round(between(min, max) * 100) / 100
  /** Shop prices: 19.95, 29.99. */
  const shelf = (min: number, max: number) => Math.floor(between(min, max)) + pick([0.95, 0.99, 0.9, 0.5])

  // 13 months and a few days: yearly charges from just over a year ago still show, so they read as yearly.
  const start = addDays(addMonths(today, -13), -5)
  const month = monthOf(today)
  const months: string[] = []
  for (let cursor = monthOf(start); cursor <= month; cursor = addMonths(`${cursor}-01`, 1).slice(0, 7)) months.push(cursor)
  const on = (month: string, day: number) => `${month}-${pad(Math.min(day, daysInMonth(month)))}`
  const days: string[] = []
  for (let date = start; date < today; date = addDays(date, 1)) days.push(date)

  const transactions: Array<DemoTransaction & { variable?: boolean }> = []
  const add = (
    account: string,
    date: string,
    amount: number,
    description: string,
    counterparty: string | null,
    category: string | null,
    extra: { locked?: boolean; note?: string; hidden?: boolean; variable?: boolean } = {},
  ) => {
    if (date < start || date > today) return
    transactions.push({ account, date, amountMinor: Math.round(amount * 100), description, counterparty, category, ...extra })
  }
  const card = (mask: string, merchant: string) => `COMPRA TARJ. ${mask} ${merchant}`

  // ── Fixed monthly flows ────────────────────────────────────────────────────────────────────────────────────────
  for (const m of months) {
    const monthNumber = Number(m.slice(5))

    // Lucía's salary on the 28th, the Friday before when that's a weekend; she moves money out the same day.
    let payday = on(m, 28)
    if (weekday(payday) === 6) payday = addDays(payday, -1)
    if (weekday(payday) === 0) payday = addDays(payday, -2)
    // A small raise in January.
    const raise = m >= `${today.slice(0, 4)}-01` ? 40 : 0
    add("bbva", payday, 2450 + raise + euros(-6, 6), "NOMINA ESTUDIO NORTE DISENO SL", "Estudio Norte Diseño", "Salary")
    add("bbva", payday, -900, "TRANSFERENCIA A CUENTA COMUN", "ING Cuenta común", "Transfers")
    add("common", payday, 900, "TRANSFERENCIA DE LUCIA MARTIN", "Lucía Martín", "Transfers")
    add("bbva", addDays(payday, 1), -400, "TRASPASO A CUENTA PROPIA", null, "Transfers")
    add("savings-lucia", addDays(payday, 1), 400, "TRASPASO DESDE CUENTA NOMINA", null, "Transfers")
    add("bbva", on(m, 2), -INDEX_FUND_MONTHLY / 100, "TRANSFERENCIA A MYINVESTOR VALORES", "MyInvestor", "Transfers")

    // Pablo's salary on the 1st into Revolut, then his half of the shared account and his own savings.
    add("revolut", on(m, 1), 1950 + euros(-4, 4), "NOMINA CONSEJERIA DE EDUCACION", "Comunidad de Madrid", "Salary")
    add("revolut", on(m, 1), -900, "Transfer to Cuenta común", "Lucía Martín y Pablo García", "Transfers")
    add("common", on(m, 2), 900, "TRANSFERENCIA DE PABLO GARCIA", "Pablo García", "Transfers")
    add("revolut", on(m, 3), -450, "Transfer to own account", "Pablo García", "Transfers")
    add("vault", on(m, 3), 450, "Top-up from EUR account", null, "Transfers")

    // The shared account pays the house.
    add("common", on(m, 5), -1150, "RECIBO PRESTAMO HIPOTECARIO", "Préstamo hipotecario", "Housing")
    const season = [0, 98, 91, 74, 58, 52, 63, 89, 96, 71, 57, 68, 90][monthNumber]!
    add("common", on(m, 9), -(season + euros(-5, 5)), "RECIBO IBERDROLA CLIENTES SAU", "Iberdrola Clientes", "Utilities")
    add("common", on(m, 12), -45, "RECIBO VODAFONE ESPANA SAU", "Vodafone España", "Utilities")
    add("common", on(m, 20), -100, "TRASPASO A CUENTA NARANJA", null, "Transfers")
    add("fund", on(m, 20), 100, "TRASPASO DESDE CUENTA COMUN", null, "Transfers")
    add("fund", on(m, 28), euros(12.5, 14.5), "ABONO DE INTERESES", null, "Other income")
    add("savings-lucia", on(m, 30), euros(3.1, 4.4), "ABONO INTERESES CUENTA AHORRO", null, "Other income")
    add("vault", on(m, 28), euros(4.2, 5.6), "Savings interest", null, "Other income")

    // Netflix: the couple calls streaming Entertainment, so it's picked by hand over the Subscriptions rule.
    add("common", on(m, 15), -12.99, card(ING_CARD, "NETFLIX.COM"), "Netflix", "Entertainment", { locked: true })

    // Lucía's own fixed charges.
    add("bbva", on(m, 1), -29.99, "RECIBO BASIC-FIT SPAIN SAU", "Basic-Fit", "Fitness")
    add("bbva", on(m, 2), -32.7, "RECARGA ABONO TRANSPORTE CRTM", "Metro de Madrid", "Transport")
    add("bbva", on(m, 3), -2.99, card(BBVA_DEBIT, "APPLE.COM/BILL"), "Apple.com", "Subscriptions")
    add("bbva", on(m, 7), -11.99, card(BBVA_DEBIT, "SPOTIFY STOCKHOLM"), "Spotify", "Subscriptions")
    add("bbva", on(m, 16), -23, card(BBVA_DEBIT, "OPENAI *CHATGPT SUBSCR"), "OpenAI", "Subscriptions")

    // Pablo's.
    add("revolut", on(m, 11), -11.99, "Spotify", "Spotify", "Subscriptions")
    add("revolut", on(m, 14), -15, "DIGI Spain Telecom", "Digi", "Utilities")
    add("revolut", on(m, 6), -85, "Goethe-Institut Madrid", "Goethe-Institut", "Education")
    // Bitcoin bought every month and withdrawn to his own wallet.
    add("revolut", on(m, 10), -BTC_MONTHLY / 100, "Bit2Me Global SL", "Bit2Me", "Transfers")

    // Lucía illustrates on the side: a publisher pays her invoice around the 10th, more some months than others and
    // nothing in August, and she pays the quarter's income tax (modelo 130) on the 20th of January, April, July, and
    // October. The forecast is less sure of either than of the salaries.
    if (monthNumber !== 8)
      add("bbva", addDays(on(m, 10), pick([-2, -1, 0, 0, 1, 2, 3])), euros(560, 760), "TRANSFERENCIA DE EDITORIAL LUMBRE SL", "Editorial Lumbre", "Other income")
    if (monthNumber % 3 === 1) add("bbva", on(m, 20), -euros(340, 410), "AEAT MODELO 130 PAGO FRACCIONADO", "Agencia Tributaria", "Fees")
  }

  // Netflix went from 12.99 to 15.99 three charges ago (server/utils/recurring-core.ts `priceChange`).
  const netflix = transactions.filter((row) => row.counterparty === "Netflix")
  for (const row of netflix.slice(-3)) row.amountMinor = -1599

  // ── Yearly charges, anchored to today so two of each fall in the window ───────────────────────────────────────
  const ibi = addDays(today, -18)
  add("common", addMonths(ibi, -12), -471.8, "RECIBO IBI AYUNTAMIENTO DE MADRID", "Ayuntamiento de Madrid", "Housing")
  add("common", ibi, -486.32, "RECIBO IBI AYUNTAMIENTO DE MADRID", "Ayuntamiento de Madrid", "Housing")
  add("common", addDays(today, -150), -318.4, "RECIBO MAPFRE ESPANA SEGURO HOGAR", "Mapfre España", "Housing")
  // Always last month or earlier, so the yearly charge never lands in this month's Subscriptions budget.
  const prime = addDays(today, -33)
  add("revolut", addMonths(prime, -12), -49.9, "Amazon Prime*2K4TR83", "Amazon Prime", "Subscriptions")
  add("revolut", prime, -49.9, "Amazon Prime*7Q1MZ09", "Amazon Prime", "Subscriptions")

  // ── Everyday spending ────────────────────────────────────────────────────────────────────────────────────────
  const lunch = [
    ["BAR CASA PACO", "Bar Casa Paco"],
    ["RESTAURANTE LA MUSA", "La Musa"],
    ["CAFE COMERCIAL", "Café Comercial"],
    ["TABERNA LA CARMENCITA", "La Carmencita"],
    ["UDON MALASANA", "Udon"],
    ["LA MALLORQUINA", "La Mallorquina"],
  ] as const
  const dinner = [
    ["TABERNA LA CONCHA", "La Concha"],
    ["RESTAURANTE SALVAJE", "Salvaje"],
    ["SUSHI BAR KABUKI", "Kabuki"],
    ["BAR EL BRILLANTE", "El Brillante"],
    ["PIZZERIA BARACCA", "Baracca"],
    ["RESTAURANTE TRIGO", "Trigo"],
  ] as const
  const clothes = [
    ["ZARA GRAN VIA", "Zara"],
    ["ZARA PRINCESA", "Zara"],
    ["UNIQLO PRECIADOS", "Uniqlo"],
    ["MANGO SERRANO", "Mango"],
  ] as const

  for (const date of days) {
    const day = weekday(date)
    const workday = day >= 1 && day <= 5

    // Groceries from the shared account: the big Saturday shop, a top-up midweek.
    if (day === 6) {
      const store = pick(["MERCADONA MADRID", "MERCADONA MADRID", "MERCADONA AV. ALBUFERA", "MERCADONA MADRID", "CARREFOUR MARKET", "LIDL ALCALA"])
      const name = store.startsWith("MERCADONA") ? "Mercadona" : store.startsWith("CARREFOUR") ? "Carrefour" : "Lidl"
      add("common", date, -euros(62, 142), card(ING_CARD, store), name, "Groceries", { variable: true })
    }
    if (day === 3 && chance(0.7))
      add("common", date, -euros(14, 46), card(ING_CARD, pick(["LIDL ALCALA", "SUPERMERCADOS DIA", "MERCADONA MADRID"])), null, "Groceries", { variable: true })

    // Lucía's lunches on workdays, dinners out together at weekends on her credit card.
    if (workday && chance(0.32)) {
      const [merchant, name] = pick(lunch)
      add("bbva", date, -euros(9.5, 17.5), card(BBVA_DEBIT, `${merchant} MADRID`), name, "Eating out", { variable: true })
    }
    if ((day === 5 || day === 6) && chance(0.36)) {
      const [merchant, name] = pick(dinner)
      add("card", date, -euros(36, 84), card(BBVA_CREDIT, `${merchant} MADRID`), name, "Eating out", { variable: true })
    }
    if (day === 0 && chance(0.18)) add("revolut", date, -euros(14, 29), "Glovo", "Glovo", "Eating out", { variable: true })
    if (workday && chance(0.12)) add("revolut", date, -euros(5.5, 16), pick(["Bar La Esquina", "Cervecería Santa Ana", "Café Pepe Botella"]), null, "Eating out", { variable: true })

    // Getting around.
    if (chance(0.09)) add("bbva", date, -euros(7.4, 18.9), card(BBVA_DEBIT, "CABIFY ESPANA SL"), "Cabify", "Transport", { variable: true })
    if (chance(0.08)) add("revolut", date, -euros(6.2, 19.5), "Renfe Viajeros", "Renfe", "Transport", { variable: true })

    // Shopping, health, odds and ends.
    if (chance(0.055)) {
      const [merchant, name] = pick(clothes)
      add("bbva", date, -shelf(15, 60), card(BBVA_DEBIT, merchant), name, "Shopping", { variable: true })
    }
    if (chance(0.05)) add("revolut", date, -euros(9, 48), "Amazon.es", "Amazon", "Shopping", { variable: true })
    if (chance(0.02)) add("card", date, -shelf(12, 70), card(BBVA_CREDIT, "DECATHLON MADRID"), "Decathlon", "Shopping", { variable: true })
    if (chance(0.04)) add("revolut", date, -pick([4.99, 9.99, 14.99, 19.99, 29.99, 59.99]), "Steam Purchase", "Steam", "Entertainment")
    if (day === 6 && chance(0.15)) add("revolut", date, -euros(15, 22), "Yelmo Cines", "Yelmo", "Entertainment")
    if (chance(0.03)) add("bbva", date, -euros(4.5, 24), card(BBVA_DEBIT, "FARMACIA LDO. GOMEZ"), "Farmacia Gómez", "Health")
    if (day === 2 && chance(0.5)) add("revolut", date, -euros(6, 12), "Playtomic", "Playtomic", "Fitness")
    // Splitting a dinner over Bizum: nobody categorizes these.
    if (chance(0.05)) {
      const amount = euros(9, 32)
      add("revolut", date, -amount, "Bizum to LUCIA MARTIN", "Lucía Martín", null)
      add("bbva", date, amount, "BIZUM DE PABLO GARCIA", "Pablo García", null)
    }
    if (chance(0.02)) add("bbva", date, -euros(18, 35), card(BBVA_DEBIT, "PELUQUERIA MARIBEL"), null, null)
    if (chance(0.03)) add("revolut", date, -euros(12, 32), "Casa del Libro", "Casa del Libro", "Shopping", { variable: true })
    if (chance(0.015)) add("bbva", date, -euros(8, 45), card(BBVA_DEBIT, "PAYPAL *VINTED"), null, null)
  }

  // ── Story beats ──────────────────────────────────────────────────────────────────────────────────────────────
  // A summer trip to Sicily: flights booked in spring, the flat in June, the rest there in August.
  const tripYear = today.slice(5) >= "08-20" ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1
  const trip = (monthDay: string) => `${tripYear}-${monthDay}`
  add("card", trip("05-12"), -268.4, card(BBVA_CREDIT, "RYANAIR DAC"), "Ryanair", "Travel")
  add("card", trip("06-02"), -1045, card(BBVA_CREDIT, "AIRBNB * HMK3TQ8"), "Airbnb", "Travel")
  add("revolut", trip("06-03"), -522.5, "Bizum to LUCIA MARTIN", "Lucía Martín", "Travel", { locked: true, note: "Half the flat in Sicily" })
  add("bbva", trip("06-03"), 522.5, "BIZUM DE PABLO GARCIA", "Pablo García", "Travel", { locked: true, note: "Pablo's half of the Airbnb" })
  add("card", trip("08-04"), -312.6, card(BBVA_CREDIT, "HERTZ ITALIA PALERMO"), "Hertz", "Travel")
  const sicily = ["TRATTORIA DA NINO PALERMO", "ANTICA FOCACCERIA SAN FRANCESCO", "OSTERIA DEL MERCATO CATANIA", "GELATERIA CAPPADONIA", "RISTORANTE LA CAMBUSA CEFALU"]
  for (let index = 0; index < 9; index++) {
    const date = addDays(trip("08-04"), index)
    add("card", date, -euros(24, 78), card(BBVA_CREDIT, sicily[index % sicily.length]!), null, "Eating out")
    if (index % 3 === 1) add("revolut", date, -euros(18, 52), "Esselunga Palermo", "Esselunga", "Travel")
  }
  add("card", addDays(trip("08-04"), 4), -36, card(BBVA_CREDIT, "PARCO ARCHEOLOGICO VALLE DEI TEMPLI"), null, "Travel")
  add("vault", trip("07-28"), -900, "Transfer to EUR account", "Pablo García", "Transfers")
  add("revolut", trip("07-28"), 900, "Transfer from own account", "Pablo García", "Transfers")

  // Christmas presents in December, picked as Gifts by hand: the rules call these shops Shopping.
  const xmasYear = today.slice(5) >= "12-24" ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1
  const xmas = (day: number) => `${xmasYear}-12-${pad(day)}`
  add("card", xmas(6), -186.5, card(BBVA_CREDIT, "EL CORTE INGLES PRECIADOS"), "El Corte Inglés", "Gifts", { locked: true })
  add("card", xmas(11), -79.9, card(BBVA_CREDIT, "FNAC CALLAO"), "Fnac", "Gifts", { locked: true })
  add("bbva", xmas(14), -42.5, card(BBVA_DEBIT, "CASA DEL LIBRO GRAN VIA"), "Casa del Libro", "Gifts", { locked: true })
  add("revolut", xmas(9), -64.99, "Amazon.es", "Amazon", "Gifts", { locked: true, note: "Lego for the nephews" })
  add("revolut", xmas(17), -89.99, "LEGO Store Madrid", "LEGO", "Gifts", { locked: true })
  add("common", xmas(22), -118.4, card(ING_CARD, "MERCADONA MADRID"), "Mercadona", "Groceries", { note: "Nochebuena" })

  // Pablo's present for Lucía, on his shared Revolut but hidden from her: he sees it with a lock, she never does.
  add("revolut", addDays(today, -6), -145, "Joyeria Grassy Madrid", "Grassy", "Gifts", { locked: true, hidden: true, note: "Lucía's birthday" })

  // ── This month's budgets: eating out over its limit, shopping close to it, the rest comfortably under ─────────
  const budget = (name: string) => DEMO_BUDGETS.find((entry) => entry.category === name)!.amountMinor
  /** Rescales this month's variable rows of a category so its spending lands between `min` and `max` of the budget. */
  const fit = (category: string, min: number, max: number, options: { raise?: () => void } = {}) => {
    const rows = () => transactions.filter((row) => row.category === category && row.amountMinor < 0 && monthOf(row.date) === month)
    if (options.raise && !rows().some((row) => row.variable)) options.raise()
    const variable = rows().filter((row) => row.variable)
    const fixed = rows().reduce((sum, row) => sum + (row.variable ? 0 : -row.amountMinor), 0)
    const current = variable.reduce((sum, row) => sum - row.amountMinor, 0)
    const low = budget(category) * min
    const high = budget(category) * max
    const spent = fixed + current
    // Without `raise`, only too much is corrected: a quiet start of the month stays quiet.
    if ((spent >= low || !options.raise) && spent <= high) return
    const target = Math.round(between(low, high)) - fixed
    if (current <= 0 || target <= 0) return
    let left = target
    variable.forEach((row, index) => {
      const amount = index === variable.length - 1 ? left : Math.max(100, Math.round((-row.amountMinor * target) / current))
      row.amountMinor = -amount
      left -= amount
    })
  }
  fit("Eating out", 1.06, 1.16, {
    raise: () => add("card", today, -64.8, card(BBVA_CREDIT, "TABERNA LA CONCHA MADRID"), "La Concha", "Eating out", { variable: true }),
  })
  fit("Shopping", 0.83, 0.88, {
    raise: () => add("bbva", today, -59.95, card(BBVA_DEBIT, "ZARA GRAN VIA"), "Zara", "Shopping", { variable: true }),
  })
  fit("Groceries", 0.6, 0.78)
  fit("Transport", 0.5, 0.75)

  // ── The credit card: BBVA debits last month's charges from the payroll account on the 5th ────────────────────
  for (const m of months) {
    const paid = on(m, 5)
    const statement = monthOf(addMonths(`${m}-01`, -1))
    const total = transactions
      .filter((row) => row.account === "card" && row.amountMinor < 0 && monthOf(row.date) === statement)
      .reduce((sum, row) => sum - row.amountMinor, 0)
    if (!total) continue
    add("bbva", paid, -total / 100, "LIQUIDACION TARJETA CREDITO 3307", "BBVA Tarjeta", "Transfers")
    add("card", paid, total / 100, "PAGO LIQUIDACION TARJETA", "BBVA", "Transfers")
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.account.localeCompare(b.account))

  // ── Balances: an opening balance plus everything since, or a target the history works back from ──────────────
  const flow = (account: string) => transactions.filter((row) => row.account === account).reduce((sum, row) => sum + row.amountMinor, 0)
  const opening: Record<string, number> = { bbva: 120_000, card: 0, "savings-lucia": 90_000, revolut: 85_000, vault: 120_000 }
  const closing: Record<string, number> = { common: 315_000, fund: 1_180_000 }
  const balance = (key: string) => (key in closing ? closing[key]! + Math.round(between(-4000, 4000)) : opening[key]! + flow(key))

  // The index fund: monthly contributions plus a market that mostly goes up. Balances are typed in, so no transactions.
  const fundClose = 840_000 + Math.round(between(-6000, 6000))
  const snapshots: DemoScenario["snapshots"] = []
  let market = 1
  const marketPath = new Map<string, number>()
  for (let date = today; date >= start; date = addDays(date, -1)) {
    marketPath.set(date, market)
    market /= 1 + between(-0.007, 0.0082)
  }
  for (let date = start; date <= today; date = addDays(date, 1)) {
    // What was in the fund that day, valued at that day's prices.
    const later = months.filter((m) => on(m, 2) > date && on(m, 2) <= today).length * INDEX_FUND_MONTHLY
    snapshots.push({ account: "myinvestor", date, balanceMinor: Math.round((fundClose - later) * marketPath.get(date)!) })
  }

  // Pablo's bitcoin: what he bought each month, priced along a jumpy path that ends near today's price.
  const btcQuantity = 0.04213
  const btcPrice = Math.round(between(9_050_000, 9_450_000))
  let price = btcPrice
  let quantity = btcQuantity
  for (let date = today; date >= start; date = addDays(date, -1)) {
    snapshots.push({ account: "btc", date, balanceMinor: Math.round(price * quantity) })
    // Before a purchase day, the wallet held less.
    if (date.slice(8) === "10") quantity = Math.max(0.004, quantity - BTC_MONTHLY / price)
    price = Math.round(price / (1 + between(-0.031, 0.0328)))
  }
  const btcValue = Math.round(btcPrice * btcQuantity)

  const accounts: DemoAccount[] = [
    { key: "common", owner: "lucia", connection: "ing", externalId: "demo-ing-common", name: "Cuenta común", institution: "ING", kind: "checking", iban: "ES12 1465 0000 0000 0000 4821", visibility: "household", householdPermission: "edit", balanceMinor: balance("common") },
    { key: "fund", owner: "lucia", connection: "ing", externalId: "demo-ing-naranja", name: "Fondo de emergencia", institution: "ING", kind: "savings", iban: "ES40 1465 0000 0000 0000 7713", visibility: "household", householdPermission: "edit", balanceMinor: balance("fund") },
    { key: "bbva", owner: "lucia", connection: "bbva", externalId: "demo-bbva-nomina", name: "Cuenta Nómina", institution: "BBVA", kind: "checking", iban: "ES91 0182 0000 0000 0000 2290", visibility: "household", householdPermission: "view", balanceMinor: balance("bbva") },
    { key: "card", owner: "lucia", connection: "bbva", externalId: "demo-bbva-credit", name: "Tarjeta de crédito", institution: "BBVA", kind: "credit", iban: null, visibility: "household", householdPermission: "view", balanceMinor: balance("card") },
    { key: "savings-lucia", owner: "lucia", connection: "bbva", externalId: "demo-bbva-ahorro", name: "Ahorro personal", institution: "BBVA", kind: "savings", iban: "ES07 0182 0000 0000 0000 6154", visibility: "private", householdPermission: "view", balanceMinor: balance("savings-lucia") },
    { key: "myinvestor", owner: "lucia", connection: null, externalId: null, name: "Fondo indexado", institution: "MyInvestor", kind: "investment", iban: null, visibility: "household", householdPermission: "view", balanceMinor: fundClose },
    { key: "revolut", owner: "pablo", connection: "revolut", externalId: "demo-revolut-eur", name: "Revolut", institution: "Revolut", kind: "checking", iban: "LT00 3250 0000 0000 0000", visibility: "household", householdPermission: "edit", balanceMinor: balance("revolut") },
    { key: "vault", owner: "pablo", connection: "revolut", externalId: "demo-revolut-vault", name: "Vault", institution: "Revolut", kind: "savings", iban: null, visibility: "private", householdPermission: "view", balanceMinor: balance("vault") },
    { key: "btc", owner: "pablo", connection: "bitcoin", externalId: "demo-btc-wallet", name: "Bitcoin wallet", institution: "Bitcoin", kind: "crypto", iban: null, visibility: "household", householdPermission: "view", balanceMinor: btcValue },
  ]

  // "By next October", at least six months out.
  const year = Number(today.slice(0, 4))
  const japan = monthOf(addMonths(today, 6)) <= `${year}-10` ? `${year}-10-31` : `${year + 1}-10-31`

  return {
    today,
    start,
    connections: [
      { key: "ing", owner: "lucia", provider: "enable_banking", name: "ING", institution: "ING", country: "ES", externalId: "demo-session-ing", consentDays: 131 },
      { key: "bbva", owner: "lucia", provider: "enable_banking", name: "BBVA", institution: "BBVA", country: "ES", externalId: "demo-session-bbva", consentDays: 9 },
      { key: "revolut", owner: "pablo", provider: "enable_banking", name: "Revolut", institution: "Revolut", country: "ES", externalId: "demo-session-revolut", consentDays: 164 },
      // Not a real address: "o" and "i" aren't in bech32's alphabet.
      { key: "bitcoin", owner: "pablo", provider: "bitcoin", name: "Bitcoin wallet", institution: "Bitcoin", country: null, externalId: "bc1qdemowalletnotarealaddressviteHubfinance", consentDays: null },
    ],
    accounts,
    holdings: [{ account: "btc", symbol: "BTC", name: "Bitcoin", quantity: btcQuantity, priceMinor: btcPrice, valueMinor: btcValue }],
    snapshots,
    transactions: transactions.map(({ variable: _, ...row }) => row),
    budgets: DEMO_BUDGETS,
    goals: [
      { name: "Viaje a Japón", icon: "i-lucide-plane", targetMinor: 600_000, savedMinor: 235_000, targetDate: japan },
      { name: "Fondo de emergencia", icon: "i-lucide-umbrella", targetMinor: 1_500_000, savedMinor: 0, targetDate: null, account: "fund" },
      { name: "Bici nueva", icon: "i-lucide-bike", targetMinor: 120_000, savedMinor: 78_000, targetDate: addMonths(today, 4), owner: "lucia" },
    ],
    confirmed: ["out:préstamo hipotecario", "out:vodafone españa", "out:netflix", "out:spotify", "in:estudio norte diseño", "in:comunidad madrid"],
  }
}
