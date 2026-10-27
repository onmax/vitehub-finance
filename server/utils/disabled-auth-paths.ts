/**
 * Better Auth endpoints that answer 404 (`disabledPaths` in server/auth.ts).
 *
 * `/token` is the JWT plugin's session-to-JWT endpoint, which nothing in ViteHub Finance needs.
 *
 * A household is an organization, but who's in it and what it holds change only through ViteHub Finance's own
 * endpoints: `DELETE /api/household/members/:userId` and `POST /api/household/leave` move the person's accounts and
 * connections out with them (`moveOut`, server/utils/membership.ts), and deleting your account erases the household
 * only once nobody else is in it. Better Auth's own versions would leave a partner's shared accounts, and the
 * connections that keep syncing them, behind in the old household. The app calls only invitation endpoints
 * (`$auth.organization.*` in app/), so every other organization change is off.
 */
export const DISABLED_AUTH_PATHS = [
  "/token",
  "/organization/create",
  "/organization/update",
  "/organization/delete",
  "/organization/set-active",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/leave",
]
