import { defineHandler } from "h3"
import { HTTPError } from "../utils/http-error"
import { crossSiteProblem } from "../utils/request-policy"

/** Cookie requests that change something must come from this origin, with JSON (`crossSiteProblem`). */
export default defineHandler((event) => {
  const problem = crossSiteProblem(event.req, event.url.origin)
  if (problem) throw new HTTPError({ status: problem.status, statusText: problem.message })
})
