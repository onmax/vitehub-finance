// The default database. Where it lives (D1 or a SQLite file) is per host, in nuxt.config.ts `vitehub.database`.
import { defineDatabase } from "vite-hub/database"
import { financeSetup } from "./setup"
import { budgetVersion } from "./budget-planning"
import { forecastPlan } from "./planning"
import { transactionReview } from "./review"
import {
  account,
  apikey,
  invitation,
  member,
  organization,
  passkey,
  session,
  twoFactor,
  user,
  verification,
} from "./auth"
import {
  alertDismissal,
  alertPreference,
  balanceSnapshot,
  budget,
  category,
  connection,
  dismissedSuggestion,
  financialAccount,
  goal,
  holding,
  stakingEvent,
  stakingPosition,
  householdSettings,
  recurring,
  rule,
  syncRun,
  transaction,
} from "./finance"
import {
  jwks,
  oauthAccessToken,
  oauthClient,
  oauthClientAssertion,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
} from "./oauth"

export * from "./auth"
export * from "./finance"
export * from "./oauth"
export * from "./setup"
export * from "./budget-planning"
export * from "./planning"
export * from "./review"

export default defineDatabase({
  schema: {
    financeSetup,
    budgetVersion,
    forecastPlan,
    transactionReview,
    account,
    apikey,
    invitation,
    member,
    organization,
    passkey,
    session,
    twoFactor,
    user,
    verification,
    jwks,
    oauthAccessToken,
    oauthClient,
    oauthClientAssertion,
    oauthClientResource,
    oauthConsent,
    oauthRefreshToken,
    oauthResource,
    balanceSnapshot,
    budget,
    category,
    connection,
    dismissedSuggestion,
    financialAccount,
    goal,
    alertPreference,
    alertDismissal,
    holding,
    stakingEvent,
    stakingPosition,
    householdSettings,
    recurring,
    rule,
    syncRun,
    transaction,
  },
})
