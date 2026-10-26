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
        twoFactorClient({ onTwoFactorRedirect: () => navigateTo("/login?step=2fa") }),
        magicLinkClient(),
        apiKeyClient(),
        lastLoginMethodClient(),
        oauthProviderClient(),
      ],
    }),
  },
}))
