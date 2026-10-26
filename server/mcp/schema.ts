import type * as v from "valibot"

type Json = Record<string, unknown>
type Node = { type: string; wrapped?: Node; entries?: Record<string, Node>; options?: unknown[]; pipe?: Node[]; default?: unknown } & Json

/**
 * JSON Schema for the valibot subset the tools use (objects of strings, numbers, booleans, picklists, optional and
 * nullable, with descriptions and simple limits). h3-mcp lists a tool's input from `~standard.jsonSchema` and
 * validates with valibot's own `~standard.validate`; Joxi doesn't pull in @valibot/to-json-schema for this.
 */
function toJson(schema: Node): Json {
  const json: Json = {}
  switch (schema.type) {
    case "object": {
      const properties: Record<string, Json> = {}
      const required: string[] = []
      for (const [key, entry] of Object.entries(schema.entries ?? {})) {
        properties[key] = toJson(entry)
        if (entry.type !== "optional") required.push(key)
      }
      Object.assign(json, { type: "object", properties, additionalProperties: false }, required.length ? { required } : {})
      break
    }
    case "optional":
      Object.assign(json, toJson(schema.wrapped!), schema.default !== undefined ? { default: schema.default } : {})
      break
    case "nullable":
      return { anyOf: [toJson(schema.wrapped!), { type: "null" }] }
    case "picklist":
      Object.assign(json, { type: "string", enum: schema.options })
      break
    case "string":
    case "number":
    case "boolean":
      json.type = schema.type
      break
    default:
      throw new Error(`No JSON Schema for valibot type ${schema.type}`)
  }
  for (const action of schema.pipe?.slice(1) ?? []) {
    const requirement = action.requirement
    if (action.type === "description") json.description = action.description
    else if (action.type === "integer") json.type = "integer"
    else if (action.type === "min_value") json.minimum = requirement
    else if (action.type === "max_value") json.maximum = requirement
    else if (action.type === "min_length") json.minLength = requirement
    else if (action.type === "max_length") json.maxLength = requirement
    else if (action.type === "regex") json.pattern = (requirement as RegExp).source
  }
  return json
}

/** A valibot object schema that also carries its JSON Schema, as MCP tool input. */
export function toolInput<T extends v.ObjectSchema<v.ObjectEntries, undefined>>(schema: T): T {
  const json = toJson(schema as unknown as Node)
  const converter = { input: () => json, output: () => json }
  return { ...schema, "~standard": { ...schema["~standard"], jsonSchema: converter } } as T
}
