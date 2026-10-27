/**
 * Marks for the banks and brokers people use most, so a connection, account, or catalog tile shows its brand without a
 * round trip: a Simple Icons glyph on the brand's own color where Simple Icons has one, else our own (`i-finance-*`,
 * app/assets/icons, cut from the brand's published logo), otherwise the logo Enable Banking publishes for it. The
 * server adds Enable Banking's logo for any other bank from its cached bank lists (server/utils/bank-logos.ts).
 * Every `icon` here is listed in nuxt.config's client icon bundle.
 */
export interface BankMark {
  /** A glyph (`i-simple-icons-*`, `i-finance-*`), drawn in `fg` (or its own colors) on a `bg` tile. */
  icon?: string
  bg?: string
  fg?: string
  /** Enable Banking's logo, a wordmark on a transparent background. */
  logo?: string
}

const brand = (country: string, name: string) => `https://enablebanking.com/brands/${country}/${encodeURIComponent(name)}/`

// Keys are names as banks and people write them, lowercased with everything but letters and digits removed.
const MARKS: Array<[string[], BankMark]> = [
  [["revolut", "revolutbusiness", "revolutbank", "revolutltd"], { icon: "i-simple-icons-revolut", bg: "#191c1f", fg: "#ffffff" }],
  [["n26", "n26bank"], { icon: "i-simple-icons-n26", bg: "#36a18b", fg: "#ffffff" }],
  [["wise", "transferwise", "wisebusiness"], { icon: "i-simple-icons-wise", bg: "#9fe870", fg: "#163300" }],
  [["bunq"], { icon: "i-simple-icons-bunq", bg: "#3394d7", fg: "#ffffff" }],
  [["monzo", "monzobank"], { icon: "i-simple-icons-monzo", bg: "#14233c", fg: "#ffffff" }],
  [["caixabank", "lacaixa"], { icon: "i-simple-icons-caixabank", bg: "#007eae", fg: "#ffffff" }],
  [["starling", "starlingbank"], { icon: "i-simple-icons-starlingbank", bg: "#6935d3", fg: "#ffffff" }],
  [["deutschebank"], { icon: "i-simple-icons-deutschebank", bg: "#0018a8", fg: "#ffffff" }],
  [["commerzbank"], { icon: "i-simple-icons-commerzbank", bg: "#ffcc33", fg: "#002e3c" }],
  [["barclays"], { icon: "i-simple-icons-barclays", bg: "#00aeef", fg: "#ffffff" }],
  [["hsbc", "hsbcuk"], { icon: "i-simple-icons-hsbc", bg: "#ffffff", fg: "#db0011" }],
  [["paypal"], { icon: "i-simple-icons-paypal", bg: "#002991", fg: "#ffffff" }],
  [["klarna"], { icon: "i-simple-icons-klarna", bg: "#ffb3c7", fg: "#0b051d" }],
  [["sparkasse"], { icon: "i-simple-icons-sparkasse", bg: "#ff0000", fg: "#ffffff" }],
  [["bbva"], { logo: brand("ES", "BBVA") }],
  [["ing", "ingdirect", "ingbank"], { logo: brand("ES", "ING") }],
  [["santander", "bancosantander"], { logo: brand("ES", "Banco Santander") }],
  [["sabadell", "bancosabadell", "bancodesabadell", "bancsabadell"], { logo: brand("ES", "Banco de Sabadell") }],
  [["openbank"], { logo: brand("ES", "Openbank") }],
  [["bankinter"], { logo: brand("ES", "Bankinter") }],
  [["abanca"], { logo: brand("ES", "Abanca") }],
  [["kutxabank"], { logo: brand("ES", "Kutxabank") }],
  [["unicaja", "unicajabanco"], { logo: brand("ES", "Unicaja Banco") }],
  [["ibercaja", "ibercajabanco"], { logo: brand("ES", "Ibercaja Banco") }],
  [["imagin", "imaginbank"], { logo: brand("ES", "imagin") }],
  [["evo", "evobanco"], { logo: brand("ES", "EVO Banco") }],
  [["traderepublic", "traderepublicbank"], { icon: "i-finance-trade-republic", bg: "#000000", fg: "#ffffff" }],
  [["interactivebrokers", "ibkr"], { icon: "i-finance-ibkr", bg: "#141414" }],
  [["degiro", "flatexdegiro"], { icon: "i-finance-degiro", bg: "#ffffff", fg: "#009fdf" }],
  [["scalable", "scalablecapital"], { icon: "i-finance-scalable-capital", bg: "#101112", fg: "#28ebcf" }],
  [["myinvestor"], { icon: "i-finance-myinvestor", bg: "#ffffff" }],
  [["lunar"], { logo: brand("DK", "Lunar") }],
  [["danskebank", "danske"], { logo: brand("DK", "Danske Bank") }],
  [["nordea"], { logo: brand("FI", "Nordea") }],
  [["abnamro"], { logo: brand("NL", "ABN AMRO") }],
  [["rabobank"], { logo: brand("NL", "Rabobank") }],
  [["dkb"], { logo: brand("DE", "DKB") }],
  [["comdirect"], { logo: brand("DE", "Comdirect") }],
  [["postbank"], { logo: brand("DE", "Postbank") }],
  [["kbc"], { logo: brand("BE", "KBC") }],
  [["belfius"], { logo: brand("BE", "Belfius") }],
  [["seb"], { logo: brand("SE", "SEB") }],
  [["swedbank"], { logo: brand("SE", "Swedbank") }],
  [["handelsbanken"], { logo: brand("SE", "Handelsbanken") }],
  [["dnb"], { logo: brand("NO", "DNB") }],
  [["unicredit"], { logo: brand("IT", "UniCredit") }],
  [["erstebank", "erste"], { logo: brand("AT", "Erste Bank") }],
  [["aib"], { logo: brand("IE", "AIB") }],
  [["bankofireland"], { logo: brand("IE", "Bank of Ireland") }],
]

const BY_KEY = new Map(MARKS.flatMap(([keys, mark]) => keys.map((key) => [key, mark] as const)))

const keyOf = (name: string) =>
  name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

/** The built-in mark for a bank by name ("Revolut", "Banco Santander", "ING Direct"), or null. */
export function bankMark(name: string | null | undefined): BankMark | null {
  if (!name) return null
  return BY_KEY.get(keyOf(name)) ?? null
}
