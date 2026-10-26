// Banks through @vitehub-finance/banking's Enable Banking provider. This adapter keeps what the app stores (sealed
// credentials naming the session and its accounts) and turns account reads into the sync engine's rows.
import { readAccounts, type BankAccount, type Institution } from "@vitehub-finance/banking"
import { enableBanking as enableBankingClient } from "@vitehub-finance/banking/enable-banking"
import { dedupeKeys } from "./dedupe"
import { asProviderError, mapped, ProviderError, USER_AGENT, type FetchOptions, type ProviderAccount, type ProviderResult } from "./types"

export interface EnableBankingConfig {
  appId: string
  privateKey: string
}

/** Sealed in `connection.credentials`. `details` keeps what the consent told us, so a sync spends no calls on it. */
export interface EnableBankingCredentials {
  sessionId: string
  accounts: string[]
  details?: Record<string, BankAccount>
}

export const bankClient = (config: EnableBankingConfig) =>
  enableBankingClient({
    ...config,
    userAgent: USER_AGENT,
    rateLimitMessage: "Your bank allows about 4 syncs a day. Try again in a few hours.",
  })

export const listBanks = (config: EnableBankingConfig, country: string): Promise<Institution[]> =>
  mapped(() => bankClient(config).institutions(country))

export const startAuth = (config: EnableBankingConfig, input: Parameters<ReturnType<typeof bankClient>["authorize"]>[0]) =>
  mapped(() => bankClient(config).authorize(input))

/** Trades the bank's `code` for a consent: the credentials to seal, its accounts, and how long it lasts. */
export async function createSession(config: EnableBankingConfig, code: string) {
  const consent = await mapped(() => bankClient(config).completeAuthorization(code))
  const credentials: EnableBankingCredentials = {
    sessionId: consent.id,
    accounts: consent.accounts.map((account) => account.uid),
    details: Object.fromEntries(consent.accounts.map((account) => [account.uid, account])),
  }
  return { credentials, accounts: consent.accounts, consentExpiresAt: consent.expiresAt }
}

/** Best effort: a revoked session stops the bank's access even if ViteHub Finance's row is already gone. */
export const deleteSession = (config: EnableBankingConfig, sessionId: string) => bankClient(config).revoke(sessionId)

/** One sync: every account's balance and booked transactions since `since`. One account failing leaves the rest. */
export function enableBanking(config: EnableBankingConfig) {
  return async (credentials: EnableBankingCredentials, options: FetchOptions): Promise<ProviderResult<EnableBankingCredentials>> => {
    if (!credentials?.sessionId) throw new ProviderError("expired", "This bank isn't connected yet. Reconnect it.")
    const accounts = credentials.accounts.map(
      (uid): BankAccount => credentials.details?.[uid] ?? { uid, name: "Bank account", iban: null, currency: "EUR", kind: "checking" },
    )
    const reads = await readAccounts(bankClient(config), credentials.sessionId, accounts, { since: options.since }).catch((error) => {
      throw asProviderError(error)
    })
    const result: ProviderAccount[] = []
    for (const read of reads) {
      const base: ProviderAccount = {
        externalId: read.account.uid,
        name: read.account.name,
        kind: read.account.kind,
        currency: read.account.currency,
        iban: read.account.iban,
      }
      if (read.error) {
        result.push({ ...base, error: read.error.message })
        continue
      }
      const keys = await dedupeKeys(read.transactions)
      result.push({
        ...base,
        currency: read.balance?.currency ?? base.currency,
        balanceMinor: read.balance?.amountMinor,
        transactions: read.transactions.map((row, index) => ({ ...row, dedupeKey: keys[index] })),
      })
    }
    return { accounts: result }
  }
}
