/**
 * This build has no Email provider (set FINANCE_EMAIL or RESEND_API_KEY at build time to add one). Messages go to the log,
 * and callers that have a link to share (invitations) show it on screen instead.
 */
export async function send(message: { to: string; subject: string; text: string }) {
  console.info(`[finance] Email not configured. Would send to ${message.to}: ${message.subject}\n${message.text}`)
  return { sent: false as const }
}
