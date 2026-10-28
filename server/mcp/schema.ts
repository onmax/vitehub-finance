import type * as v from "valibot"

type Json = Record<string, unknown>
type Node = { type: string; wrapped?: Node; item?: Node; entries?: Record<string, Node>; options?: unknown[]; pipe?: Node[]; default?: unknown } & Json

/**
 * JSON Schema for the valibot subset the tools use (objects and arrays of strings, numbers, booleans, picklists, optional and
 * nullable, with descriptions and simple limits). h3-mcp lists a tool's input from `~standard.jsonSchema` and
 * validates with valibot's own `~standard.validate`; ViteHub Finance doesn't pull in @valibot/to-json-schema for this.
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
    case "array":
      Object.assign(json, { type: "array", items: toJson(schema.item!) })
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
    else if (action.type === "min_length") json[json.type === "array" ? "minItems" : "minLength"] = requirement
    else if (action.type === "max_length") json[json.type === "array" ? "maxItems" : "maxLength"] = requirement
    else if (action.type === "regex") json.pattern = (requirement as RegExp).source
  }
  return json
}

/**
 * A valibot object schema that also carries its JSON Schema, as MCP tool input. nitro-mcp-toolkit converts valibot
 * input schemas itself with @valibot/to-json-schema, which throws on actions JSON Schema can't express (`toUpperCase`,
 * `check`, `finite`, `transform`) and fails `tools/list` for every client. Keep tool inputs to types, `regex`, lengths,
 * min/max values, `integer`, and descriptions, and run the app's stricter validators inside the handler
 * (tools/add_transactions.ts does).
 */
export function toolInput<T extends v.ObjectSchema<v.ObjectEntries, undefined>>(schema: T): T {
  const json = toJson(schema as unknown as Node)
  const converter = { input: () => json, output: () => json }
  return { ...schema, "~standard": { ...schema["~standard"], jsonSchema: converter } } as T
}
