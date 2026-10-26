import { describe, expect, it } from "vitest"
import { decodeEntities, find, findAll, parseXml } from "../src/index.ts"

describe("parseXml", () => {
  it("reads elements, attributes in either quote, text, and self-closing tags", () => {
    const document = parseXml(`<?xml version="1.0"?>
      <!-- a comment -->
      <FlexStatementResponse timestamp='26 October, 2026 02:58 PM EDT'>
        <Status>Fail</Status>
        <ErrorCode>1020</ErrorCode>
        <Empty a="1" b = "two words" />
      </FlexStatementResponse>`)
    const response = find(document, "FlexStatementResponse")!
    expect(response.attributes).toEqual({ timestamp: "26 October, 2026 02:58 PM EDT" })
    expect(response.children.map((child) => [child.name, child.text])).toEqual([
      ["Status", "Fail"],
      ["ErrorCode", "1020"],
      ["Empty", ""],
    ])
    expect(find(document, "Empty")!.attributes).toEqual({ a: "1", b: "two words" })
  })

  it("decodes entities in attributes and text, and keeps CDATA as is", () => {
    const document = parseXml(`<a title="S&amp;P 500 &quot;ETF&quot; &#233;&#xE9;">1 &lt; 2<![CDATA[ & <raw> ]]></a>`)
    const element = find(document, "a")!
    expect(element.attributes.title).toBe('S&P 500 "ETF" éé')
    expect(element.text).toBe("1 < 2 & <raw>")
    expect(decodeEntities("&unknown; &#0;")).toBe("&unknown; &#0;")
  })

  it("finds elements at any depth, in order, by exact name", () => {
    const document = parseXml("<r><Positions><Position id='1'/><x><Position id='2'/></x></Positions></r>")
    expect(findAll(document, "Position").map((element) => element.attributes.id)).toEqual(["1", "2"])
    expect(findAll(document, "Positions")).toHaveLength(1)
    expect(find(document, "Missing")).toBeUndefined()
  })

  it("refuses broken documents", () => {
    expect(() => parseXml("<a><b></a>")).toThrow(SyntaxError)
    expect(() => parseXml("<a>")).toThrow(/never closed/)
    expect(() => parseXml("<a x=1/>")).toThrow(/Unreadable/)
    expect(() => parseXml("</a>")).toThrow(SyntaxError)
  })
})
