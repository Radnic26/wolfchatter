/**
 * A browser always sends `Origin` on a WebSocket handshake, and this socket serves nothing
 * but the app's own pages, so an upgrade without one is refused rather than trusted. That
 * is the strict reading of the allowlist NFR-2 promises: a caller with no origin is not a
 * caller this server has anything to say to.
 */
export function isAllowedOrigin(origin: string | undefined, allowed: readonly string[]): boolean {
  return origin !== undefined && allowed.includes(origin);
}
