import { errorCode } from "./error-codes"
import { HTTPError } from "./http-error"
import { type H3Event } from "h3"
import * as v from "valibot"
import { CATEGORY_COLORS } from "#shared/categories"
import { ACCOUNT_KINDS } from "../databases/config"
import { isIsoDate } from "./dates"

/** The JSON body, checked against a valibot schema; a 400 that says what's wrong otherwise. */
export async function readInput<T extends v.GenericSchema>(event: H3Event, schema: T): Promise<v.InferOutput<T>> {
  const body = await event.req.json().catch(() => {
    throw new HTTPError({ status: 400, statusText: "Send a JSON body." })
  })
  const result = v.safeParse(schema, body)
  if (result.success) return result.output
  const issue = result.issues[0]
  const path = issue.path?.map((item) => String(item.key)).join(".")
  throw new HTTPError({ status: 400, statusText: `${path ? `${path}: ` : ""}${issue.message}`.replace(/[^\x20-\x7e]/g, ""), data: { code: errorCode(issue.message) === "providerUnavailable" ? "invalidField" : errorCode(issue.message), params: { field: path ?? "" } } })
}

/** A route parameter (`[id]`), decoded. */
export function param(event: H3Event, name = "id") {
  const value = event.context.params?.[name]
  if (!value) throw new HTTPError({ status: 400, statusText: `Missing ${name}.`, data: { code: "missingField", params: { field: name } } })
  return decodeURIComponent(value)
}

// ICU's ISO 4217 list (Node and Workers both have it); Intl.NumberFormat alone accepts any three letters.
let currencies: Set<string> | null = null
const supportedCurrency = (code: string) => {
  currencies ??= new Set(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [])
  return currencies.size ? currencies.has(code) : true
}

export const Minor = v.pipe(v.number(), v.integer("Use whole minor units (cents)."), v.safeInteger())
export const PositiveMinor = v.pipe(Minor, v.minValue(0))
export const Currency = v.pipe(
  v.string(),
  v.toUpperCase(),
  v.regex(/^[A-Z]{3}$/, "Use an ISO 4217 code like EUR."),
  v.check(supportedCurrency, "Unknown currency."),
)
export const IsoDate = v.pipe(v.string(), v.check(isIsoDate, "Use YYYY-MM-DD."))
export const Name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120))
export const Icon = v.pipe(v.string(), v.regex(/^i-lucide-[a-z0-9-]+$/, "Use a Lucide icon like i-lucide-target."))
export const Color = v.picklist(CATEGORY_COLORS)
export const Kind = v.picklist(ACCOUNT_KINDS)
export const Visibility = v.picklist(["private", "household"])
export const Permission = v.picklist(["view", "edit"])
