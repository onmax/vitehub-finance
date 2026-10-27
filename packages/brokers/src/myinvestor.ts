// MyInvestor (myinvestor.es) has no API for its funds, ETFs, and pension plans, and PSD2 only reaches its current
// account. So the person says what they hold (each fund and its units, as MyInvestor's app shows them) and Morningstar
// prices it: its public screener finds a fund by ISIN or name, and its price series gives the net asset value (NAV) per
// unit, published a day or two after the date it's for. Both answer without a key; they're the endpoints Morningstar's
// own fund pages call.
import { BrokerError } from "./errors.ts"
import { requester, type ClientOptions } from "./http.ts"
import type { BrokerAccount, BrokerProvider, Position } from "./model.ts"

/** One fund, ETF, or pension plan and how many units of it are held. */
export interface MyInvestorFund {
  /** Morningstar's id for it (its SecId), which pension plans without an ISIN also have. */
  id: string
  isin: string | null
  name: string
  /** ISO 4217, the currency its NAV is published in. */
  currency: string
  /** Units (participaciones), as MyInvestor's app shows them. */
  units: number
}

export interface MyInvestorCredentials {
  funds: MyInvestorFund[]
}

/** A fund Morningstar knows, as its search answers. */
export interface FundMatch {
  id: string
  isin: string | null
  name: string
  currency: string
  /** Morningstar's category: "RV Global Cap. Grande Blend", "RV Global PP" for a pension plan. */
  category: string | null
}

export interface MorningstarOptions extends ClientOptions {
  /** Another host for Morningstar's API: a proxy or a recorder. */
  baseUrl?: string
}

export const MORNINGSTAR_URL = "https://lt.morningstar.com/api/rest.svc"
// The screener and price series that Morningstar's Spanish fund pages use, with their public ids.
const SCREENER = "klr5zyak8x/security/screener"
const PRICES = "timeseries_price/t92wz0sj7c"
// Funds sold in Spain, every fund (Spanish pension plans are only here), and ETFs listed in Europe.
const UNIVERSES = "FOESP$$ALL|FOALL$$ALL|ETEUR$$ALL"
const LABEL = "Morningstar"
// NAVs arrive late and skip holidays: the last one in this many days is today's price.
const NAV_DAYS = 21

export const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/

const day = (date: Date) => date.toISOString().slice(0, 10)

export function morningstar(options: MorningstarOptions = {}) {
  const api = options.baseUrl ?? MORNINGSTAR_URL
  const request = requester("myinvestor", LABEL, options)

  async function json<T>(url: string): Promise<T> {
    const response = await request(url, { headers: { accept: "application/json" } })
    if (!response.ok) throw new BrokerError("unavailable", `${LABEL} answered ${response.status}. Try again later.`, "myinvestor")
    try {
      return (await response.json()) as T
    } catch {
      throw new BrokerError("unavailable", `${LABEL} sent something that isn't JSON. Try again later.`, "myinvestor")
    }
  }

  return {
    /** Funds, ETFs, and pension plans by ISIN or name, the ones priced in euros first. */
    async search(term: string): Promise<FundMatch[]> {
      const query = new URLSearchParams({
        page: "1",
        pageSize: "20",
        outputType: "json",
        version: "1",
        languageId: "es-ES",
        currencyId: "EUR",
        universeIds: UNIVERSES,
        securityDataPoints: "SecId|Name|isin|PriceCurrency|CategoryName",
        term: term.trim(),
      })
      const body = await json<{ rows?: Array<{ SecId?: string; Name?: string; isin?: string; PriceCurrency?: string; CategoryName?: string }> }>(
        `${api}/${SCREENER}?${query}`,
      )
      return (body.rows ?? [])
        .filter((row) => row.SecId && row.Name)
        .map((row) => ({
          id: row.SecId!,
          isin: row.isin || null,
          name: row.Name!,
          currency: (row.PriceCurrency || "EUR").toUpperCase(),
          category: row.CategoryName || null,
        }))
        .sort((a, b) => Number(b.currency === "EUR") - Number(a.currency === "EUR"))
    },

    /** The latest NAV per unit in `currency`, and the day it's for; null when Morningstar has none in three weeks. */
    async nav(id: string, currency: string, now = new Date()): Promise<{ date: string; price: number } | null> {
      const query = new URLSearchParams({
        currencyId: currency,
        idtype: "Morningstar",
        frequency: "daily",
        startDate: day(new Date(now.getTime() - NAV_DAYS * 86_400_000)),
        endDate: day(now),
        outputType: "COMPACTJSON",
      })
      // Morningstar wants the id's suffix unescaped after the other parameters.
      const points = await json<Array<[number, number | null]>>(`${api}/${PRICES}?${query}&id=${encodeURIComponent(id)}]2]0]FOALL$$ALL`)
      const last = (Array.isArray(points) ? points : []).filter((point) => typeof point[1] === "number" && point[1] > 0).at(-1)
      return last ? { date: day(new Date(last[0])), price: last[1]! } : null
    },
  }
}

/**
 * The funds someone holds at MyInvestor as one account, each at its latest NAV. A fund Morningstar no longer prices
 * fails the read: the person removes it or connects again.
 */
export function myinvestor(credentials: MyInvestorCredentials, options: MorningstarOptions = {}): BrokerProvider {
  const prices = morningstar(options)
  return {
    id: "myinvestor",
    name: "MyInvestor",
    async accounts(): Promise<BrokerAccount[]> {
      const positions: Position[] = []
      for (const fund of credentials.funds) {
        const nav = await prices.nav(fund.id, fund.currency)
        if (!nav)
          throw new BrokerError("invalid_credentials", `${LABEL} has no recent price for ${fund.name}. Remove it and connect MyInvestor again.`, "myinvestor")
        positions.push({
          symbol: fund.isin ?? fund.id,
          description: fund.name,
          assetClass: "FUND",
          quantity: fund.units,
          markPrice: nav.price,
          value: fund.units * nav.price,
          currency: fund.currency,
          id: fund.id,
          isin: fund.isin,
        })
      }
      return [{ id: "myinvestor", positions, cash: [], trades: [], cashMovements: [], history: [] }]
    },
  }
}
