import { useUserSession } from "vite-hub/auth/vue"

let session: ReturnType<typeof create> | undefined

function create() {
  const { $auth } = useNuxtApp()
  // One session for the whole app, outside any component, so the route middleware and pages read the same state and
  // its watchers live as long as the app.
  return effectScope(true).run(() => useUserSession($auth))!
}

/** Better Auth's session (vite-hub/auth/vue). `ready` turns true once the first check answered. */
export function useAuthSession() {
  return (session ??= create())
}

/** Waits until the session is known, then says whether someone is signed in. */
export async function sessionKnown() {
  const { ready, loggedIn } = useAuthSession()
  if (!ready.value) await until(ready).toBe(true)
  return loggedIn.value
}

/** Signs out, forgets cached data, and goes to /login. */
export function useSignOut() {
  const { signOut } = useAuthSession()
  return async () => {
    await signOut()
    await navigateTo("/login")
    clearNuxtData()
  }
}
