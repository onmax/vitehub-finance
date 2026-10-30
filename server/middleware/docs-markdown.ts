import { defineHandler } from "h3"
import { useStorage } from "nitro/storage"
import { markdownRequest, pagePath, withoutLiveBlocks } from "../utils/docs-markdown"

/** Answers a docs page asked for as Markdown with its file (server/utils/docs-markdown.ts); anything else goes on. */
export default defineHandler(async (event) => {
  if (event.req.method !== "GET" && event.req.method !== "HEAD") return
  const path = markdownRequest(event.url.pathname, event.req.headers.get("accept"))
  if (!path) return
  const assets = useStorage("assets:docs")
  const key = (await assets.getKeys()).map((stored) => stored.replaceAll(":", "/")).find((file) => file.endsWith(".md") && pagePath(file) === path)
  const headers = { "content-type": "text/markdown; charset=utf-8", vary: "accept" }
  if (!key) return new Response("Not found\n", { status: 404, headers })
  return new Response(withoutLiveBlocks(String((await assets.getItem<string>(key.replaceAll("/", ":"))) ?? "")), { headers })
})
