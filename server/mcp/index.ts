import { createMcpHandler, createMcpOAuth, type McpHandler, type McpOAuth } from "nitro-mcp-toolkit"
import { identify } from "../utils/identity"
import { MCP_INSTRUCTIONS, MCP_SERVER_INFO } from "./info"
import categorizeTransaction from "./tools/categorize_transaction"
import getForecast from "./tools/get_forecast"
import getOverview from "./tools/get_overview"
import listAccounts from "./tools/list_accounts"
import listRecurring from "./tools/list_recurring"
import searchTransactions from "./tools/search_transactions"
import spendingByCategory from "./tools/spending_by_category"

/**
 * Joxi's MCP server (nitro-mcp-toolkit on h3-mcp), one file per tool. Each tool is a thin wrapper over the utils the
 * REST API uses, so an agent sees exactly what its user sees: never another member's private account.
 *
 * It's an OAuth 2.1 protected resource: a `401` points at `/.well-known/oauth-protected-resource/mcp`, which names
 * Joxi's Better Auth as the authorization server. A bearer is either a JWT Joxi issued for this `/mcp` or a personal
 * `joxi_` API key; `identify` checks both. The resource is the request's origin plus `/mcp`, so the handler is built
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
    verify: async (_token, event) => Boolean(await identify(event)),
  })
  const mcp = createMcpHandler({
    ...MCP_SERVER_INFO,
    description: "Household finance: accounts, transactions, recurring payments, spending, and a cash-flow forecast.",
    websiteUrl: origin,
    icons: [{ src: `${origin}/favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
    instructions: MCP_INSTRUCTIONS,
    // MCP clients send no Origin; the access token, not the origin, is the boundary.
    origin: false,
    auth: oauth.auth,
    tools: [getOverview, listAccounts, searchTransactions, spendingByCategory, getForecast, listRecurring, categorizeTransaction],
  })
  server = { mcp, oauth }
  // The origin comes from the request's Host, which a Node host passes through as sent: keep only the latest few.
  if (servers.size >= 8) servers.delete(servers.keys().next().value!)
  servers.set(origin, server)
  return server
}
