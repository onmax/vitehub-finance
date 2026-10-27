import { activeLocale } from "../lib/i18n"
import { apiKeyClient } from "@better-auth/api-key/client"
import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { passkeyClient } from "@better-auth/passkey/client"
import { inferAdditionalFields, lastLoginMethodClient, magicLinkClient, organizationClient, twoFactorClient } from "better-auth/client/plugins"
import { createAuthClient } from "vite-hub/auth/vue"
import { CURRENCIES } from "#shared/money"

// One Better Auth client with the same plugins as server/auth.ts. Pages read it as `useNuxtApp().$auth`.
export default defineNuxtPlugin(() => ({
  provide: {
    auth: createAuthClient({
      fetchOptions: { onRequest: (context) => { context.headers.set("X-Finance-Language", activeLocale.value) } },
      plugins: [
        inferAdditionalFields({ user: { language: { type: ["en", "es", "fr", "de", "pt"], required: false }, displayCurrency: { type: [...CURRENCIES], required: false } } }),
        organizationClient(),
        passkeyClient(),
        // /oauth and /invite/<id> ask for the code inline, so the agent's consent or the invitation isn't lost.
        twoFactorClient({
          onTwoFactorRedirect: () => {
            if (/^\/(oauth\/?$|invite\/)/.test(window.location.pathname)) return
            void navigateTo("/login?step=2fa")
          },
        }),
        magicLinkClient(),
        apiKeyClient(),
        lastLoginMethodClient(),
        oauthProviderClient(),
      ],
    }),
  },
}))
