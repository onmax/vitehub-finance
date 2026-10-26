import { apiKeyClient } from "@better-auth/api-key/client"
import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { passkeyClient } from "@better-auth/passkey/client"
import { lastLoginMethodClient, magicLinkClient, organizationClient, twoFactorClient } from "better-auth/client/plugins"
import { createAuthClient } from "vite-hub/auth/vue"

// One Better Auth client with the same plugins as server/auth.ts. Pages read it as `useNuxtApp().$auth`.
export default defineNuxtPlugin(() => ({
  provide: {
    auth: createAuthClient({
      plugins: [
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
