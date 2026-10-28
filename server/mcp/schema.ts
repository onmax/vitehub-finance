import { toStandardJsonSchema } from "@valibot/to-json-schema"
import type * as v from "valibot"

type JsonSchemaOptions = Parameters<ReturnType<typeof toStandardJsonSchema>["~standard"]["jsonSchema"]["input"]>[0]

/**
 * A valibot schema as an MCP tool's input, the way okmcp documents it (https://mcp.h3.dev/guide/tools): okmcp validates
 * every call with it before the handler runs, and lists the tool with the JSON Schema @valibot/to-json-schema makes of it.
 *
 * That conversion throws on what JSON Schema can't express (`check`, `finite`) unless told otherwise, and a throw fails
 * `tools/list` for every client. okmcp passes the converter no options, so this one converts with errorMode "ignore":
 * clients don't see those checks, and the validator still runs them. Conversion also stops at the first transformation
 * (`trim`, `toUpperCase`) or second schema in a pipe, so write a field as what clients see, then the app's validator:
 * `v.pipe(v.array(Row), v.description("…"), ImportRows)`. test/mcp/tools.test.ts converts every tool in throw mode, so
 * a check that would vanish from the listing fails there instead.
 */
export function toolInput<T extends v.GenericSchema>(schema: T) {
  const standard = toStandardJsonSchema(schema)
  const { jsonSchema } = standard["~standard"]
  const lenient = (options: JsonSchemaOptions): JsonSchemaOptions => ({ ...options, libraryOptions: { errorMode: "ignore", ...options.libraryOptions } })
  return {
    "~standard": {
      ...standard["~standard"],
      jsonSchema: { input: (options: JsonSchemaOptions) => jsonSchema.input(lenient(options)), output: (options: JsonSchemaOptions) => jsonSchema.output(lenient(options)) },
    },
  } satisfies typeof standard
}
