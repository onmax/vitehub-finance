/** Whether `JOXI_ALLOWED_EMAILS` (comma-separated, case-insensitive) lets this email sign up. Empty allows everyone. */
export function isAllowedEmail(email: string, allowed: string) {
  const list = allowed
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  return list.length === 0 || list.includes(email.trim().toLowerCase())
}
