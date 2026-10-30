/** "Chrome on macOS" from a user agent string; good enough to tell sessions and passkeys apart. */
export function describeAgent(userAgent: string | null | undefined) {
  if (!userAgent) return translate('unknownDevice')
  const ua = userAgent
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /curl\//.test(ua)
              ? "curl"
              : /node|undici/i.test(ua)
                ? translate('aScript')
                : translate('aBrowser')
  const system = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null
  return system ? translate('on2', { value1: browser, value2: system }) : browser
}

/** Whether a user agent is a phone or tablet, for the session list's icon. */
export const isMobileAgent = (userAgent: string | null | undefined) => /iPhone|iPad|iPod|Android|Mobile/.test(userAgent ?? "")
