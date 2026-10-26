// Enable Banking (enablebanking.com): PSD2 access to EU banks. The app signs its own RS256 JWT for every call; a bank
// session (one consent, several accounts) lives up to 180 days. Free restricted apps may fetch ~4 times a day.
import type { AccountKind } from "../../shared/api"
import { importRsaKey, signRs256 } from "./crypto"
import { dedupeKeys, decimalToMinor } from "./dedupe"
import {
  describeBody,
  ProviderError,
  readBody,
  request,
  type FetchOptions,
  type ProviderAccount,
  type ProviderResult,
  type ProviderTransaction,
} from "./types"

const API = "https://api.enablebanking.com"
const MAX_CONSENT_SECONDS = 180 * 24 * 60 * 60

export interface EnableBankingConfig {
  appId: string
  privateKey: string
}

export interface EnableBankingAccountInfo {
  uid: string
  name: string
  iban: string | null
  currency: string
  kind: AccountKind
}

/** Sealed in `connection.credentials`. `details` keeps what the session told us, so a sync spends no calls on it. */
export interface EnableBankingCredentials {
  sessionId: string
  accounts: string[]
  details?: Record<string, EnableBankingAccountInfo>
}

let cachedToken: { appId: string; jwt: string; exp: number } | undefined

/** An app JWT, reused while it has more than five minutes left. */
export async function appToken(config: EnableBankingConfig, now = Math.floor(Date.now() / 1000)) {
  if (cachedToken && cachedToken.appId === config.appId && cachedToken.exp - now > 300) return cachedToken.jwt
  const key = await importRsaKey(config.privateKey)
  const exp = now + 3600
  const jwt = await signRs256(
    { typ: "JWT", kid: config.appId },
    { iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp },
    key,
  )
  cachedToken = { appId: config.appId, jwt, exp }
  return jwt
}

async function call<T>(config: EnableBankingConfig, method: string, path: string, body?: unknown): Promise<T> {
  const response = await request("Enable Banking", `${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${await appToken(config)}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const parsed = await readBody(response)
  if (response.ok) return parsed as T
  const message = describeBody(parsed, `Enable Banking answered ${response.status}.`)
  const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed)
  if (response.status === 401 || response.status === 403 || /EXPIRED_SESSION|SESSION_EXPIRED|CLOSED_SESSION/i.test(text)) {
    // A rejected app JWT is a setup problem, not an expired consent.
    if (/jwt|application|kid\b/i.test(message) && !/session/i.test(message))
      throw new ProviderError("auth", `Enable Banking rejected the app credentials: ${message}`)
    throw new ProviderError("expired", "The bank consent has expired. Reconnect the bank to keep syncing.")
  }
  if (response.status === 429 || /RATE_LIMIT/i.test(text))
    throw new ProviderError("rate_limited", "The bank limits how often Joxi may fetch (about 4 times a day). Try again later.")
  if (response.status >= 500) throw new ProviderError("unavailable", `The bank or Enable Banking is unavailable: ${message}`)
  throw new ProviderError("unavailable", `Enable Banking: ${message}`)
}

export interface Aspsp {
  name: string
  country: string
  logo?: string | null
  maximum_consent_validity?: number | null
  psu_types?: string[]
}

export async function listBanks(config: EnableBankingConfig, country: string) {
  const body = await call<{ aspsps: Aspsp[] }>(config, "GET", `/aspsps?country=${encodeURIComponent(country)}`)
  return body.aspsps ?? []
}

/** Starts a consent at the bank; the person opens `url` and comes back to `redirectUrl` with `code` and `state`. */
export async function startAuth(
  config: EnableBankingConfig,
  input: { name: string; country: string; state: string; redirectUrl: string; maxConsentSeconds?: number | null },
) {
  const seconds = Math.min(input.maxConsentSeconds || MAX_CONSENT_SECONDS, MAX_CONSENT_SECONDS)
  const body = await call<{ url: string }>(config, "POST", "/auth", {
    access: { valid_until: new Date(Date.now() + seconds * 1000).toISOString() },
    aspsp: { name: input.name, country: input.country },
    state: input.state,
    redirect_url: input.redirectUrl,
    psu_type: "personal",
  })
  if (!body.url) throw new ProviderError("unavailable", "Enable Banking returned no authorization link.")
  return body.url
}

interface SessionAccount {
  uid: string
  account_id?: { iban?: string | null } | null
  name?: string | null
  details?: string | null
  product?: string | null
  currency?: string | null
  cash_account_type?: string | null
}

export function accountKind(cashAccountType: string | null | undefined): AccountKind {
  switch ((cashAccountType ?? "").toUpperCase()) {
    case "SVGS":
    case "MOMA":
    case "ONDP":
      return "savings"
    case "CARD":
      return "credit"
    case "LOAN":
    case "MGLN":
      return "loan"
    default:
      return "checking"
  }
}

export function sessionAccountInfo(account: SessionAccount): EnableBankingAccountInfo {
  const iban = account.account_id?.iban || null
  return {
    uid: account.uid,
    name: account.name || account.product || account.details || (iban ? `Account ${iban.slice(-4)}` : "Bank account"),
    iban,
    currency: account.currency || "EUR",
    kind: accountKind(account.cash_account_type),
  }
}

/** Trades the bank's `code` for a session: its id, accounts, and how long the consent lasts. */
export async function createSession(config: EnableBankingConfig, code: string) {
  const body = await call<{
    session_id: string
    accounts?: SessionAccount[]
    access?: { valid_until?: string }
    aspsp?: { name: string; country: string }
  }>(config, "POST", "/sessions", { code })
  const accounts = (body.accounts ?? []).filter((account) => account.uid).map(sessionAccountInfo)
  const credentials: EnableBankingCredentials = {
    sessionId: body.session_id,
    accounts: accounts.map((account) => account.uid),
    details: Object.fromEntries(accounts.map((account) => [account.uid, account])),
  }
  const until = body.access?.valid_until ? new Date(body.access.valid_until) : null
  return { credentials, accounts, consentExpiresAt: until && !Number.isNaN(until.getTime()) ? until : null }
}

/** Best effort: a revoked session stops the bank's access even if Joxi's row is already gone. */
export async function deleteSession(config: EnableBankingConfig, sessionId: string) {
  await call(config, "DELETE", `/sessions/${encodeURIComponent(sessionId)}`).catch(() => undefined)
}

interface Balance {
  balance_amount?: { amount: string; currency: string }
  balance_type?: string
}

const BALANCE_PREFERENCE = ["ITAV", "CLAV", "ITBD", "CLBD", "XPCD"]

/** The balance people expect to see: available before booked, interim before closing. */
export function pickBalance(balances: Balance[]) {
  const usable = balances.filter((balance) => balance.balance_amount?.amount !== undefined)
  for (const type of BALANCE_PREFERENCE) {
    const match = usable.find((balance) => balance.balance_type === type)
    if (match) return match.balance_amount!
  }
  return usable[0]?.balance_amount ?? null
}

export interface EbTransaction {
  entry_reference?: string | null
  transaction_id?: string | null
  transaction_amount: { amount: string; currency: string }
  credit_debit_indicator?: "CRDT" | "DBIT" | string | null
  booking_date?: string | null
  value_date?: string | null
  transaction_date?: string | null
  remittance_information?: string[] | null
  creditor?: { name?: string | null } | null
  debtor?: { name?: string | null } | null
  status?: string | null
}

/**
 * Bank rows to Joxi rows: debits negative, the description from the remittance lines (else the counterparty), the
 * counterparty being whoever is on the other side (the creditor of a debit, the debtor of a credit).
 */
export async function mapTransactions(rows: EbTransaction[]): Promise<ProviderTransaction[]> {
  const mapped: ProviderTransaction[] = []
  for (const row of rows) {
    const currency = row.transaction_amount?.currency || "EUR"
    const absolute = decimalToMinor(String(row.transaction_amount?.amount ?? "").replace(/^-/, ""), currency)
    const date = row.booking_date || row.value_date || row.transaction_date
    if (absolute === null || !date) continue
    const debit = row.credit_debit_indicator === "DBIT" || (!row.credit_debit_indicator && String(row.transaction_amount.amount).startsWith("-"))
    const counterparty = (debit ? row.creditor?.name : row.debtor?.name)?.trim() || null
    const remittance = (row.remittance_information ?? [])
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
    mapped.push({
      externalId: row.transaction_id || row.entry_reference || null,
      date: date.slice(0, 10),
      amountMinor: debit ? -absolute : absolute,
      currency,
      description: remittance || counterparty || (debit ? "Payment" : "Deposit"),
      counterparty,
    })
  }
  const keys = await dedupeKeys(mapped)
  return mapped.map((row, index) => ({ ...row, dedupeKey: keys[index] }))
}

async function fetchTransactions(config: EnableBankingConfig, uid: string, since: string | null) {
  const rows: EbTransaction[] = []
  let continuation: string | undefined
  // A page cap keeps a misbehaving bank from looping forever.
  for (let page = 0; page < 50; page++) {
    const query = new URLSearchParams({ transaction_status: "BOOK" })
    if (since) query.set("date_from", since)
    if (continuation) query.set("continuation_key", continuation)
    const body = await call<{ transactions?: EbTransaction[]; continuation_key?: string | null }>(
      config,
      "GET",
      `/accounts/${encodeURIComponent(uid)}/transactions?${query}`,
    )
    rows.push(...(body.transactions ?? []))
    if (!body.continuation_key || body.continuation_key === continuation) break
    continuation = body.continuation_key
  }
  return rows
}

/** One sync: every account's balance and booked transactions since `since`. One account failing leaves the rest. */
export function enableBanking(config: EnableBankingConfig) {
  return async (credentials: EnableBankingCredentials, options: FetchOptions): Promise<ProviderResult<EnableBankingCredentials>> => {
    if (!credentials?.sessionId) throw new ProviderError("expired", "This bank has no session yet. Reconnect it.")
    const accounts: ProviderAccount[] = []
    let stopped: string | null = null
    for (const uid of credentials.accounts) {
      const info = credentials.details?.[uid]
      const base: ProviderAccount = {
        externalId: uid,
        name: info?.name ?? "Bank account",
        kind: info?.kind ?? "checking",
        currency: info?.currency ?? "EUR",
        iban: info?.iban ?? null,
      }
      if (stopped) {
        accounts.push({ ...base, error: stopped })
        continue
      }
      try {
        const balances = await call<{ balances?: Balance[] }>(config, "GET", `/accounts/${encodeURIComponent(uid)}/balances`)
        const balance = pickBalance(balances.balances ?? [])
        const currency = balance?.currency || base.currency
        const balanceMinor = balance ? decimalToMinor(balance.amount, currency) : null
        const transactions = await mapTransactions(await fetchTransactions(config, uid, options.since))
        accounts.push({ ...base, currency, balanceMinor: balanceMinor ?? undefined, transactions })
      } catch (error) {
        // An expired consent or a rejected app applies to the whole session: stop and say so.
        if (error instanceof ProviderError && (error.code === "expired" || error.code === "auth")) throw error
        const message = error instanceof Error ? error.message : String(error)
        // A rate limit hits the rest too: keep what's fetched, skip the remaining calls.
        if (error instanceof ProviderError && error.code === "rate_limited") {
          if (!accounts.some((account) => !account.error)) throw error
          stopped = message
        }
        accounts.push({ ...base, error: message })
      }
    }
    return { accounts }
  }
}
