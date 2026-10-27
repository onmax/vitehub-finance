// The connect catalog: every provider people can connect, or will, with what it reads, what it can't do, how it signs
// in, and the steps its connect dialog walks through. Banks keep their own picker (ConnectBankPicker); exchanges, wallets,
// and investment platforms are tiles on /connect/crypto and /connect/investments. The server says which ones it can
// connect (`GET /api/connect/providers`); `soon` ones can't be connected anywhere yet.
import type { Component } from "vue"
import ExchangeKey from "~/components/connect/ExchangeKey.vue"
import IbkrConnect from "~/components/connect/IbkrConnect.vue"
import MyInvestorFunds from "~/components/connect/MyInvestorFunds.vue"
import WalletAddress from "~/components/connect/WalletAddress.vue"
import type { ConnectionSummary, ProviderId, ProviderInfo } from "#shared/api"

export type ConnectKind = "bank" | "exchange" | "wallet" | "investment"
export type ConnectPage = "/connect/banks" | "/connect/crypto" | "/connect/investments"

/** How a provider lets ViteHub Finance in. */
export type AuthMethod = "consent" | "api-key" | "address" | "flex-token" | "holdings"

/** One screen of a connect dialog. Its component renders a UForm with the flow's `formId` (useConnectFlow). */
export interface ConnectStep {
  id: string
  readonly title: string
  component: Component
  /** The primary button's label on this step; "Continue" when unset. The last step's connects. */
  readonly action?: string
}

export interface CatalogProvider {
  /** The catalog's own id, also the page hash that opens it (`#ibkr`, `#ibkr/connect`). */
  id: string
  /** The server's provider id; null for platforms that can't be connected yet. */
  provider: ProviderId | null
  name: string
  kind: ConnectKind
  /** The provider's site, shown under its name. */
  domain: string
  /** One line for its tile. */
  readonly description: string
  readonly reads: string[]
  readonly cannot: string[]
  auth: AuthMethod
  /** How it signs in, in a sentence. */
  readonly authDetail: string
  /** Its guide in /docs (docs/2.providers/), also for platforms that can't be connected yet. */
  docs: string | null
  /** Can't be connected yet: its tile says "Coming soon" and offers a CSV import instead. */
  soon?: true
  steps: ConnectStep[]
}

/** A tile's state: connected (at least once in this household), ready, missing server setup, or not connectable yet. */
export type Availability = "connected" | "available" | "setup" | "soon"

/** Each kind's page, its name for a filter or a group (`label`), and for one provider (`one`). */
export const CONNECT_KINDS: Record<ConnectKind, { readonly label: string; readonly one: string; page: ConnectPage }> = {
  bank: { get label() { return translate('banks') }, get one() { return translate('bank') }, page: "/connect/banks" },
  exchange: { get label() { return translate('catalogExchanges') }, get one() { return translate('catalogExchange') }, page: "/connect/crypto" },
  wallet: { get label() { return translate('catalogWallets') }, get one() { return translate('wallet') }, page: "/connect/crypto" },
  investment: { get label() { return translate('catalogInvestmentPlatforms') }, get one() { return translate('catalogInvestmentPlatform') }, page: "/connect/investments" },
}

export const AUTH_METHODS: Record<AuthMethod, { readonly label: string; icon: string }> = {
  consent: { get label() { return translate('catalogAuthConsent') }, icon: "i-lucide-landmark" },
  "api-key": { get label() { return translate('catalogAuthApiKey') }, icon: "i-lucide-key-round" },
  address: { get label() { return translate('catalogAuthAddress') }, icon: "i-lucide-eye" },
  "flex-token": { get label() { return translate('catalogAuthFlexToken') }, icon: "i-lucide-key-round" },
  holdings: { get label() { return translate('catalogAuthHoldings') }, icon: "i-lucide-pencil-line" },
}

// Steps load with the catalog, not on demand: a step that arrives after the dialog opened makes it jump.
const step = (id: string, title: () => string, component: Component, action?: () => string): ConnectStep => ({
  id,
  get title() { return title() },
  component,
  get action() { return action?.() },
})

const exchangeSteps = [step("key", () => translate('catalogStepPasteTheKey'), ExchangeKey, () => translate('catalogCheckAndConnect'))]
const walletSteps = [step("address", () => translate('catalogStepPasteTheAddress'), WalletAddress, () => translate('addWallet'))]

function exchange(provider: "kraken" | "binance" | "coinbase", name: string, domain: string, detail: () => string): CatalogProvider {
  return {
    id: provider,
    provider,
    name,
    kind: "exchange",
    domain,
    get description() { return translate('catalogExchangeDescription') },
    get reads() { return [translate('catalogReadsCoinBalances'), translate('catalogReadsDaily')] },
    get cannot() { return [translate('catalogCannotTradeOrWithdraw'), translate('catalogCannotSeePassword', { name })] },
    auth: "api-key",
    get authDetail() { return detail() },
    docs: providerDocs(provider),
    steps: exchangeSteps,
  }
}

function wallet(provider: "bitcoin" | "ethereum" | "polygon" | "solana" | "xrpl" | "nimiq", name: string, domain: string, history: boolean): CatalogProvider {
  return {
    id: provider,
    provider,
    name,
    kind: "wallet",
    domain,
    get description() {
      return provider === "nimiq" ? translate('catalogNimiqDescription') : history ? translate('catalogWalletHistoryDescription', { name }) : translate('catalogWalletBalanceDescription', { name })
    },
    get reads() {
      return [
        provider === "nimiq" ? translate('catalogReadsNimBalance') : translate('catalogReadsAddressBalance'),
        ...(history ? [translate('catalogReadsWalletTransactions')] : []),
        translate('catalogReadsInYourCurrency'),
      ]
    },
    get cannot() { return [translate('catalogCannotSpend'), ...(history ? [] : [translate('catalogCannotHistory')])] },
    auth: "address",
    get authDetail() { return translate('catalogAddressDetail') },
    docs: providerDocs(provider),
    steps: walletSteps,
  }
}

function comingSoon(id: string, name: string, domain: string, description: () => string): CatalogProvider {
  return {
    id,
    provider: null,
    name,
    kind: "investment",
    domain,
    get description() { return description() },
    get reads() { return [] },
    get cannot() { return [] },
    auth: "api-key",
    authDetail: "",
    docs: providerDocs(id),
    soon: true,
    steps: [],
  }
}

export const CATALOG: CatalogProvider[] = [
  exchange("kraken", "Kraken", "kraken.com", () => translate('inKrakenOpenSettingsApiAndCreateAKeyWith')),
  exchange("binance", "Binance", "binance.com", () => translate('inBinanceOpenApiManagementAndCreateASystemGenerated')),
  exchange("coinbase", "Coinbase", "coinbase.com", () => translate('inTheCoinbaseDeveloperPlatformCreateASecretApiKey')),
  wallet("bitcoin", "Bitcoin", "bitcoin.org", true),
  wallet("ethereum", "Ethereum", "ethereum.org", false),
  wallet("polygon", "Polygon", "polygon.technology", false),
  wallet("solana", "Solana", "solana.com", false),
  wallet("xrpl", "XRP Ledger", "xrpl.org", true),
  wallet("nimiq", "Nimiq", "nimiq.com", true),
  {
    id: "ibkr",
    provider: "ibkr",
    name: "Interactive Brokers",
    kind: "investment",
    domain: "interactivebrokers.com",
    get description() { return translate('catalogIbkrDescription') },
    get reads() { return [translate('catalogReadsPositions'), translate('catalogReadsCashPerCurrency'), translate('catalogReadsEveryAccountInTheQuery')] },
    get cannot() { return [translate('catalogCannotTradeOrMoveMoney'), translate('catalogCannotReadOutsideTheQuery')] },
    auth: "flex-token",
    get authDetail() { return translate('catalogFlexTokenDetail') },
    docs: providerDocs("ibkr"),
    steps: [
      step("connect", () => translate('catalogIbkrStepTitle'), IbkrConnect, () => translate('catalogCheckAndConnect')),
    ],
  },
  comingSoon("trade-republic", "Trade Republic", "traderepublic.com", () => translate('catalogTradeRepublicDescription')),
  comingSoon("degiro", "DEGIRO", "degiro.com", () => translate('catalogDegiroDescription')),
  comingSoon("scalable-capital", "Scalable Capital", "scalable.capital", () => translate('catalogScalableDescription')),
  {
    id: "myinvestor",
    provider: "myinvestor",
    name: "MyInvestor",
    kind: "investment",
    domain: "myinvestor.es",
    get description() { return translate('catalogMyinvestorDescription') },
    get reads() { return [translate('catalogReadsFundsAtNav'), translate('catalogReadsDaily')] },
    get cannot() { return [translate('catalogCannotTradeOrMoveMoney'), translate('catalogCannotSeeMyinvestorBuys')] },
    auth: "holdings",
    get authDetail() { return translate('catalogHoldingsDetail') },
    docs: providerDocs("myinvestor"),
    steps: [step("funds", () => translate('catalogMyinvestorStepTitle'), MyInvestorFunds, () => translate('catalogCheckAndConnect'))],
  },
]

export const catalogFor = (page: ConnectPage) => CATALOG.filter((entry) => CONNECT_KINDS[entry.kind].page === page)

export const catalogEntry = (id: string) => CATALOG.find((entry) => entry.id === id)

/** A tile's state, from what the server can connect and what the household already has. */
export function availabilityOf(entry: CatalogProvider, providers: ProviderInfo[], connections: ConnectionSummary[]): Availability {
  if (entry.soon || !entry.provider) return "soon"
  if (connections.some((connection) => connection.provider === entry.provider)) return "connected"
  const info = providers.find((provider) => provider.id === entry.provider)
  // Until the list arrives, exchanges, wallets, and brokers are connectable everywhere.
  return info && !info.available ? "setup" : "available"
}

export const AVAILABILITY: Record<Availability, { readonly label: string; dot: string }> = {
  connected: { get label() { return translate('catalogConnected') }, dot: "bg-success" },
  available: { get label() { return translate('catalogAvailable') }, dot: "bg-(--ui-text-dimmed)" },
  setup: { get label() { return translate('catalogNeedsSetup') }, dot: "bg-warning" },
  soon: { get label() { return translate('catalogComingSoon') }, dot: "" },
}

/** Whether `entry` matches a search: its name, domain, kind, or description. */
export function matchesSearch(entry: CatalogProvider, term: string) {
  const needle = term.trim().toLocaleLowerCase()
  if (!needle) return true
  return [entry.name, entry.domain, CONNECT_KINDS[entry.kind].label, entry.description].some((text) => text.toLocaleLowerCase().includes(needle))
}
