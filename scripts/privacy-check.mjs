#!/usr/bin/env node
// End-to-end privacy check against a running ViteHub Finance (BASE_URL, default the dev server): owner A shares one account and
// keeps one private, and hides some transactions on the shared one; member B must never see the private account, the
// hidden transactions, or anything derived from them (totals, recurring series, transfer labels), through the REST API
// or MCP. Exits non-zero on any leak.
//
//   node scripts/privacy-check.mjs
//   BASE_URL=https://finance.example.com node scripts/privacy-check.mjs   (needs open sign-ups or allowed emails)

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3417").replace(/\/$/, "")
const run = Math.random().toString(36).slice(2, 8)
const SECRET_NAME = `Secret Stash ${run}`
const SECRET_MARK = `PRIVMARK${run}`
const HIDDEN_MARK = `HIDEMARK${run}`
const failures = []
let checks = 0

function check(ok, what, detail) {
  checks++
  if (ok) console.log(`  ok    ${what}`)
  else {
    failures.push(what)
    console.log(`  LEAK  ${what}${detail ? `\n        ${detail}` : ""}`)
  }
}

/** A signed-in person: a cookie jar plus fetch helpers. */
function person(label) {
  const jar = new Map()
  async function request(method, path, body, headers = {}) {
    const response = await fetch(BASE + path, {
      method,
      headers: {
        origin: BASE,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(jar.size ? { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";")
      const index = pair.indexOf("=")
      jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
    }
    const text = await response.text()
    let json
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }
    return { status: response.status, json, text }
  }
  async function must(method, path, body) {
    const result = await request(method, path, body)
    if (result.status >= 400) throw new Error(`${label} ${method} ${path} answered ${result.status}: ${result.text.slice(0, 300)}`)
    return result.json
  }
  return { label, request, must, get: (path) => must("GET", path), post: (path, body) => must("POST", path, body ?? {}) }
}

const iso = (date) => date.toISOString().slice(0, 10)
const today = new Date()
const daysAgo = (days) => iso(new Date(today.getTime() - days * 86_400_000))
/** The same day of the month, `months` back, so monthly charges line up. */
const monthsAgo = (months, day) => {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, Math.min(day, 28)))
  return iso(date > today ? new Date(date.getTime() - 31 * 86_400_000) : date)
}

async function mcp(key, method, params, id = 1) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  })
  const text = await response.text()
  // Streamable HTTP may answer as JSON or as one SSE event.
  const payload = text.trimStart().startsWith("{") ? text : (text.match(/^data: (.*)$/m)?.[1] ?? "null")
  return { status: response.status, body: JSON.parse(payload), text }
}

async function main() {
  console.log(`ViteHub Finance privacy check against ${BASE}\n`)
  const a = person("A")
  const b = person("B")
  const emailA = `privacy-a-${run}@example.com`
  const emailB = `privacy-b-${run}@example.com`

  // A signs up (gets a household) and invites B, who signs up and accepts.
  await a.post("/api/auth/sign-up/email", { email: emailA, password: "correct-horse-1", name: "Ana Privacy" })
  // A fresh sign-up's session may not point at the new household yet, so name it.
  const householdA = (await a.get("/api/me")).household.id
  const invitation = await a.post("/api/auth/organization/invite-member", { email: emailB, role: "member", organizationId: householdA })
  const invitationId = invitation?.id ?? invitation?.invitation?.id
  if (!invitationId) throw new Error(`No invitation id in ${JSON.stringify(invitation)}`)
  await b.post("/api/auth/sign-up/email", { email: emailB, password: "correct-horse-1", name: "Ben Privacy" })
  await b.post("/api/auth/organization/accept-invitation", { invitationId })
  const meA = await a.get("/api/me")
  const meB = await b.get("/api/me")
  if (meA.household.id !== meB.household.id) throw new Error("B did not join A's household")
  console.log(`A and B share household ${meA.household.id} (${meA.household.currency})\n`)

  // A: one shared and one private manual account, each with transactions (including a monthly series).
  const shared = await a.post("/api/accounts", { name: "Joint checking", kind: "checking", currency: "EUR", balanceMinor: 123456, visibility: "household" })
  const secret = await a.post("/api/accounts", { name: SECRET_NAME, kind: "checking", currency: "EUR", balanceMinor: 987654, visibility: "private" })
  const series = (description, amount, counterparty) =>
    [0, 1, 2, 3, 4].map((months) => ({ date: monthsAgo(months, 3), amount, description, counterparty }))
  const sharedRows = [...series("Spotify AB", -10.99, "Spotify"), { date: daysAgo(0), amount: -42.5, description: "MERCADONA joint" }]
  const secretRows = [
    ...series(`${SECRET_MARK} Spotify family`, -17.99, "Spotify"),
    ...series(`${SECRET_MARK} gym`, -45, `${SECRET_MARK} Gym`),
    { date: daysAgo(0), amount: -321.0, description: `${SECRET_MARK} MERCADONA secret` },
    { date: daysAgo(1), amount: 5000, description: `${SECRET_MARK} bonus` },
  ]
  const importAvailable = (await a.request("POST", `/api/accounts/${shared.id}/import`, { rows: sharedRows })).status < 400
  if (importAvailable) await a.post(`/api/accounts/${secret.id}/import`, { rows: secretRows })
  else console.log("POST /api/accounts/:id/import is not available: checking accounts and balances only.\n")
  // On the shared account, rows A hides from B: a monthly series, a purchase and income this month, income last month.
  const hiddenRows = [
    ...series(`${HIDDEN_MARK} therapy`, -60, `${HIDDEN_MARK} Therapy`),
    { date: daysAgo(0), amount: -88.8, description: `${HIDDEN_MARK} gift` },
    { date: daysAgo(0), amount: 750, description: `${HIDDEN_MARK} side income` },
    { date: monthsAgo(1, 10), amount: 600, description: `${HIDDEN_MARK} side income` },
  ]
  if (importAvailable) await a.post(`/api/accounts/${shared.id}/import`, { rows: hiddenRows })

  const subscriptions = (await a.get("/api/categories")).find((row) => row.name === "Subscriptions")
  await a.post("/api/budgets", { categoryId: subscriptions.id, amountMinor: 5000 })
  await a.post("/api/goals", { name: "Holiday", targetMinor: 2000000, savedMinor: 1500, accountId: secret.id })
  const recurringA = await a.get("/api/recurring")
  // A categorizes a private transaction "and similar": no household rule may carry its counterparty.
  const privateRow = (await a.get(`/api/transactions?account=${secret.id}&q=gym`)).items[0]
  if (privateRow) await a.must("PATCH", `/api/transactions/${privateRow.id}`, { categoryId: subscriptions.id, applyToSimilar: true })
  const secretRecurring = recurringA.items.filter((row) => row.accountId === secret.id).map((row) => row.id)
  const secretTransactions = (await a.get(`/api/transactions?account=${secret.id}&limit=200`)).items.map((row) => row.id)
  if (importAvailable) {
    check(secretRecurring.length >= 2, "A sees the recurring series on their own private account (sanity)")
    check(secretTransactions.length === secretRows.length, "A sees their own private transactions (sanity)")
  }

  // A confirms the hidden series, then hides its rows (in Subscriptions, so B's budget would show a leak) and the rest.
  const hiddenSeries = recurringA.items.find((row) => row.accountId === shared.id && row.name.toLowerCase().includes("therapy"))
  if (hiddenSeries) await a.must("PATCH", `/api/recurring/${hiddenSeries.id}`, { status: "confirmed" })
  const toHide = (await a.get(`/api/transactions?account=${shared.id}&q=${HIDDEN_MARK}&limit=200`)).items
  for (const row of toHide)
    await a.must("PATCH", `/api/transactions/${row.id}`, { hidden: true, ...(row.amountMinor < 0 ? { categoryId: subscriptions.id } : {}) })
  const hiddenIds = [...toHide.map((row) => row.id), ...(hiddenSeries ? [hiddenSeries.id] : [])]
  if (importAvailable) {
    check(Boolean(hiddenSeries), "A's shared account had the series A then hides (sanity)")
    const ownView = await a.get(`/api/transactions?account=${shared.id}&limit=200`)
    check(
      ownView.items.filter((row) => row.hidden).length === hiddenRows.length && ownView.totals.count === sharedRows.length + hiddenRows.length,
      "A still sees their hidden rows, marked hidden, and counts them (sanity)",
    )
    const ownRecurring = await a.get("/api/recurring")
    check(!ownRecurring.items.some((row) => row.id === hiddenSeries?.id), "hiding a series' rows removes its recurring row, even a confirmed one")
  }

  /** Nothing about the private account or the hidden rows may appear anywhere in what B gets. */
  const secretIds = [secret.id, ...secretRecurring, ...secretTransactions]
  const noTrace = (what, value) => {
    // Case-insensitive: rules, for one, store their match lowercased.
    const text = (typeof value === "string" ? value : JSON.stringify(value)).toLowerCase()
    const found = [SECRET_NAME, SECRET_MARK, ...secretIds, HIDDEN_MARK, ...hiddenIds].find((needle) => text.includes(needle.toLowerCase()))
    check(!found, `${what}: no trace of the private account or hidden rows`, found && `found ${found}`)
  }

  console.log("REST as B (before B has accounts of their own):")
  const accounts = await b.get("/api/accounts")
  noTrace("GET /api/accounts", accounts)
  check(accounts.length === 1 && accounts[0].id === shared.id, "GET /api/accounts lists only the shared account")
  noTrace("GET /api/accounts?archived=1", await b.get("/api/accounts?archived=1"))
  const detail = await b.request("GET", `/api/accounts/${secret.id}`)
  check(detail.status === 404, `GET /api/accounts/<private> is 404 (got ${detail.status})`)
  noTrace("GET /api/accounts/<private> body", detail.text)
  const patch = await b.request("PATCH", `/api/accounts/${secret.id}`, { name: "mine now" })
  check(patch.status === 404, `PATCH /api/accounts/<private> is 404 (got ${patch.status})`)
  const remove = await b.request("DELETE", `/api/accounts/${secret.id}`)
  check(remove.status === 404, `DELETE /api/accounts/<private> is 404 (got ${remove.status})`)

  const transactions = await b.get("/api/transactions?limit=200")
  noTrace("GET /api/transactions", transactions)
  check(transactions.totals.count === (importAvailable ? sharedRows.length : 0), `GET /api/transactions totals count only shared rows (${transactions.totals.count})`)
  const search = await b.get(`/api/transactions?q=${SECRET_MARK}`)
  check(search.totals.count === 0 && search.items.length === 0, "GET /api/transactions?q=<private text> finds nothing")
  const filtered = await b.request("GET", `/api/transactions?account=${secret.id}`)
  check(filtered.status === 404, `GET /api/transactions?account=<private> is 404 (got ${filtered.status})`)
  if (secretTransactions[0]) {
    const edit = await b.request("PATCH", `/api/transactions/${secretTransactions[0]}`, { note: "peek" })
    check(edit.status === 404, `PATCH /api/transactions/<private> is 404 (got ${edit.status})`)
  }
  const sharedView = await b.get(`/api/transactions?account=${shared.id}&limit=200`)
  noTrace("GET /api/transactions?account=<shared>", sharedView)
  check(sharedView.totals.count === (importAvailable ? sharedRows.length : 0), `the shared account's totals leave hidden rows out (${sharedView.totals.count})`)
  check(sharedView.items.every((row) => !row.hidden && !row.canHide), "B's rows of A's account are neither hidden nor hideable")
  check((await b.get(`/api/transactions?q=${HIDDEN_MARK}`)).totals.count === 0, "GET /api/transactions?q=<hidden text> finds nothing")
  if (toHide[0]) {
    const edit = await b.request("PATCH", `/api/transactions/${toHide[0].id}`, { note: "peek" })
    check(edit.status === 404, `PATCH /api/transactions/<hidden> is 404 (got ${edit.status})`)
    noTrace("PATCH /api/transactions/<hidden> body", edit.text)
  }
  if (sharedView.items[0]) {
    const hide = await b.request("PATCH", `/api/transactions/${sharedView.items[0].id}`, { hidden: true })
    check(hide.status === 403, `B can't hide a row on A's account, even with edit access (got ${hide.status})`)
  }

  const overview = await b.get("/api/overview")
  noTrace("GET /api/overview", overview)
  check(overview.netWorthMinor === shared.balanceBaseMinor, `overview net worth is the shared account only (${overview.netWorthMinor} = ${shared.balanceBaseMinor})`)
  check(overview.accountCount === 1, "overview counts one account")
  const lastDay = overview.netWorthSeries.at(-1)
  check(lastDay?.valueMinor === shared.balanceBaseMinor, "overview net worth series ends at the shared balance")
  const spent = overview.spending.reduce((sum, row) => sum + row.amountMinor, 0)
  const thisMonth = iso(today).slice(0, 7)
  const sharedSpent = sharedRows.filter((row) => row.date.slice(0, 7) === thisMonth && row.amount < 0).reduce((sum, row) => sum - Math.round(row.amount * 100), 0)
  check(spent === (importAvailable ? sharedSpent : 0), `overview spending is the shared account's only (${spent})`)
  check(overview.month.inMinor === 0, "overview money in excludes the private bonus and the hidden income")

  const flow = await b.get("/api/flow")
  noTrace("GET /api/flow", flow)
  check(flow.inMinor === 0, `money flow in excludes private and hidden income (${flow.inMinor})`)
  check(flow.outMinor === (importAvailable ? sharedSpent : 0), `money flow out is the shared account's visible spending (${flow.outMinor})`)

  const recurring = await b.get("/api/recurring")
  noTrace("GET /api/recurring", recurring)
  check(recurring.items.every((row) => row.accountId === shared.id), "GET /api/recurring lists only shared series")
  if (secretRecurring[0]) {
    const status = await b.request("PATCH", `/api/recurring/${secretRecurring[0]}`, { status: "dismissed" })
    check(status.status === 404, `PATCH /api/recurring/<private> is 404 (got ${status.status})`)
  }

  const forecast = await b.get("/api/forecast?months=3")
  noTrace("GET /api/forecast", forecast)
  check(forecast.startMinor === shared.balanceBaseMinor, `forecast starts from the shared balance only (${forecast.startMinor})`)
  check(forecast.averageMonthlyIncomeMinor === 0, "forecast income excludes private income")

  const budgets = await b.get("/api/budgets")
  noTrace("GET /api/budgets", budgets)
  const subscriptionBudget = budgets.items.find((row) => row.categoryId === subscriptions.id)
  const sharedSubscriptionsThisMonth = sharedRows.filter((row) => row.date.slice(0, 7) === thisMonth && row.counterparty === "Spotify").length * 1099
  check(
    subscriptionBudget && subscriptionBudget.spentMinor === (importAvailable ? sharedSubscriptionsThisMonth : 0),
    `household budget counts only shared spending (${subscriptionBudget?.spentMinor})`,
  )

  noTrace("GET /api/rules", await b.get("/api/rules"))
  noTrace("GET /api/categories", await b.get("/api/categories"))

  const goals = await b.get("/api/goals")
  noTrace("GET /api/goals", goals)
  const holiday = goals.find((row) => row.name === "Holiday")
  check(holiday && holiday.accountId === null && holiday.progressMinor === 1500, "a goal linked to the private account hides its link and balance")

  // B adds their own Spotify: the couples insight must not use A's private one.
  const own = await b.post("/api/accounts", { name: "Ben's checking", kind: "checking", currency: "EUR", balanceMinor: 1000, visibility: "household" })
  if (importAvailable) await b.post(`/api/accounts/${own.id}/import`, { rows: series("Spotify AB", -10.99, "Spotify") })
  const recurringAfter = await b.get("/api/recurring")
  noTrace("GET /api/recurring after B's own series", recurringAfter)
  const duplicate = recurringAfter.insights.find((row) => row.kind === "duplicate")
  check(!duplicate || duplicate.recurringIds.every((id) => !secretRecurring.includes(id)), "duplicate insights never use the private series")
  if (importAvailable)
    check(Boolean(duplicate) && duplicate.recurringIds.length === 2, "the couples insight finds the Spotify A and B both pay on shared accounts (sanity)")

  if (importAvailable) {
    // A pays into B's account, the pair is detected, then A hides their side: B's side must not name A's account.
    await a.post(`/api/accounts/${shared.id}/import`, { rows: [{ date: daysAgo(1), amount: -250, description: `${HIDDEN_MARK} transfer to own account` }] })
    await b.post(`/api/accounts/${own.id}/import`, { rows: [{ date: daysAgo(1), amount: 250, description: "Incoming payment" }] })
    const incoming = async () => (await b.get(`/api/transactions?account=${own.id}&q=incoming payment`)).items[0]
    check((await incoming())?.transferWith === "Joint checking", "B's incoming payment pairs with A's joint account before A hides it (sanity)")
    const moveOut = (await a.get(`/api/transactions?account=${shared.id}&q=transfer to own`)).items[0]
    hiddenIds.push(moveOut.id)
    await a.must("PATCH", `/api/transactions/${moveOut.id}`, { hidden: true })
    const after = await incoming()
    check(after && after.transferWith === null, `B's side of a hidden transfer names no account (got ${after?.transferWith})`)
    noTrace("B's side of a hidden transfer", after)
    noTrace("GET /api/transactions after the hidden transfer", await b.get("/api/transactions?limit=200"))
  }
  noTrace("GET /api/overview?scope=me", await b.get("/api/overview?scope=me"))

  console.log("\nMCP as B (API key):")
  const created = await b.post("/api/auth/api-key/create", { name: "privacy-check" })
  const key = created.key
  check(typeof key === "string" && key.startsWith("fin_"), "B's API key has the fin_ prefix")
  const init = await mcp(key, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "privacy-check", version: "1" } })
  check(init.body?.result?.serverInfo?.name === "vitehub-finance", "MCP initialize answers as vitehub-finance")
  const callTool = async (name, args) => (await mcp(key, "tools/call", { name, arguments: args }, 2)).body
  for (const [name, args] of [
    ["list_accounts", {}],
    ["list_accounts", { archived: true }],
    ["search_transactions", { limit: 100 }],
    ["search_transactions", { q: SECRET_MARK }],
    ["get_overview", {}],
    ["spending_by_category", {}],
    ["get_forecast", { months: 3 }],
    ["list_recurring", {}],
  ]) {
    const result = await callTool(name, args)
    check(Boolean(result?.result) && !result.result.isError, `MCP ${name}(${JSON.stringify(args)}) answers`, JSON.stringify(result).slice(0, 300))
    noTrace(`MCP ${name}(${JSON.stringify(args)})`, result)
  }
  const listed = (await callTool("list_accounts", {})).result.structuredContent.accounts
  check(listed.length === 2 && !listed.some((row) => row.id === secret.id), "MCP list_accounts returns the shared and B's own account only")
  const filteredMcp = await callTool("search_transactions", { account: secret.id })
  check(filteredMcp?.result?.isError === true, "MCP search_transactions with the private account id fails")
  noTrace("MCP search_transactions(account=<private>)", filteredMcp)
  if (secretTransactions[0]) {
    const categorize = await callTool("categorize_transaction", { id: secretTransactions[0], categoryId: "Groceries" })
    check(categorize?.result?.isError === true, "MCP categorize_transaction on a private transaction fails")
  }
  if (toHide[0]) {
    const categorize = await callTool("categorize_transaction", { id: toHide[0].id, categoryId: "Groceries" })
    check(categorize?.result?.isError === true, "MCP categorize_transaction on a hidden transaction fails")
    // The error repeats the id it was given; apart from that it must read like one for an id that doesn't exist.
    const missing = await callTool("categorize_transaction", { id: "no-such-id", categoryId: "Groceries" })
    const message = (result) => JSON.stringify(result?.result?.content).replace(toHide[0].id, "no-such-id")
    check(message(categorize) === message(missing), "MCP categorize_transaction answers a hidden id like a missing one")
  }
  const ownRow = (await b.get(`/api/transactions?account=${own.id}&limit=1`)).items[0]
  if (ownRow) {
    const viaKey = await b.request("PATCH", `/api/transactions/${ownRow.id}`, { hidden: true }, { authorization: `Bearer ${key}` })
    check(viaKey.status === 403, `an API key can't hide even its owner's transaction (got ${viaKey.status})`)
  }

  console.log("\nA removes B from the household:")
  const removed = await a.request("DELETE", `/api/household/members/${meB.user.id}`)
  check(removed.status === 200, `DELETE /api/household/members/<B> answers 200 (got ${removed.status})`)
  const meAfter = await b.get("/api/me")
  check(meAfter.household.id !== meA.household.id && meAfter.role === "owner", "B now owns a household of their own")
  const bAccounts = await b.get("/api/accounts")
  check(bAccounts.length === 1 && bAccounts[0].id === own.id, "B keeps their own account and no longer sees A's")
  const aAccounts = await a.get("/api/accounts")
  check(!aAccounts.some((row) => row.id === own.id), "A no longer sees B's account")
  const bTransactions = await b.get("/api/transactions?limit=200")
  check(bTransactions.items.every((row) => row.accountId === own.id), "B's transactions moved with the account, and only those")
  const bCategories = new Set((await b.get("/api/categories")).map((row) => row.id))
  check(bTransactions.items.every((row) => row.categoryId === null || bCategories.has(row.categoryId)), "B's moved transactions use B's new categories")
  const sharedAfter = await b.request("GET", `/api/accounts/${shared.id}`)
  check(sharedAfter.status === 404, `B can't open A's shared account any more (got ${sharedAfter.status})`)
  const lastOwner = await a.request("POST", "/api/household/leave")
  check(lastOwner.status === 409, `the last owner can't leave (got ${lastOwner.status})`)

  console.log(`\n${checks - failures.length}/${checks} checks passed.`)
  if (failures.length) {
    console.log(`\n${failures.length} leak(s):\n${failures.map((line) => `- ${line}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`\nprivacy-check could not finish: ${error.message}`)
  process.exit(2)
})
