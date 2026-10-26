// Interactive Brokers through the Flex Web Service: a read-only token and an Activity Flex Query. SendRequest asks IBKR
// to run the query and answers a reference code; GetStatement answers the statement once it's ready. A Flex token can
// only read reports: it can't trade or move money.
import { BrokerError, type BrokerErrorCode } from "./errors.ts"
import { requester, type ClientOptions } from "./http.ts"
import type { BrokerAccount, BrokerProvider, CashBalance, Position } from "./model.ts"
import { find, findAll, parseXml, type XmlElement } from "./xml.ts"

export interface IbkrCredentials {
  /** The Flex Web Service token (Flex Web Service Configuration in Client Portal). */
  token: string
  /** The Activity Flex Query's id, a number. */
  queryId: string
}

export interface IbkrOptions extends ClientOptions {
  /** Another Flex Web Service: a proxy or a recorder. */
  baseUrl?: string
  /** How long to wait between asks while IBKR prepares the statement. Default 3 seconds. */
  pollIntervalMs?: number
  /** How many times to ask for the statement before giving up. Default 10. */
  maxPolls?: number
}

export const IBKR_FLEX_URL = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService"
// IBKR's docs: send 3; without it the service answers as version 2.
const VERSION = "3"
const LABEL = "Interactive Brokers"

// IBKR's Flex Web Service error codes by what they mean here. These say the statement isn't ready yet, or IBKR is busy.
const NOT_READY = new Set(["1001", "1004", "1005", "1006", "1007", "1008", "1009", "1019", "1021"])
// Too many requests for this token (one a second, ten a minute), or too many failed ones.
const TOO_MANY = new Set(["1018", "1025"])
const NEEDS_FIXING: Record<string, string> = {
  "1010": "this is a legacy Flex Query. Create a new Activity Flex Query.",
  "1011": "the Flex Web Service is off for this account. Turn it on under Flex Web Service Configuration.",
  "1012": "the Flex token has expired. Generate a new one and connect again.",
  "1013": "the Flex token only works from one IP address. Generate one with “Valid for IP Address” left empty.",
  "1014": "the Query ID isn't valid. Copy it from the query's info in Flex Queries.",
  "1015": "the Flex token isn't valid. Copy it again from Flex Web Service Configuration.",
  "1016": "an account in the Flex Query isn't valid.",
  "1020": "IBKR couldn't validate the request. Check the Flex token and the Query ID.",
}

/** IBKR's numbers are plain decimals, sometimes with thousands separators; empty is 0. */
const number = (value: string | undefined) => {
  const parsed = Number((value ?? "").replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

/** A `FlexStatementResponse` (SendRequest's answer, or GetStatement's while it isn't ready), or null for anything else. */
function flexResponse(xml: string) {
  let response: XmlElement | undefined
  try {
    response = find(parseXml(xml), "FlexStatementResponse")
  } catch {
    return null
  }
  if (!response) return null
  // IBKR's docs and its responses disagree on the case of some element names.
  const field = (name: string) => response.children.find((child) => child.name.toLowerCase() === name.toLowerCase())?.text ?? ""
  return { status: field("Status"), code: field("ErrorCode"), message: field("ErrorMessage"), reference: field("ReferenceCode") }
}

function flexError(code: string, message: string) {
  const fix = NEEDS_FIXING[code]
  if (fix) return new BrokerError("invalid_credentials", `${LABEL}: ${fix}`, "ibkr")
  const kind: BrokerErrorCode = TOO_MANY.has(code) ? "rate_limited" : "unavailable"
  const reason = message.replace(/\.$/, "") || "the request failed"
  return new BrokerError(kind, `${LABEL}: ${reason}${code ? ` (error ${code})` : ""}.`, "ibkr")
}

/** The open positions of one statement. Summary rows when the query has them, otherwise its lots added up per instrument. */
function positionsOf(statement: XmlElement): Position[] {
  const rows = findAll(statement, "OpenPosition")
  const level = (row: XmlElement) => (row.attributes.levelOfDetail ?? "SUMMARY").toUpperCase()
  const summary = rows.filter((row) => level(row) === "SUMMARY")
  const merged = new Map<string, Position>()
  for (const row of summary.length ? summary : rows.filter((row) => level(row) === "LOT")) {
    const attributes = row.attributes
    const currency = (attributes.currency ?? "").toUpperCase()
    const key = `${attributes.conid || attributes.symbol}|${currency}`
    const current = merged.get(key)
    if (current) {
      current.quantity += number(attributes.position)
      current.value += number(attributes.positionValue)
      continue
    }
    merged.set(key, {
      symbol: attributes.symbol ?? "",
      description: attributes.description || null,
      assetClass: attributes.assetCategory ?? "",
      quantity: number(attributes.position),
      markPrice: number(attributes.markPrice),
      value: number(attributes.positionValue),
      currency,
      id: attributes.conid || null,
      isin: attributes.isin || null,
    })
  }
  return [...merged.values()].filter((position) => position.symbol && position.currency && position.quantity !== 0)
}

/** Ending cash per currency. `BASE_SUMMARY` is every currency converted to the base one, so it's left out. */
function cashOf(statement: XmlElement): CashBalance[] {
  const cash = new Map<string, number>()
  // With “Breakout by Day” a currency has a row per day, oldest first: the last one is the balance now.
  for (const row of findAll(statement, "CashReportCurrency")) {
    const currency = (row.attributes.currency ?? "").toUpperCase()
    if (/^[A-Z]{3}$/.test(currency)) cash.set(currency, number(row.attributes.endingCash))
  }
  return [...cash].filter(([, amount]) => amount !== 0).map(([currency, amount]) => ({ currency, amount }))
}

/**
 * An Activity Flex statement (XML) as accounts with their positions and cash. Throws `invalid_credentials` when the
 * query has neither the Open Positions nor the Cash Report section, since there would be nothing to show.
 */
export function parseFlexStatement(xml: string): BrokerAccount[] {
  const document = parseXml(xml)
  const response = find(document, "FlexQueryResponse")
  if (!response) throw new BrokerError("unavailable", `${LABEL} sent something other than a Flex statement.`, "ibkr")
  if (!find(response, "OpenPositions") && !find(response, "CashReport"))
    throw new BrokerError("invalid_credentials", `${LABEL}: the Flex Query needs the Open Positions and Cash Report sections.`, "ibkr")
  return findAll(response, "FlexStatement").map((statement) => ({
    id: statement.attributes.accountId ?? "",
    positions: positionsOf(statement),
    cash: cashOf(statement),
  }))
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

/** Interactive Brokers with a Flex token and an Activity Flex Query in XML. */
export function ibkr(credentials: IbkrCredentials, options: IbkrOptions = {}): BrokerProvider {
  const request = requester("ibkr", LABEL, options)
  const base = options.baseUrl ?? IBKR_FLEX_URL
  const pollIntervalMs = options.pollIntervalMs ?? 3000
  const maxPolls = options.maxPolls ?? 10

  /** IBKR answers its errors with 200 and XML; a status other than 200 is its edge or the network. */
  async function get(path: string, params: Record<string, string>) {
    const response = await request(`${base}/${path}?${new URLSearchParams({ ...params, v: VERSION })}`)
    const text = await response.text().catch(() => "")
    if (response.status === 429) throw new BrokerError("rate_limited", `${LABEL} is rate limiting requests. Try again later.`, "ibkr")
    if (!response.ok) throw new BrokerError("unavailable", `${LABEL} answered ${response.status}.`, "ibkr")
    return text
  }

  return {
    id: "ibkr",
    name: LABEL,
    async accounts() {
      const token = credentials.token.trim()
      const queryId = credentials.queryId.trim()
      if (!token || !/^\d+$/.test(queryId))
        throw new BrokerError("invalid_credentials", `${LABEL}: paste the Flex token and the Query ID (a number).`, "ibkr")
      const sent = flexResponse(await get("SendRequest", { t: token, q: queryId }))
      if (!sent) throw new BrokerError("unavailable", `${LABEL} sent something other than a Flex response.`, "ibkr")
      if (sent.status !== "Success" || !sent.reference) throw flexError(sent.code, sent.message)
      for (let poll = 0; poll < maxPolls; poll++) {
        if (poll > 0) await sleep(pollIntervalMs)
        const body = await get("GetStatement", { t: token, q: sent.reference })
        if (body.includes("<FlexQueryResponse")) return parseFlexStatement(body)
        const answer = flexResponse(body)
        if (!answer)
          throw new BrokerError("invalid_credentials", `${LABEL}: the Flex Query must be in XML. Edit it, set Format to XML, and save.`, "ibkr")
        if (NOT_READY.has(answer.code) || TOO_MANY.has(answer.code)) continue
        throw flexError(answer.code, answer.message)
      }
      throw new BrokerError("unavailable", `${LABEL} is still preparing the statement. Try again in a few minutes.`, "ibkr")
    },
  }
}
