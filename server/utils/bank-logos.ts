import { kv } from "vite-hub/kv"
import type { Institution } from "@vitehub-finance/banking"

/**
 * Enable Banking's logo for banks by name and country, from the lists `banksIn` cached per country, stale ones too (a
 * logo rarely changes). Every linked bank's country was loaded to link it, so existing connections get theirs without
 * relinking. Returns a lookup; a bank whose country isn't cached gets null, and the UI falls back to shared/banks.ts.
 */
export async function bankLogos(banks: Array<{ institution: string | null; country: string | null }>) {
  const logos = new Map<string, string>()
  const countries = new Set(banks.flatMap((bank) => (bank.institution && bank.country ? [bank.country] : [])))
  for (const country of countries) {
    const [, cached] = await kv.get<{ at: number; banks: Institution[] }>(`banks:${country}`)
    for (const bank of cached?.banks ?? []) if (bank.logo?.startsWith("https://")) logos.set(`${country}:${bank.name}`, bank.logo)
  }
  return (bank: { institution: string | null; country: string | null }) =>
    (bank.institution && bank.country && logos.get(`${bank.country}:${bank.institution}`)) || null
}
