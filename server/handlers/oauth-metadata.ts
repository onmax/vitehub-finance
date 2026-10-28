import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider"
import { defineHandler } from "h3"
import { mcpFor } from "../mcp"
import { authFor } from "../utils/identity"

// Browser-based MCP clients read the protected resource document from another origin; okmcp's handler sends no CORS.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400",
}

/**
 * OAuth discovery for MCP clients, at the bare and path-suffixed well-known URLs they try: RFC 9728 protected
 * resource metadata for `/mcp`, then RFC 8414 / OpenID metadata for the issuer (`<origin>/api/auth`, Better Auth's
 * OAuth provider). Registered in nuxt.config.ts `serverHandlers`.
 */
export default defineHandler(async (event) => {
  const path = event.url.pathname
  if (path.startsWith("/.well-known/oauth-protected-resource")) {
    if (event.req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
    const response = await mcpFor(event.url.origin).metadata.fetch(event.req)
    for (const [name, value] of Object.entries(CORS)) response.headers.set(name, value)
    return response
  }
  const auth = authFor(event)
  if (path.startsWith("/.well-known/openid-configuration")) return oauthProviderOpenIdConfigMetadata(auth)(event.req)
  return oauthProviderAuthServerMetadata(auth)(event.req)
})
