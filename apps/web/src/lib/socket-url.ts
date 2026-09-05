/**
 * The socket is on the same origin as the page — Vite proxies it in development, the server
 * that hands out this bundle serves it in production — so there is nothing to configure.
 * The scheme has to follow the page's: a browser refuses a plain socket from a secure page.
 */
export function socketUrl(location: { protocol: string; host: string }): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;
}
