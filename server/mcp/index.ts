import { useLogger } from "evlog/nitro/v3"
import { createMcpHandler, createMcpOAuth, type McpHandler, type McpOAuth } from "nitro-mcp-toolkit"
import { identify } from "../utils/identity"
import { MCP_INSTRUCTIONS, MCP_SERVER_INFO } from "./info"
import addTransactions from "./tools/add_transactions"
import getFinances from "./tools/get_finances"
import searchTransactions from "./tools/search_transactions"
import updateTransaction from "./tools/update_transaction"

/**
 * ViteHub Finance's MCP server (nitro-mcp-toolkit on h3-mcp), one file per tool. Each tool is a thin wrapper over the utils the
 * REST API uses, so an agent sees exactly what its user sees: never another member's private account.
 *
 * It's an OAuth 2.1 protected resource: a `401` points at `/.well-known/oauth-protected-resource/mcp`, which names
 * ViteHub Finance's Better Auth as the authorization server. A bearer is either a JWT ViteHub Finance issued for this `/mcp` or a personal
 * `fin_` API key; `identify` checks both. The resource is the request's origin plus `/mcp`, so the handler is built
 * once per origin.
 */
const servers = new Map<string, { mcp: McpHandler; oauth: McpOAuth }>()

export function mcpFor(origin: string) {
  let server = servers.get(origin)
  if (server) return server
  const oauth = createMcpOAuth({
    resource: `${origin}/mcp`,
    authorizationServers: [`${origin}/api/auth`],
    scopesSupported: ["openid", "profile", "email", "offline_access"],
    verify: async (_token, event) => {
      // Modern clients name the JSON-RPC method in a header, which tells /mcp requests apart in the logs.
      const method = event.req.headers.get("mcp-method")
      if (method) useLogger(event).set({ mcp: { method, name: event.req.headers.get("mcp-name") ?? undefined } })
      return Boolean(await identify(event))
    },
  })
  const mcp = createMcpHandler({
    ...MCP_SERVER_INFO,
    description: "Household finance: accounts, holdings and staking, transactions, recurring payments, spending, and a cash-flow forecast.",
    websiteUrl: origin,
    icons: [{ src: `${origin}/favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
    instructions: MCP_INSTRUCTIONS,
    // MCP clients send no Origin; the access token, not the origin, is the boundary.
    origin: false,
    auth: oauth.auth,
    // Four tools: two read (get_finances, search_transactions), two write (update_transaction, add_transactions).
    tools: [getFinances, searchTransactions, updateTransaction, addTransactions],
    // Every tool call lands on the request's wide event: which tool, how long, and the reason it failed. Never its
    // arguments or result, which hold the household's transactions.
    onToolCall: ({ name, result, durationMs, event }) => {
      const log = useLogger(event)
      const failed = "isError" in result && Boolean(result.isError)
      log.set({ mcp: { tool: name, durationMs: Math.round(durationMs), isError: failed } })
      if (failed)
        log.warn(`MCP tool ${name} failed`, {
          mcp: {
            error: result.content
              ?.map((block) => ("text" in block ? block.text : ""))
              .join(" ")
              .slice(0, 500),
          },
        })
    },
  })
  server = { mcp, oauth }
  // The origin comes from the request's Host, which a Node host passes through as sent: keep only the latest few.
  if (servers.size >= 8) servers.delete(servers.keys().next().value!)
  servers.set(origin, server)
  return server
}
