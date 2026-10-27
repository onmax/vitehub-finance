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
  "1010": "This is a legacy Flex Query. Create a new Activity Flex Query.",
  "1011": "The Flex Web Service is off for this account. Turn it on under Flex Web Service Configuration.",
  "1012": "The Flex token has expired. Generate a new one and connect again.",
  "1013": "The Flex token only works from one IP address. Generate one with 'Valid for IP Address' left empty.",
  "1014": "The Query ID isn't valid. Copy it from the query's info in Flex Queries.",
  "1015": "The Flex token isn't valid. Copy it again from Flex Web Service Configuration.",
  "1016": "An account in the Flex Query isn't valid. Check the query's Accounts setting.",
  "1020": "Interactive Brokers couldn't validate the request. Check the Flex token and the Query ID.",
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
  if (fix) return new BrokerError("invalid_credentials", fix, "ibkr")
  const kind: BrokerErrorCode = TOO_MANY.has(code) ? "rate_limited" : "unavailable"
  const reason = message.replace(/\.$/, "") || "the request failed"
  const text =
    kind === "rate_limited"
      ? `${LABEL} is limiting requests for this Flex token. Try again in a few minutes.`
      : `${LABEL} couldn't send the statement. Try again later. Details: ${reason}${code ? ` (error ${code})` : ""}.`
  return new BrokerError(kind, text, "ibkr")
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

// IBKR's names for the fields read here, lowercased without punctuation: XML attributes, and CSV and Text column
// headers, which name some of them differently ("ClientAccountID" for `accountId`, "Quantity" for `position`).
const COLUMNS: Record<string, string> = {
  accountid: "accountId",
  clientaccountid: "accountId",
  currency: "currency",
  currencyprimary: "currency",
  assetcategory: "assetCategory",
  assetclass: "assetCategory",
  symbol: "symbol",
  description: "description",
  conid: "conid",
  isin: "isin",
  position: "position",
  quantity: "position",
  markprice: "markPrice",
  positionvalue: "positionValue",
  levelofdetail: "levelOfDetail",
  endingcash: "endingCash",
}
// "Include header and trailer records" frames every row with one of these, and HEADER and DATA rows with a section code.
const RECORDS = new Set(["BOF", "EOF", "BOA", "EOA", "BOS", "EOS", "HEADER", "DATA", "TRAILER"])

/** One line of CSV (quoted cells, doubled quotes inside) or of IBKR's Text format (`|` or tab between cells). */
function cellsOf(line: string, delimiter: string) {
  const cells: string[] = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!
    if (quoted) {
      if (char !== '"') cell += char
      else if (line[index + 1] === '"') (cell += '"'), index++
      else quoted = false
    } else if (char === '"') quoted = true
    else if (char === delimiter) cells.push(cell.trim()), (cell = "")
    else cell += char
  }
  return [...cells, cell.trim()]
}

/**
 * A Flex statement in CSV or Text as the elements the XML one has (FlexStatement per account, with OpenPosition and
 * CashReportCurrency rows named as in XML), or null when it has neither section. Each section starts with a row of
 * column names; a row is that when it has two of the names read here and no numbers.
 */
function readDelimited(text: string): XmlElement | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return null
  const delimiter = ["|", "\t", ","].map((char) => [char, lines[0]!.split(char).length] as const).sort((a, b) => b[1] - a[1])[0]![0]
  const element = (name: string, attributes: Record<string, string> = {}): XmlElement => ({ name, attributes, children: [], text: "" })
  const statements = new Map<string, XmlElement>()
  let header: Array<string | undefined> = []
  let section: "OpenPosition" | "CashReportCurrency" | null = null
  for (const line of lines) {
    let cells = cellsOf(line, delimiter)
    const record = cells[0]?.toUpperCase() ?? ""
    if (RECORDS.has(record)) {
      if (record !== "HEADER" && record !== "DATA") continue
      cells = cells.slice(2)
    }
    const names = cells.map((cell) => COLUMNS[cell.toLowerCase().replace(/[^a-z0-9]/g, "")])
    if (names.filter(Boolean).length >= 2 && !cells.some((cell) => /^-?[\d.,]+$/.test(cell))) {
      header = names
      section = names.includes("endingCash") ? "CashReportCurrency" : names.includes("position") || names.includes("positionValue") ? "OpenPosition" : null
      continue
    }
    if (!section) continue
    const attributes: Record<string, string> = {}
    header.forEach((name, index) => name && (attributes[name] = cells[index] ?? ""))
    const account = attributes.accountId ?? ""
    let statement = statements.get(account)
    if (!statement) {
      statement = element("FlexStatement", { accountId: account })
      statement.children.push(element("OpenPositions"), element("CashReport"))
      statements.set(account, statement)
    }
    statement.children[section === "OpenPosition" ? 0 : 1]!.children.push(element(section, attributes))
  }
  if (!statements.size) return null
  const response = element("FlexQueryResponse")
  response.children.push(...statements.values())
  return { ...element("#document"), children: [response] }
}

/**
 * An Activity Flex statement, in whichever format the query uses (XML, CSV, or Text), as accounts with their positions
 * and cash. Throws `invalid_credentials` when the query has neither the Open Positions nor the Cash Report section,
 * since there would be nothing to show.
 */
export function parseFlexStatement(body: string): BrokerAccount[] {
  const needsSections = () =>
    new BrokerError("invalid_credentials", `The Flex Query needs the Open Positions and Cash Report sections. Add them in ${LABEL}'s Flex Queries and save.`, "ibkr")
  const document = body.includes("<FlexQueryResponse") ? parseXml(body) : readDelimited(body)
  if (!document) throw needsSections()
  const response = find(document, "FlexQueryResponse")
  if (!response) throw new BrokerError("unavailable", `${LABEL} sent something other than a Flex statement. Try again later.`, "ibkr")
  if (!find(response, "OpenPositions") && !find(response, "CashReport")) throw needsSections()
  return findAll(response, "FlexStatement").map((statement) => ({
    id: statement.attributes.accountId ?? "",
    positions: positionsOf(statement),
    cash: cashOf(statement),
  }))
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

/** Interactive Brokers with a Flex token and an Activity Flex Query, in any of its formats. */
export function ibkr(credentials: IbkrCredentials, options: IbkrOptions = {}): BrokerProvider {
  const request = requester("ibkr", LABEL, options)
  const base = options.baseUrl ?? IBKR_FLEX_URL
  const pollIntervalMs = options.pollIntervalMs ?? 3000
  const maxPolls = options.maxPolls ?? 10

  /** IBKR answers its errors with 200 and XML; a status other than 200 is its edge or the network. */
  async function get(path: string, params: Record<string, string>) {
    const response = await request(`${base}/${path}?${new URLSearchParams({ ...params, v: VERSION })}`)
    const text = await response.text().catch(() => "")
    if (response.status === 429) throw new BrokerError("rate_limited", `${LABEL} is limiting requests. Try again in a few minutes.`, "ibkr")
    if (!response.ok) throw new BrokerError("unavailable", `${LABEL} returned HTTP ${response.status}. Try again later.`, "ibkr")
    return text
  }

  return {
    id: "ibkr",
    name: LABEL,
    async accounts() {
      const token = credentials.token.trim()
      const queryId = credentials.queryId.trim()
      if (!token || !/^\d+$/.test(queryId))
        throw new BrokerError("invalid_credentials", `Paste the Flex token and the Query ID, which is a number.`, "ibkr")
      const sent = flexResponse(await get("SendRequest", { t: token, q: queryId }))
      if (!sent) throw new BrokerError("unavailable", `${LABEL} sent something other than a Flex response. Try again later.`, "ibkr")
      if (sent.status !== "Success" || !sent.reference) throw flexError(sent.code, sent.message)
      for (let poll = 0; poll < maxPolls; poll++) {
        if (poll > 0) await sleep(pollIntervalMs)
        const body = await get("GetStatement", { t: token, q: sent.reference })
        // Not ready yet, or an error, is a FlexStatementResponse; anything else is the statement, in the query's format.
        const answer = body.includes("<FlexQueryResponse") ? null : flexResponse(body)
        if (!answer) return parseFlexStatement(body)
        if (NOT_READY.has(answer.code) || TOO_MANY.has(answer.code)) continue
        throw flexError(answer.code, answer.message)
      }
      throw new BrokerError("unavailable", `${LABEL} is still preparing the statement. Try again in a few minutes.`, "ibkr")
    },
  }
}
