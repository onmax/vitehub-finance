import { HTTPError as H3HTTPError } from "h3"
import { errorCode } from "./error-codes"

/** Keep diagnostics in English for API/MCP callers; browser toasts use the stable code. */
export class HTTPError extends H3HTTPError {
  constructor(options: Exclude<ConstructorParameters<typeof H3HTTPError>[0], Error>) {
    super({ ...options, data: options.data ?? { code: errorCode(options.message ?? options.statusText ?? "") } })
  }
}
