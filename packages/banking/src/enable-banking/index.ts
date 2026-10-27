// Enable Banking (enablebanking.com): PSD2 access to 2,500+ European banks. The app signs its own RS256 JWT for every
// call; a session (one consent, several accounts) lives up to 180 days. A free restricted app reads the accounts you
// link in its control panel, about four times a day.
import { BankingError, type BankingErrorCode } from "../errors.ts"
import { decimalToMinor } from "../money.ts"
import { describeBody, readBody, requester, type ClientOptions } from "../http.ts"
import type { BankingProvider, Consent } from "../model.ts"
import { importRsaKey, signRs256 } from "./jwt.ts"
import { mapTransactions, pickBalance, sessionAccounts, toInstitution, type Aspsp, type EbBalance, type EbTransaction, type SessionAccount } from "./map.ts"

export interface EnableBankingOptions extends ClientOptions {
  /** The application id, also the JWT's `kid`. */
  appId: string
  /** The application's PKCS#8 PEM. Literal `\n` (from env vars) is fine. */
  privateKey: string
  /** Default https://api.enablebanking.com. */
  baseUrl?: string
  /** The sentence a rate limit answers with; default names no app. */
  rateLimitMessage?: string
}

const MAX_CONSENT_DAYS = 180

/**
 * A bank refused the consent's length. Enable Banking's list can promise more than the bank takes (MyInvestor: 180 days
 * listed, 90 accepted), and the bank's answer names its limit: "ASPSP does not support consent validity more than
 * 7776000 seconds in the future".
 */
class ConsentTooLong extends BankingError {
  readonly seconds: number

  constructor(seconds: number, message: string) {
    super("unavailable", message, "enable_banking")
    this.seconds = seconds
  }
}

const tokens = new Map<string, { jwt: string; exp: number }>()

/** An app JWT, reused while it has more than five minutes left. */
export async function appToken(options: Pick<EnableBankingOptions, "appId" | "privateKey">, now = Math.floor(Date.now() / 1000)) {
  const cached = tokens.get(options.appId)
  if (cached && cached.exp - now > 300) return cached.jwt
  const exp = now + 3600
  const jwt = await signRs256(
    { typ: "JWT", kid: options.appId },
    { iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp },
    await importRsaKey(options.privateKey),
  )
  tokens.set(options.appId, { jwt, exp })
  return jwt
}

export function enableBanking(options: EnableBankingOptions): BankingProvider {
  const api = options.baseUrl ?? "https://api.enablebanking.com"
  const request = requester("enable_banking", "Enable Banking", options)
  const fail = (code: BankingErrorCode, message: string) => new BankingError(code, message, "enable_banking")

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await request(`${api}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await appToken(options)}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const parsed = await readBody(response)
    if (response.ok) return parsed as T
    const message = describeBody(parsed, `HTTP ${response.status}`)
    const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed)
    if (response.status === 401 || response.status === 403 || /EXPIRED_SESSION|SESSION_EXPIRED|CLOSED_SESSION/i.test(text)) {
      // A rejected app JWT is a setup problem, not an expired consent.
      if (/jwt|application|kid\b/i.test(message) && !/session/i.test(message))
        throw fail("invalid_credentials", `Enable Banking rejected the app ID or private key. Details: ${message}`)
      throw fail("expired", "The bank consent has expired. Reconnect the bank to keep syncing.")
    }
    if (response.status === 429 || /RATE_LIMIT/i.test(text))
      throw fail("rate_limited", options.rateLimitMessage ?? "Your bank allows about 4 syncs a day. Try again in a few hours.")
    if (response.status >= 500) throw fail("unavailable", `The bank or Enable Banking isn't answering. Try again later. Details: ${message}`)
    const limit = /consent validity more than (\d+) seconds/i.exec(text)
    if (limit) throw new ConsentTooLong(Number(limit[1]), `Enable Banking returned an error. Try again later. Details: ${message}`)
    throw fail("unavailable", `Enable Banking returned an error. Try again later. Details: ${message}`)
  }

  return {
    id: "enable_banking",
    name: "Enable Banking",

    async institutions(country) {
      const body = await call<{ aspsps?: Aspsp[] }>("GET", `/aspsps?country=${encodeURIComponent(country)}`)
      return (body.aspsps ?? []).map(toInstitution)
    },

    async authorize(input) {
      const days = Math.min(input.validDays || MAX_CONSENT_DAYS, MAX_CONSENT_DAYS)
      const start = (ms: number) =>
        call<{ url?: string }>("POST", "/auth", {
          access: { valid_until: new Date(Date.now() + ms).toISOString() },
          aspsp: input.institution,
          state: input.state,
          redirect_url: input.redirectUrl,
          psu_type: "personal",
        })
      const body = await start(days * 86_400_000).catch((error) => {
        // Once, at the bank's own limit less an hour, so the clocks' drift can't push it over.
        if (error instanceof ConsentTooLong && error.seconds > 7200) return start((error.seconds - 3600) * 1000)
        throw error
      })
      if (!body.url) throw fail("unavailable", "Enable Banking didn't return a link to your bank. Try again.")
      return body.url
    },

    async completeAuthorization(code): Promise<Consent> {
      const body = await call<{
        session_id: string
        accounts?: SessionAccount[]
        access?: { valid_until?: string }
        aspsp?: { name: string; country: string }
      }>("POST", "/sessions", { code })
      const until = body.access?.valid_until ? new Date(body.access.valid_until) : null
      return {
        id: body.session_id,
        institution: body.aspsp ?? null,
        accounts: sessionAccounts((body.accounts ?? []).filter((account) => account.uid), body.aspsp?.name),
        expiresAt: until && !Number.isNaN(until.getTime()) ? until : null,
      }
    },

    async balance(_consentId, accountUid) {
      const body = await call<{ balances?: EbBalance[] }>("GET", `/accounts/${encodeURIComponent(accountUid)}/balances`)
      const balance = pickBalance(body.balances ?? [])
      if (!balance) return null
      const amountMinor = decimalToMinor(balance.amount, balance.currency)
      return amountMinor === null ? null : { amountMinor, currency: balance.currency }
    },

    async transactions(_consentId, accountUid, { since } = {}) {
      const rows: EbTransaction[] = []
      let continuation: string | undefined
      // A page cap keeps a misbehaving bank from looping forever.
      for (let page = 0; page < 50; page++) {
        const query = new URLSearchParams({ transaction_status: "BOOK" })
        if (since) query.set("date_from", since)
        if (continuation) query.set("continuation_key", continuation)
        const body = await call<{ transactions?: EbTransaction[]; continuation_key?: string | null }>(
          "GET",
          `/accounts/${encodeURIComponent(accountUid)}/transactions?${query}`,
        )
        rows.push(...(body.transactions ?? []))
        if (!body.continuation_key || body.continuation_key === continuation) break
        continuation = body.continuation_key
      }
      return mapTransactions(rows)
    },

    async revoke(consentId) {
      await call("DELETE", `/sessions/${encodeURIComponent(consentId)}`).catch(() => undefined)
    },
  }
}

export { accountKind, mapTransactions, pickBalance, sessionAccount, sessionAccounts } from "./map.ts"
export type { Aspsp, EbBalance, EbTransaction, SessionAccount } from "./map.ts"
export { importRsaKey, normalizePem, signRs256 } from "./jwt.ts"
