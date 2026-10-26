// Signed-out people go to /login (with where they were headed); signed-in people skip /login and /signup.
// /invite/<id> and /oauth handle both states themselves; /privacy and /terms are for everyone.
const PUBLIC = new Set(["/login", "/signup"])
const OPEN = [/^\/invite\//, /^\/oauth\/?$/, /^\/(privacy|terms)\/?$/]

export default defineNuxtRouteMiddleware(async (to) => {
  if (OPEN.some((pattern) => pattern.test(to.path))) return
  const loggedIn = await sessionKnown()
  if (PUBLIC.has(to.path)) {
    // The two-factor step happens while signed out, and a finished sign-in lands here with a `redirect`.
    if (loggedIn && to.query.step !== "2fa") return navigateTo(safeRedirect(to.query.redirect))
    return
  }
  if (!loggedIn) return navigateTo({ path: "/login", query: to.fullPath === "/" ? {} : { redirect: to.fullPath } })
})

