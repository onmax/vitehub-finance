// ViteHub's generated Cloudflare middleware (.vitehub/nitro/*) imports `cloudflare:workers`. Declared here instead of
// referencing @cloudflare/workers-types, whose global Request would replace the standard one across the project.
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>
}
