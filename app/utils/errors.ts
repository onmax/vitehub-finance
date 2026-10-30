import { activeLocale, i18n } from "../lib/i18n"

/**
 * The sentence an error carries for people: an h3 HTTPError's `statusText`/`message` (through ofetch's `data`), a
 * Better Auth error's `message`, or a thrown Error's. Falls back to `fallback` for anything else.
 */
export function errorText(error: unknown, fallback = translate('somethingWentWrongTryAgain')) {
  if (!error) return fallback
  if (typeof error === "string") return error
  const value = error as {
    code?: string
    data?: { code?: string; statusText?: string; message?: string; statusMessage?: string; data?: { code?: string; params?: Record<string, string | number>; issues?: Array<{ message?: string }> } }
    statusText?: string
    statusMessage?: string
    message?: string
  }
  const code = value.data?.data?.code ?? value.data?.code ?? value.code
  if (activeLocale.value !== "en" && code) {
    const key = AUTH_ERROR_KEYS[code] ?? code
    return i18n.global.te(key) ? translate(key, value.data?.data?.params) : fallback
  }
  const candidates = [
    value.data?.data?.issues?.[0]?.message,
    value.data?.statusText,
    value.data?.statusMessage,
    value.data?.message,
    value.statusMessage,
    value.statusText,
    value.message,
  ]
  const found = candidates.find((text) => typeof text === "string" && text.trim() && !/^\[(GET|POST|PATCH|DELETE|PUT)\]/.test(text))
  if (value.data && activeLocale.value !== "en") return fallback
  return found ?? fallback
}

/**
 * Whether the server refused it because the demo is read-only for its people (server/demo/read-only.ts): an /api
 * route's `data.code`, or Better Auth's `code`.
 */
export function isDemoLocked(error: unknown) {
  const value = error as { code?: string; data?: { code?: string; data?: { code?: string } } } | null
  return [value?.data?.data?.code, value?.data?.code, value?.code].some((code) => code === "errorNotAvailableInTheDemo" || code === "DEMO_LOCKED")
}

/** The HTTP status of a fetch error, if it has one. */
export function errorStatus(error: unknown): number | undefined {
  const value = error as { status?: number; statusCode?: number; response?: { status?: number } } | null
  return value?.status ?? value?.statusCode ?? value?.response?.status
}


const AUTH_ERROR_KEYS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "thatEmailAndPasswordDonTMatch",
  INVALID_PASSWORD: "authInvalidPassword", INVALID_EMAIL: "authInvalidEmail",
  USER_ALREADY_EXISTS: "thereSAlreadyAnAccountWithThisEmailSignIn",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "thereSAlreadyAnAccountWithThisEmailSignIn",
  PASSWORD_TOO_SHORT: "useAtLeast10Characters", PASSWORD_TOO_LONG: "authPasswordTooLong",
  SESSION_EXPIRED: "authSessionExpired", INVALID_TOKEN: "thisLinkHasExpired",
  TOKEN_EXPIRED: "thisLinkHasExpired", INVALID_OTP: "thatCodeDoesnTMatchCodesChangeEvery30Seconds",
  INVALID_TWO_FACTOR_COOKIE: "authSessionExpired", INVALID_BACKUP_CODE: "thatBackupCodeDoesnTWork",
  USER_NOT_FOUND: "authUserNotFound", TOO_MANY_REQUESTS: "authTooManyRequests",
  INVALID_CODE: "thatCodeDoesnTWork", YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION: "authNotAllowed",
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "authAlreadyMember",
  INVITATION_NOT_FOUND: "invitationNotFound", INVITATION_EXPIRED: "thisInvitationHasExpired",
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION: "authNotAllowed",
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: "youReTheOnlyOwnerSoYouCanTLeave",
  PASSKEY_AUTH_FAILED: "thePasskeyDidnTWork", PASSKEY_NOT_FOUND: "thePasskeyDidnTWork", FAILED_TO_VERIFY_AUTHENTICATION: "thePasskeyDidnTWork",
  FAILED_TO_VERIFY_REGISTRATION: "couldnTAddThePasskey",
  DEMO_LOCKED: "errorNotAvailableInTheDemo", HOUSEHOLD_NOT_EMPTY: "othersShareYourHouseholdLeaveItFirst",
  EMAIL_NOT_VERIFIED: "confirmYourEmailFirst",
  SIGN_UP_NEEDS_INVITATION: "signUpNeedsInvitation", SIGN_UP_WRONG_INVITATION: "signUpWrongInvitation",
}

export function providerErrorText(message: string | null | undefined, code?: string | null) {
  if (activeLocale.value === "en") return message ?? translate("providerUnavailable")
  return translate(code && i18n.global.te(code) ? code : "providerUnavailable")
}
