---
paths:
  - "apps/server/**/*.ts"
---

# Server rules

- Every route declares its schema through `zValidator` for body, params and query, and a `response` schema wherever the contract matters. Handlers are `async` and return the response; a `.then()` chain costs `hc` its types.
- Errors are `{ error: { code, requestId } }` with the right status and nothing else: no message from the exception, no stack trace, no SQL. Log the detail server-side against the request id.
- Database access lives in `apps/server/src/db/`. Queries are parameterised (`$1`, `$2`) through the `Db` interface, never built by string concatenation, and rows are parsed with the shared Zod schemas on the way out. A schema change is a new numbered migration file; a migration that has already run is immutable.
- The WebSocket hub checks `Origin` on upgrade, caps `maxPayload` at 16 KiB, heartbeats every 30 s, drops a consumer that falls behind, and broadcasts only after the row is committed.
- Rate limits are per IP on HTTP and per connection on the socket, held in memory behind a token bucket.
- The environment is parsed with Zod at boot and the process exits on a bad value, so no code downstream guards against a missing variable.
