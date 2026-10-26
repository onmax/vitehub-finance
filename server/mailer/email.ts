import { email } from "vite-hub/email/server"
import { useServerEnv } from "#vitehub/env/server"

/** Sends through ViteHub Email (Resend or Cloudflare Email, chosen at build time in nuxt.config.ts). */
export async function send(message: { to: string; subject: string; text: string }) {
  await email.send({ from: useServerEnv().joxi.emailFrom, ...message })
  return { sent: true as const }
}
