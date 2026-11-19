import { email } from "vite-hub/email"
import { useServerEnv } from "vite-hub/env"

/**
 * Sends from the configured sender, and throws when the send fails. A build without a provider uses the log driver
 * (nuxt.config.ts), so the message goes to the log.
 */
export async function sendEmail(message: { to: string; subject: string; text: string }) {
  const [error] = await email.send({ from: useServerEnv().finance.emailFrom, ...message })
  if (error) throw error
}
