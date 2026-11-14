import { defineHandler } from "h3"
import { createSource } from "vite-hub/source"
import { markdownRequest, pagePath, withoutLiveBlocks } from "../utils/docs-markdown"
import { docs } from "../utils/docs-source"

/** Answers a docs page asked for as Markdown with its file (server/utils/docs-markdown.ts); anything else goes on. */
export default defineHandler(async (event) => {
  if (event.req.method !== "GET" && event.req.method !== "HEAD") return
  const path = markdownRequest(event.url.pathname, event.req.headers.get("accept"))
  if (!path) return
  const reader = createSource(docs)
  const key = (await reader.keys()).find((file) => pagePath(file) === path)
  const headers = { "content-type": "text/markdown; charset=utf-8", vary: "accept" }
  if (!key) return new Response("Not found\n", { status: 404, headers })
  return new Response(withoutLiveBlocks(await reader.read(key)), { headers })
})
