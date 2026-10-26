// A small XML reader for broker statements. Workers have no DOMParser, and IBKR's Flex XML is plain: elements with
// attributes, a little text, no namespaces. It reads that strictly (a stray `<` or an unclosed element throws) and
// skips the prolog, comments, and doctype.

export interface XmlElement {
  name: string
  attributes: Record<string, string>
  children: XmlElement[]
  /** The text directly inside, entities decoded and trimmed. */
  text: string
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

/** `&amp;`, `&#233;`, `&#xE9;` to their characters; anything else stays as written. */
export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] !== "#") return ENTITIES[entity.toLowerCase()] ?? whole
    const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

// One token at a time, from where the last one ended: a comment, CDATA, a prolog or doctype, a closing tag, an opening
// (or self-closing) tag with its attributes, or text.
const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<[?!][\s\S]*?>|<\/\s*([^\s<>/]+)\s*>|<([^\s<>/!?]+)((?:\s+[^\s<>/=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|[^<]+/y
const ATTRIBUTE = /([^\s<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/** The document as a tree under a `#document` element. Throws a SyntaxError on anything it can't read. */
export function parseXml(xml: string): XmlElement {
  const document: XmlElement = { name: "#document", attributes: {}, children: [], text: "" }
  const stack = [document]
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < xml.length) {
    const at = TOKEN.lastIndex
    const match = TOKEN.exec(xml)
    if (!match) throw new SyntaxError(`Unreadable XML at character ${at}: ${xml.slice(at, at + 40)}`)
    const [token, cdata, closing, opening, attributes = "", selfClosing] = match
    const parent = stack.at(-1)!
    if (closing !== undefined) {
      if (stack.length === 1 || parent.name !== closing) throw new SyntaxError(`Unexpected </${closing}> at character ${at}.`)
      parent.text = parent.text.trim()
      stack.pop()
    } else if (opening !== undefined) {
      const element: XmlElement = { name: opening, attributes: {}, children: [], text: "" }
      for (const [, name, double, single] of attributes.matchAll(ATTRIBUTE)) element.attributes[name!] = decodeEntities(double ?? single ?? "")
      parent.children.push(element)
      if (!selfClosing) stack.push(element)
    } else if (cdata !== undefined) parent.text += cdata
    else if (!token.startsWith("<")) parent.text += decodeEntities(token)
  }
  if (stack.length > 1) throw new SyntaxError(`<${stack.at(-1)!.name}> is never closed.`)
  return document
}

/** Every element called `name` under `element`, at any depth, in document order. */
export function findAll(element: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = []
  for (const child of element.children) {
    if (child.name === name) found.push(child)
    found.push(...findAll(child, name))
  }
  return found
}

/** The first element called `name` under `element`, at any depth. */
export function find(element: XmlElement, name: string): XmlElement | undefined {
  for (const child of element.children) {
    if (child.name === name) return child
    const deeper = find(child, name)
    if (deeper) return deeper
  }
  return undefined
}
