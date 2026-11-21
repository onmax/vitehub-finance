import { email } from "vite-hub/email"
import { useServerEnv } from "vite-hub/env"

/** Sends through ViteHub Email (Resend or Cloudflare Email, chosen at build time in nuxt.config.ts). */
export async function send(message: { to: string; subject: string; text: string }) {
  const [error] = await email.send({ from: useServerEnv().finance.emailFrom, ...message })
  if (error) throw error
  return { sent: true as const }
}

/** A password sign-up confirms its address by email before anyone signs in with it (server/auth.ts). */
export const sendsEmail = true
