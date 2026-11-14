import { useLogger } from "evlog/nitro/v3"
import { defineMcpHooks } from "vite-hub/mcp"
import { identify } from "./utils/identity"

/**
 * ViteHub Finance's MCP server: one file per tool in server/mcp/tools, each a thin wrapper over the utils the REST API
 * uses, so an agent sees exactly what its user sees. A bearer is either an OAuth access token for `/mcp` or a personal
 * `fin_` API key; `identify` checks both, and the tools read the household member from it.
 */
export default defineMcpHooks({
  // API keys, for scripts that can't do OAuth.
  async verifyToken({ event, token }) {
    if (!token.startsWith("fin_")) return undefined
    const who = await identify(event)
    return who ? { user: { id: who.userId, name: who.name, email: who.email }, scopes: [], clientId: undefined, clientName: who.clientName } : undefined
  },
  // Every tool call lands on the request's wide event: which tool, how long, and the reason it failed. Never its
  // arguments or result, which hold the household's transactions.
  onToolCall({ name, event, durationMs, result }) {
    const log = useLogger(event)
    log.set({ mcp: { tool: name, durationMs: Math.round(durationMs), isError: result.isError } })
    if (result.isError)
      log.warn(`MCP tool ${name} failed`, { mcp: { error: result.content.map((block) => ("text" in block ? block.text : "")).join(" ").slice(0, 500) } })
  },
})
