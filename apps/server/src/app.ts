import { type Context, type ErrorHandler, Hono, type MiddlewareHandler } from "hono";
import { compress } from "hono/compress";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { Queryable } from "./db/db.ts";
import { failWith } from "./lib/api-error.ts";
import { limitWritesPerCaller } from "./lib/rate-limit.ts";
import { createMessageRoutes } from "./messages/routes.ts";
import { createRoomRoutes } from "./rooms/routes.ts";
import type { Broadcaster } from "./ws/broadcaster.ts";
import { isAllowedOrigin } from "./ws/origin-allowlist.ts";
import { createSocketRoutes } from "./ws/routes.ts";

/**
 * A tile server is the one origin the app reaches outside itself, and which of the two it
 * reaches is chosen when the front end is built rather than told to this process, so the
 * policy names the watercolour default and the OpenStreetMap alternative `.env.example`
 * offers instead. Everything else is served from here: the socket is same-origin, and the
 * build emits no inline script and no inline style.
 */
const tileServers = ["https://tiles.stadiamaps.com", "https://tile.openstreetmap.org"];

const contentSecurityPolicy = {
  defaultSrc: ["'self'"],
  connectSrc: ["'self'"],
  imgSrc: ["'self'", "data:", ...tileServers],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  // Neither of these falls back to `default-src`, so omitting them leaves an injected
  // `<base>` free to re-point every relative URL and a form free to post anywhere.
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

/** A year, which is the shortest max-age the HSTS preload lists accept. */
const strictTransportSecurity = "max-age=31536000; includeSubDomains";

/**
 * The tile server authenticates by `Referer`, so the default of `no-referrer` answers every
 * tile with 401 and leaves the map blank. This sends the origin the tiles are keyed to and
 * still never sends the path, which is the part that would say which room is open.
 */
const referrerPolicy = "strict-origin-when-cross-origin";

/** The same answer as `frame-ancestors 'none'`, for a browser too old to read the policy. */
const xFrameOptions = "DENY";

const policy = { contentSecurityPolicy, referrerPolicy, xFrameOptions };
const headersOverTls = secureHeaders({ ...policy, strictTransportSecurity });
const headersOverPlainHttp = secureHeaders({ ...policy, strictTransportSecurity: false });

/**
 * HSTS pins a host to https for a year, so sending it from a plain http origin would take
 * `localhost` away from every other project on the machine. It waits for the request that
 * proves TLS terminates here.
 *
 * Never mount this on `/ws`: an upgrade does not survive middleware that writes a header.
 */
export const secureResponseHeaders: MiddlewareHandler = (c, next) =>
  new URL(c.req.url).protocol === "https:" ? headersOverTls(c, next) : headersOverPlainHttp(c, next);

/**
 * The allowlist NFR-2 promises covers HTTP as well as the upgrade, and a browser attaches
 * `Origin` to every cross-origin write. A request carrying none is not a browser — curl,
 * the container's health check, any server-to-server caller — and is let through, where the
 * handshake refuses it, because there a browser always sends one.
 */
function refuseForeignWrites(allowedOrigins: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (c.req.method === "POST" && origin !== undefined && !isAllowedOrigin(origin, allowedOrigins)) {
      return failWith(c, "invalid_request", 403, `refused origin ${origin}`);
    }

    await next();
  };
}

/**
 * Anything the framework itself rejects before a handler runs — a body that is not JSON,
 * above all — arrives here as a client error and has to stay one. Only a genuine fault
 * becomes a 500, and neither answer repeats what the exception said. A fault is the one
 * case worth a stack: without it a request id leads an operator to a line of prose.
 */
const respondToFailure: ErrorHandler = (error, c) =>
  error instanceof HTTPException && error.status < 500
    ? failWith(c, "invalid_request", error.status, String(error))
    : failWith(c, "internal_error", 500, error.stack ?? String(error));

export interface AppDependencies {
  db: Queryable;
  /** Where a stored row goes once it is committed. The routes never touch a socket. */
  broadcaster: Broadcaster;
  allowedOrigins: readonly string[];
  /** Who a write is attributed to, and the monotonic clock its allowance refills on. */
  addressOf: (c: Context) => string;
  now: () => number;
}

/** Routes stay chained on one instance so `hc<AppType>` can infer them in the web app. */
export function createApp({ db, broadcaster, allowedOrigins, addressOf, now }: AppDependencies) {
  const limitWrites = limitWritesPerCaller({ addressOf, now });

  return (
    new Hono()
      // Scoped to the API namespace rather than the instance, because the instance also
      // carries `/ws`. The process mounts the same headers over the front end it serves.
      .use("/api/*", secureResponseHeaders)
      // Scoped to the API rather than the instance for the same reason as the headers: this
      // instance also carries `/ws`, and an upgrade does not survive a middleware that
      // writes one. The room list is the response worth this — the whole map in one body.
      .use("/api/*", compress())
      .use("/api/*", refuseForeignWrites(allowedOrigins))
      .get("/api/health", (c) => c.json({ status: "ok" as const }))
      .route("/api", createRoomRoutes({ db, broadcaster, limitWrites }))
      .route("/api", createMessageRoutes({ db, broadcaster, limitWrites }))
      .route("/", createSocketRoutes(allowedOrigins))
      // The API answers for its own namespace here, because the process wraps this app in
      // the static handler that serves the single-page shell for every other deep link.
      // Without this line an unknown endpoint would hand a client HTML with a 200.
      .all("/api/*", (c) => failWith(c, "not_found", 404))
      // Anywhere else, when there is no front end built to fall back to: still the shape a
      // client parses, never Hono's plain-text default.
      .notFound((c) => failWith(c, "not_found", 404))
      .onError(respondToFailure)
  );
}

export type AppType = ReturnType<typeof createApp>;
