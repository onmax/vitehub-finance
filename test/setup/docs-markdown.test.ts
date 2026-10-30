import { describe, expect, it } from "vitest"
import { markdownRequest, pagePath, withoutLiveBlocks } from "../../server/utils/docs-markdown"

describe("docs as Markdown", () => {
  it("answers a page's .md URL, or the page asked for with Accept: text/markdown", () => {
    expect(markdownRequest("/docs/guides/setup.md", null)).toBe("/docs/guides/setup")
    expect(markdownRequest("/docs/guides/setup", "text/markdown, text/plain;q=0.9")).toBe("/docs/guides/setup")
    expect(markdownRequest("/docs.md", null)).toBe("/docs")
    expect(markdownRequest("/docs/index.md", null)).toBe("/docs")
    expect(markdownRequest("/docs/guides/setup", "text/html,application/xhtml+xml")).toBeNull()
    expect(markdownRequest("/api/content/docs.md", null)).toBeNull()
    expect(markdownRequest("/docsy.md", null)).toBeNull()
  })

  it("finds the file by the URL its page has", () => {
    expect(pagePath("1.guides/0.setup.md")).toBe("/docs/guides/setup")
    expect(pagePath("2.providers/16.stripe.md")).toBe("/docs/providers/stripe")
    expect(pagePath("0.index.md")).toBe("/docs")
  })

  it("leaves out the setup guide's live blocks, and nothing else", () => {
    const page = "Intro.\n\n::setup-prompt\n::\n\n::steps\n### Step\n:::setup-status{step=\"app\"}\n:::\n\nDo it.\n::\n"
    expect(withoutLiveBlocks(page)).toBe("Intro.\n\n::steps\n### Step\nDo it.\n::\n")
  })
})
