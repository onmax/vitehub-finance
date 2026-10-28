import { useLogger } from "evlog/nitro/v3"
import { type H3Event, HTTPError } from "h3"
import { type CallToolResult, defineMcpHandler, type ToolDefinition } from "okmcp"
import { protectedResourceMetadata } from "okmcp/oauth"
import { identify } from "../utils/identity"
import { MCP_INSTRUCTIONS, MCP_SERVER_INFO } from "./info"
import addTransactions from "./tools/add_transactions"
import getFinances from "./tools/get_finances"
import searchTransactions from "./tools/search_transactions"
import updateTransaction from "./tools/update_transaction"

/**
 * ViteHub Finance's MCP server (okmcp, https://mcp.h3.dev), one file per tool. Each tool is a thin wrapper over the utils
 * the REST API uses, so an agent sees exactly what its user sees: never another member's private account.
 *
 * It's an OAuth 2.1 protected resource: a `401` points at `/.well-known/oauth-protected-resource/mcp`, which names
 * ViteHub Finance's Better Auth as the authorization server. A bearer is either a JWT ViteHub Finance issued for this `/mcp` or a personal
 * `fin_` API key; `identify` checks both. The resource is the request's origin plus `/mcp`, so the handler is built
 * once per origin.
 */
const servers = new Map<string, { mcp: ReturnType<typeof defineMcpHandler>; metadata: ReturnType<typeof protectedResourceMetadata> }>()

// Four tools: two read (get_finances, search_transactions), two write (update_transaction, add_transactions).
export const tools = [getFinances, searchTransactions, updateTransaction, addTransactions].map(reported)

export function mcpFor(origin: string) {
  let server = servers.get(origin)
  if (server) return server
  const resource = `${origin}/mcp`
  const metadata = protectedResourceMetadata({
    resource,
    authorizationServers: [`${origin}/api/auth`],
    // Not offline_access: okmcp refuses it here, as MCP's authorization spec asks; clients find it in Better Auth's metadata.
    scopesSupported: ["openid", "profile", "email"],
    // Clients show ViteHub Finance's name before they have an access token.
    resourceName: MCP_SERVER_INFO.title,
  })
  const mcp = defineMcpHandler({
    ...MCP_SERVER_INFO,
    description: "Household finance: accounts, holdings and staking, transactions, recurring payments, spending, and a cash-flow forecast.",
    websiteUrl: origin,
    icons: [{ src: `${origin}/favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"] }],
    instructions: MCP_INSTRUCTIONS,
    // MCP clients send no Origin; the access token, not the origin, is the boundary.
    origin: false,
    auth: {
      schemes: ["bearer"],
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
      validate: async (_credentials, event) => {
        // Modern clients name the JSON-RPC method in a header, which tells /mcp requests apart in the logs.
        const method = event.req.headers.get("mcp-method")
        if (method) useLogger(event).set({ mcp: { method, name: event.req.headers.get("mcp-name") ?? undefined } })
        const who = await identify(event)
        return who ? { subject: who.userId } : false
      },
    },
    tools,
  })
  server = { mcp, metadata }
  // The origin comes from the request's Host, which a Node host passes through as sent: keep only the latest few.
  if (servers.size >= 8) servers.delete(servers.keys().next().value!)
  servers.set(origin, server)
  return server
}

/**
 * Every tool call lands on the request's wide event: which tool, how long, and the reason it failed. Never its arguments
 * or result, which hold the household's transactions. A tool's `HTTPError` (no such transaction, a missing input) is a
 * failed result the model reads; okmcp would answer it as a protocol error without the message.
 */
function reported<T extends ToolDefinition<any>>(tool: T): T {
  const handler = tool.handler as (args: unknown, event: H3Event) => Promise<CallToolResult>
  return {
    ...tool,
    handler: async (args: unknown, event: H3Event) => {
      const startedAt = performance.now()
      const result = await handler(args, event).catch(failed)
      const log = useLogger(event)
      const isError = Boolean(result.isError)
      log.set({ mcp: { tool: tool.name, durationMs: Math.round(performance.now() - startedAt), isError } })
      if (isError)
        log.warn(`MCP tool ${tool.name} failed`, {
          mcp: {
            error: result.content
              .map((block) => ("text" in block ? block.text : ""))
              .join(" ")
              .slice(0, 500),
          },
        })
      return result
    },
  } as T
}

function failed(error: unknown): CallToolResult {
  // Anything else is a bug: okmcp answers "Internal error" and logs it, so no internal detail reaches the model.
  if (!HTTPError.isError(error)) throw error
  return { content: [{ type: "text", text: `[${error.status}] ${error.message}` }], isError: true }
}
