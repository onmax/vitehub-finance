// Keyset cursors for lists ordered by date desc, id desc: base64url of `date|id`. Pure: tests import it.
import { isIsoDate } from "./dates"

export interface Cursor {
  date: string
  id: string
}

const toBase64Url = (text: string) => btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const fromBase64Url = (text: string) => atob(text.replace(/-/g, "+").replace(/_/g, "/"))

export const encodeCursor = (cursor: Cursor) => toBase64Url(`${cursor.date}|${cursor.id}`)

/** Null for anything that isn't a cursor this server made, so a bad one restarts the list instead of failing. */
export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value || value.length > 200) return null
  try {
    const text = fromBase64Url(value)
    const split = text.indexOf("|")
    const date = text.slice(0, split)
    const id = text.slice(split + 1)
    if (split < 0 || !isIsoDate(date) || !/^[\w-]{1,100}$/.test(id)) return null
    return { date, id }
  } catch {
    return null
  }
}
