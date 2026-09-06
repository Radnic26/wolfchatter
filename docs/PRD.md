# Wolfchatter — Technical PRD

| | |
|---|---|
| Status | v1, written before any code (2026-09-04) |
| Author | Radu Niculae |
| Audience | The AI tooling and any teammate kicking off the implementation |
| Companions | `architecture.md` (decisions in depth, dependency budget), `delivery-plan.md` (PR sequence) |

## 1. Summary

Wolfchatter is a real-time chat on a map. A user clicks anywhere on a Leaflet map, a pin appears and a chatroom opens in a panel on the right. Clicking an existing pin switches the panel to that room. Anyone can post messages under a chosen username; rooms and messages survive reloads and are delivered live to everyone viewing the same room.

**Goal:** one complete, polished end-to-end path (click → pin → panel → post → persisted → live in other browsers), runnable from a fresh clone with one command (`./start-wolfchatter`, a short wizard where Enter accepts every default), plus the artefacts the brief asks for: this PRD, an infra and cost estimate, a committed self-review configuration and report (including a deploy-readiness audit), and the AI configuration used.

**Out of scope:** accounts and authentication, private rooms, moderation, editing or deleting messages, media, presence and typing indicators, push notifications, i18n, horizontal scaling (designed for, not built), a native mobile app (structured for, not built).

## 2. Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-1 | Map layout matching the reference | Browser title "Wolfchatter". Leaflet map filling the viewport under the application header, center `[46.7712, 23.6236]`, zoom 5, watercolor tiles, zoom controls top-left, pin markers in the brand ink and the open room's in the accent (the reference's default blue is replaced by the palette of `brand.md`, and its 25×41 icon by a 44 px target for FR-10). Empty-state panel top-right: "Click on the map to start a chat". |
| FR-2 | Create a pin on click | One click creates a room at that lat/lng, adds a marker immediately and opens its panel. Rooms are named "Chatroom 1", "Chatroom 2"…, unique even under concurrent creation. |
| FR-3 | Select an existing pin | Clicking a marker switches the panel: title, message history, highlighted marker. Clicking the map while a room is open creates a new room. |
| FR-4 | Post messages | Username input ("write your user name here"), message input ("write message here"), Submit; Enter submits. Username 1–32 chars, message 1–500 chars, trimmed; empty input gets an inline error and is never sent. The username is remembered per browser. |
| FR-5 | Message display | Username, text and a `<time>` stamp formatted `dd/MM/yyyy HH:mm` in local time (mockup: `01/02/2017`). Ordered by the sequence the server accepted them in, never by time; auto-scroll to newest unless the user scrolled up. |
| FR-6 | Persistence between sessions | Rooms and messages are stored server-side; after a reload or from another browser every room and its history is intact. |
| FR-7 | Real-time delivery ("Feeling Lucky") | A posted message appears in every client viewing that room within ~1 s; a new room appears on every map. After a dropped connection the client reconnects and back-fills what it missed. |
| FR-8 | Robustness | Bad input (invalid JSON, oversized payloads, unknown room, malformed coordinates) gets a 4xx with a safe body, never a crash or stack trace. A double-click does not create two rooms for one gesture; a retried message with the same id is stored once. |
| FR-9 | Accessibility baseline | Keyboard, end to end: a skip link past the pins, every marker focusable and opened with Enter or Space, focus moved to the panel heading when the room on show changes and left where it is when a message arrives, Enter sends, Escape puts the sheet down and then closes the room and hands the keyboard back to the map. Nothing the collapsed sheet hides is focusable. Screen readers: labelled `role="log"` live region, labelled inputs, errors and connection state announced. Reduced motion respected, the map's own zoom, fade and pan included. |
| FR-10 | Responsive and mobile friendly | Mobile-first layout, breakpoint 768 px. Below it the room panel is a bottom sheet over the map — collapsed to a peek with the room name and newest message, expandable to ~70% height — so the map stays visible; above it, the two-column reference layout. Touch targets ≥ 44×44 px, markers included. `dvh` never `vh`, inputs ≥ 16 px, safe-area insets honoured. No horizontal scroll at any width, verified at 360×640 and 390×844. A pan gesture on the map never creates a room: a movement and duration threshold separates tap from pan. |

## 3. Non-functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| NFR-1 | Performance: the app feels instant | Lighthouse Performance ≥ 90 on the production build; initial JS ≤ 250 KB gzipped including Leaflet; map click → panel visible < 100 ms; own messages rendered optimistically; list endpoints p95 < 50 ms at the assumed data size; message traffic never re-renders the marker layer. |
| NFR-2 | Security: hardened by default | Every input Zod-validated; parameterised SQL only; Origin allowlist on HTTP and WS; per-IP and per-connection rate limits; 16 KiB payload cap; CSP, `nosniff`, `frame-ancestors`, HSTS behind TLS; generic error bodies; `npm audit` clean; no secrets in the repo; non-root Docker image. |
| NFR-3 | Scalability: headroom now, a path later | Load test at 10× the assumed scale (500 open sockets, 50 messages/s): no errors, p95 broadcast latency < 250 ms; the breaking point is measured and recorded. Stateless HTTP and the `Broadcaster` interface mean a second instance needs a pub/sub, not a redesign. |
| NFR-4 | Deploy-readiness audit | Before the final README, an audit driven by Claude against the running app: penetration-style security checks, load and soak tests, a performance and optimization pass, plus the code review. "No repro, no finding": every finding has a failing test, a command or a measurement. Findings are proposals: the author reads and approves each one before any fix; the committed report records the decision (approved and fixed / declined with reason / open question). |

## 4. Assumptions and ambiguities surfaced

- **The reference tile URL is dead** (`tile.stamen.com` → HTTP 404 since Stamen moved to Stadia Maps in 2023; verified 2026-09-04) and is plain `http://`. We keep the exact center, zoom and watercolor style through Stadia's endpoint, which needs no key: it authenticates on `Referer`, so it serves any host that sends one and refuses only a request carrying none (measured 2026-09-06). That is what the server's `Referrer-Policy` guarantees, so there is nothing to configure and no alternative tile server to offer.
- **The CodePen contains only the map**; the panel is designed from the mockup.
- **Identity is a free-text username** per browser, sent with every message. No auth: the brief never asks for it and building it would be over-engineering.
- **"Feeling Lucky" is treated as expected** for a senior submission; the app still works with the socket down (HTTP persists everything, live updates degrade gracefully).
- **Pin position is the click point**; drag-to-adjust and confirm-on-create are future work.
- **Scale:** ~500 monthly users, ~50 concurrent connections, ~50,000 messages per month, unlimited retention, all rooms loaded at start (a few hundred). This sizes the single-instance design and the cost estimate; multi-instance fan-out and a viewport query are documented next steps.
- **Delivery guarantee:** at-least-once with client-generated idempotent ids and backfill from the last seen message, so short disconnections lose nothing; duplicates are dropped by id.
- **Deadline:** Monday 2026-09-07 morning; scope sized for three focused days. These assumptions went to Wolfpack as questions with defaults (§7); answers update this section.

## 5. Technical decisions

**Guiding rule: every dependency earns its place.** A package stays when it removes real work or risk and goes when a built-in or a few dozen lines of stable code do the same job: 11 runtime and 19 development packages (6 of them type definitions). `architecture.md` §1 records each one with the alternative considered and the reason, plus what was replaced by built-ins and what was evaluated and not used.

**Stack.** Node 24 LTS running TypeScript natively (no server build step), Hono 4 with the built-in WebSocket support of its Node adapter on `ws`, Zod 4 schemas shared by server and client, React 19.2 + Vite 8, Leaflet 1.9 + react-leaflet 5, Tailwind 4, TypeScript 7, Biome for lint and format, Vitest 5, npm workspaces, Docker on `node:24-alpine`. Node rather than Bun because the job description says Node; Hono rather than Fastify or NestJS because three packages cover routing, validation, WebSocket and end-to-end types with HTTP-free tests.

**Data model.** PostgreSQL, no ORM. Without `DATABASE_URL` the server runs PGlite (Postgres in WASM, data in `apps/server/data/pg`, nothing to install); with it, real Postgres (`docker compose`, production). Both drivers sit behind a five-line `Db` interface. Two tables: `rooms(id uuid, number identity, name, lat, lng, created_at)` and `messages(id uuid, seq identity, room_id, username, body, created_at)` with an index on `(room_id, seq)`. Migrations are numbered SQL files applied at boot by a small runner; rows are validated with Zod on the way out, so types need no ORM. The identity column names rooms without a count-then-insert race; client-generated message ids make retries idempotent; ordering is the `seq` identity column, because messages posted inside one clock tick share `created_at` and a tie broken on a random id both shuffles the history and hides a message from the backfill cursor.

**Real-time delivery.** Writes go over HTTP (`POST /api/rooms`, `POST /api/rooms/:id/messages`: validated, rate-limited, testable without a socket); the WebSocket carries only `subscribe`/`unsubscribe`/`ping` from the client and `room:created`/`message:created`/`pong`/`error` from the server, all Zod-validated. Insert first, respond, then broadcast to the room (sender included; the client de-duplicates by id). Heartbeat every 30 s, slow consumers dropped, `Origin` allowlist on upgrade, 16 KiB payload cap, per-connection and per-IP limits. Clients reconnect with jittered backoff and back-fill with `?after=<lastSeenId>`. Fan-out sits behind a `Broadcaster` interface: in-process now, Postgres `LISTEN/NOTIFY` or Redis pub/sub when a second instance exists.

**State management.** One framework-free store in `packages/shared` holds rooms, messages per room, connection status and the username; the socket feeds it live, HTTP feeds it on load and on reconnect (backfill). React subscribes with `useSyncExternalStore`; no query-cache library, because the socket is the source of truth. The selected room lives in the URL (`?room=<id>`). The form uses `useActionState` and `useOptimistic`; the username sits behind a storage adapter (localStorage now, native storage later).

**Quality gates.** Every change is a branch and a pull request; CI runs Biome (lint + format), `tsc --noEmit` per workspace, Vitest with 100% coverage thresholds (statements, branches, functions, lines) over `packages/shared`, `apps/server/src` and `apps/web/src`, the Vite build, `npm audit` and the Docker build; versioned git hooks run the same checks locally, with no hook packages. Coverage-ignore comments are not allowed. Self-review: an independent reviewer agent in a fresh context plus the built-in `/code-review`. Findings are proposals, never patches: each one is presented with its reproduction, understood and approved by the author before a fix is written, and the committed report records the decision. The audit of NFR-4 runs as its own phase against the running app with the same gate and rule of evidence (`architecture.md` §8). Two rules bind the AI tooling, encoded in `CLAUDE.md` and the reviewer and audit configurations: ask, never assume (anything unclear becomes a question to the author while the unambiguous part proceeds); propose, never apply.

**First run.** `./start-wolfchatter` (also `npm start`) is a dependency-free wizard on `node:readline`: it checks the Node version, asks two questions with defaults (database: embedded PGlite, Docker Postgres or an own URL; port), writes `.env` locally — including this machine's addresses on the network, so the app opens on a phone on the same Wi-Fi — (mode 0600, git-ignored; only `.env.example` is committed and nothing in it is secret), installs, starts and prints the URL. Enter accepts each default; `--yes` or no TTY skips the questions, which is what CI and `npm run dev` rely on. Anything typed as a secret is masked and never logged.

**Mobile readiness.** `packages/shared` (schemas, protocol, store, client) has no DOM dependency; the origin allowlist and storage adapter already accommodate a native shell. Future work, none of it part of this deliverable: PWA manifest (hours, hand-written) → Capacitor wrapper (days) → Expo app reusing the shared package (weeks).

## 6. Delivery and verification

Twelve small pull requests in this order: PRD → AI configuration → scaffold → shared schema and server → map and pins → messages → real-time → accessibility → infra estimate → self-review and fixes → audit (security, load, performance) and fixes → README and final report (`delivery-plan.md`).

Eighteen were merged: the twelve rows took fourteen, because the brand system and a correction to the wordmark were their own, and four came after them. Those four are what the check below produced. Running the app on a second machine and on a phone found five things no test could — a Node version that stopped `npm install` before anything started, a network address that the write gate and the socket upgrade both refused, a database volume from an earlier run that locked the app out of its own database, a map that never re-measured its container when a phone's viewport grew, and a server that knew the address to open on a phone and never printed it. The sixth is an improvement rather than a repair: the collapsed sheet now opens from anywhere on its row instead of from the chevron alone.

**End-to-end check before submission:** fresh clone → `./start-wolfchatter` with Enter on every prompt (then, separately, `npm run dev` and `docker compose up --build`) → two browsers → click the map → pin and "Chatroom 1" panel in both → post from each → messages appear live in both → reload → everything persists → click the other marker → panel switches → `npm run check` green.

## 7. Open questions sent to Wolfpack

Each question fixes one design decision; until answered, the implementation uses the matching assumption from §4.

1. Expected scale (concurrent users, rooms, messages) → single instance with in-process fan-out vs. multi-instance with LISTEN/NOTIFY or Redis; cost sizing.
2. History and retention → full load vs. cursor pagination (200); retention job or not.
3. Delivery guarantee on reconnect → at-least-once with dedupe vs. at-most-once with reload.
4. Scope and access → is "Feeling Lucky" evaluated; public rooms with username only.
5. Geographic scope → all rooms at start vs. viewport bounding-box query.
6. Evaluation environment and deadline → local run vs. hosted link; Monday morning cutoff.
