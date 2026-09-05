# Wolfchatter — Architecture and technical decisions

Companion to `PRD.md` (which stays within its two-page budget). This document holds the detail: the dependency assessment, every decision with the alternative it beat, the data model, the real-time protocol, the quality policy and the mobile path. Versions were checked against the npm registry on 2026-09-04.

## 1. Dependency assessment

**How we decided.** Every package is one more thing to keep current, so each one has to earn its place: it stays when it removes real work or real risk, and it goes when a built-in or a few dozen lines of stable code do the same job. The three tables below record what was kept, what was replaced and what was evaluated and not used, with the alternative and the reason in each case, so the choice is auditable rather than habitual.

### Kept (11 runtime, 19 development)

| Package | Version | What it does here | Alternative considered | Why kept |
|---|---|---|---|---|
| hono | 4.13.5 | HTTP routing, request validation glue, typed client `hc<AppType>` | bare `node:http`, Fastify, NestJS, Express | three packages cover routing, validation, WebSocket and end-to-end types; HTTP-free tests with `app.request()` |
| @hono/node-server | 2.1.1 | Node adapter with built-in `upgradeWebSocket` | — | required to run Hono on Node; replaces the deprecated `@hono/node-ws` |
| @hono/zod-validator | 0.9.1 | `zValidator('json', schema)` on routes, typed into `hc` | `hono/validator` + `safeParse` by hand | tiny, maintained by the Hono team, removes repetitive boilerplate on every route |
| ws | 8.21.3 | WebSocket server | Socket.IO, uWebSockets.js | Node has no built-in server; `ws` is the plain-protocol standard the adapter expects |
| zod | 4.5.4 | validation at every boundary; types via `z.infer` | TypeBox, hand-written types | one source of truth for runtime checks and types, shared by server, client and a future mobile app |
| @electric-sql/pglite | 0.5.8 | PostgreSQL locally with nothing to install | SQLite via `node:sqlite`, Postgres-only in Docker | keeps the one-command run AND the Postgres dialect Wolfpack uses |
| pg | 8.23.0 | real PostgreSQL in `docker compose` and production | PGlite everywhere | the production driver; proves the same SQL runs on a real server |
| react, react-dom | 19.2.8 | UI | — | the brief-independent choice we made for the front end |
| leaflet | 1.9.4 | the map | — | mandatory per the brief |
| react-leaflet | 5.0.0 | declarative map, markers and events in React | an imperative `useLeafletMap` hook (~60 lines) | saves the marker-sync and StrictMode cleanup code and is the recognised way to use Leaflet in React; its quirks (immutable `MapContainer` props) are documented |
| typescript | 7.0.2 | type-checking with the native `tsc` | TypeScript 6 | nothing in the stack needs the TypeScript JS API, so the fastest line is free to use |
| vite, @vitejs/plugin-react | 8.2.2, 6.1.1 | build, dev server, Fast Refresh | — | current toolchain; the plugin is required for React |
| tailwindcss, @tailwindcss/vite | 4.3.3 | styling | plain CSS / CSS modules | consistent spacing, responsive panel layout and focus styles in minutes; two stable packages; reviewers know it |
| vitest, @vitest/coverage-v8 | 5.0.0 | one test runner for server, shared and web; coverage thresholds | `node:test` for the server | one runner, one coverage report, one 100% gate; Node's own coverage is still experimental |
| jsdom | 30.0.1 | DOM environment for component tests | happy-dom | the more complete DOM; needed by Testing Library |
| @testing-library/react, @testing-library/jest-dom, @testing-library/user-event | 16.3.3, 7.0.1, 14.6.7 | render and query components as users see them; readable matchers; realistic typing and clicks | `fireEvent` and plain assertions | tests read as behaviour ("user types, presses Enter, sees the message"), which is the whole point of the 100% gate |
| @biomejs/biome | 2.5.12 | lint + format + accessibility + React hooks rules | Prettier + ESLint 10 and ~13 plugins | one package instead of fifteen, one config file, no TypeScript-version constraint |
| concurrently | 10.0.5 | `npm run dev` runs server and Vite together | a 15-line `scripts/dev.ts` | standard, prefixed and coloured output, kills both on Ctrl-C; not worth maintaining a script for |
| @types/node, @types/ws, @types/pg, @types/react, @types/react-dom, @types/leaflet | 24.13.3, 8.18.1, 8.23.1, 19.2.18, 19.2.7, 1.9.22 | type definitions | — | no runtime code |

### Replaced by built-ins or a few lines of code

| Not used | What it would have done | Replaced by | Why |
|---|---|---|---|
| Prettier, ESLint, typescript-eslint, eslint-plugin-react-hooks, jsx-a11y, import-x, simple-import-sort, eslint-config-prettier, globals | formatting and linting | Biome | same coverage from one package; ESLint would also have pinned TypeScript to 6.x (typescript-eslint needs the JS API that TypeScript 7 does not ship yet) and needed a peer override for jsx-a11y |
| husky, lint-staged, commitlint | git hooks | a versioned `.githooks/` folder activated with `git config core.hooksPath` (`npm run hooks`); Biome has `--staged`; Conventional Commits checked by a shell regex | three packages for what three shell scripts do; same convention as the author's other repositories |
| Drizzle ORM + drizzle-kit | typed queries, schema as code, generated migrations | numbered SQL migrations + a ~30-line runner (`schema_migrations`, one transaction per file); parameterised queries through a five-line `Db` interface implemented by `pg` and PGlite; rows parsed with the shared Zod schemas | two tables and six queries; an ORM would add two packages (one between 0.45 and a 1.0 release candidate) for no typing we do not already get from Zod. Close call; reversible: the SQL files are exactly what Drizzle would generate |
| TanStack Query | server-state cache | a framework-free `ChatStore` in `packages/shared` fed by the socket (live) and HTTP (load and backfill), read with `useSyncExternalStore` | in a real-time app the socket is the source of truth; a fetch cache on top would be a second cache with its own invalidation; the store is also reusable unchanged in React Native |
| uuid | id generation | `crypto.randomUUID()` in the browser, `crypto.randomUUIDv7()` in Node ≥ 24.16 | built in |
| dotenv, ts-node / tsx, nodemon | env loading, TypeScript execution, watch | `node --env-file-if-exists`, native type-stripping, `node --watch` | built into Node 24 |

### Evaluated and not used

| Package | Why not |
|---|---|
| React Compiler (`oxc-transform-react` native path or `@rolldown/plugin-babel` + `babel-plugin-react-compiler`) | no functional gain in an app this small; the native path only accepts one experimental pinned version; kept as an optional last-day addition that is transparent to the code |
| Socket.IO | custom protocol on top of WebSocket, polling-first handshake; hides exactly the mechanics (heartbeat, reconnect, backfill) this app is meant to show |
| NestJS, Fastify, Express | decorators need a build step under native type-stripping (Nest); no typed client (Fastify); no types and no signal (Express) |
| React Router, Zustand | one screen and a URL parameter; the shared store already holds the client state |
| Playwright | one end-to-end spec is a stretch goal; browsers and a large package are not in the baseline |
| vite-plugin-pwa | a hand-written `manifest.webmanifest` is enough for "installable" if time allows |
| knip, editorconfig-checker | marginal for a repository this size |
| Bun, Elysia, Eden Treaty | not on Wolfpack's stack; the job description says Node; Elysia's Node adapter has open WebSocket issues |

## 2. Stack decisions, with rejected alternatives

| Layer | Choice | Why | Rejected |
|---|---|---|---|
| Runtime | Node 24 LTS (≥ 24.16), native TypeScript type-stripping, no server build step | Active LTS through the deadline; `node app.ts`, `--watch`, `--env-file-if-exists` and `crypto.randomUUIDv7()` all available; matches the job description | Bun (not on Wolfpack's menu; fewer reviewers can run it), Node 26 (LTS only from 2026-10-28) |
| HTTP + WS | Hono 4.13 + `@hono/node-server` 2.1 (built-in WebSocket over `ws` 8.21) + `@hono/zod-validator` | Web-standard `Request`/`Response`; `app.request()` tests without HTTP; `hc<AppType>` gives end-to-end types; plain WebSocket protocol inspectable with curl and devtools | Fastify 5, NestJS 12, Socket.IO, bare `node:http` |
| Validation | Zod 4.5 schemas in `packages/shared`, used on the server (HTTP bodies, every WS frame, env at boot, DB rows) and on the client (every inbound event) | One source of truth for runtime validation and types | TypeBox, hand-written types |
| Persistence | PostgreSQL through plain SQL. Driver by env: no `DATABASE_URL` → PGlite (Postgres in WASM, `./data/pg`); `DATABASE_URL` → `pg` | Wolfpack "mainly uses PostgreSQL"; reviewers still get one-command startup; the same SQL runs unchanged on real Postgres; `LISTEN/NOTIFY` exists on both for the scale-out path | SQLite via `node:sqlite` (release candidate; different dialect from production), Drizzle (see §1), Postgres-only (forces Docker on the reviewer) |
| Client build | Vite 8 + React 19.2 + `@vitejs/plugin-react` 6 | Current toolchain (Rolldown/Oxc); Fast Refresh without Babel | Next.js / React Router framework mode (no SSR or SEO need) |
| Map | Leaflet 1.9.4 + react-leaflet 5 | Stable pair; 5.x is React-19 native; `MapContainer` rendered once with a fixed height, `useMapEvents({ click })` creates rooms, explicit `L.icon`/`divIcon` markers (bundler-safe, selected state), `invalidateSize()` when the panel opens | Leaflet 2.0 (alpha only), an imperative hook (see §1) |
| State | `ChatStore` in `packages/shared` (rooms, messages per room, connection status, username) with `subscribe/getSnapshot`; React reads it through `useSyncExternalStore`; selected room in the URL (`?room=<id>`); form via `useActionState` + `useOptimistic`; `useEffectEvent` inside the socket effect | The socket is the source of truth and HTTP is backfill; React 19 primitives; the store is reusable unchanged in React Native | TanStack Query, Zustand, React Router |
| Styling | Tailwind CSS 4.3 (`@tailwindcss/vite`, CSS-first theme) | Fast, consistent, no config file; focus and reduced-motion styles come with utilities | plain CSS (fine, slower), component libraries (three components needed) |
| Lint / format | Biome 2.5 (`recommended` + `react` domain + `a11y` group + import organising) | One package replaces Prettier, ESLint and ~13 plugins; TypeScript 7-safe | Prettier + ESLint 10 |
| Types | TypeScript 7.0, `strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `.ts` import extensions, `import type` | Native `tsc`; matches Node's type-stripping rules | TypeScript 6 (only needed by typescript-eslint) |
| Tests | Vitest 5 with projects `server`, `shared` (node) and `web` (jsdom + Testing Library, jest-dom, user-event) in one run; `@vitest/coverage-v8` with all four thresholds at 100% | One runner, one coverage report, one gate; tests written as user behaviour | `node:test` (coverage still experimental in Node 24), Playwright in the baseline |
| Packaging | npm workspaces, single lockfile, `engines` + `engine-strict`; Docker `node:24-alpine` multi-stage; `compose.yaml` with `postgres:18-alpine` | Reviewer parity (npm ships with Node; no corepack in Node ≥ 25); no native modules, so Alpine is safe | pnpm/yarn |

## 3. Data model (PostgreSQL, numbered SQL migrations)

```
rooms     id uuid PK (crypto.randomUUIDv7(), server)
          number bigint GENERATED ALWAYS AS IDENTITY UNIQUE   -- race-free "Chatroom {number}"
          name text NOT NULL · lat double precision · lng double precision
          created_at timestamptz NOT NULL DEFAULT now()
messages  id uuid PK (client-generated crypto.randomUUID() = idempotency key)
          room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE
          username varchar(32) NOT NULL · body varchar(500) NOT NULL
          created_at timestamptz NOT NULL DEFAULT now()
          INDEX (room_id, created_at, id)
```

- The identity column gives sequential names without a count-then-insert race.
- Client-generated message ids make retries idempotent (`INSERT … ON CONFLICT DO NOTHING`); the server owns `created_at`, so ordering is `(created_at, id)`, never the client clock.
- Coordinates validated to `[-90, 90]` / `[-180, 180]`; strings trimmed and length-checked at the boundary.
- Migrations live in `apps/server/src/db/migrations/NNNN_name.sql` and are applied at boot, in order, inside a transaction each, tracked in `schema_migrations`. Rows coming out of the database are parsed with the shared Zod schemas, which is where the TypeScript types come from.
- `Db` is `{ query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>; close(): Promise<void> }`, implemented by `pg.Pool` and `PGlite` with no adapter logic beyond construction.

## 4. API surface

| Method and path | Purpose |
|---|---|
| `GET /api/health` | liveness for Docker and uptime checks |
| `GET /api/rooms` | all rooms for the map |
| `POST /api/rooms {lat, lng}` | create a room → 201 room; broadcasts `room:created` to everyone |
| `GET /api/rooms/:id/messages?after=<messageId>&limit=200` | history, ascending, cursor by message id (the server resolves the cursor's `created_at`) |
| `POST /api/rooms/:id/messages {id, username, body}` | post → 201 canonical message; idempotent on `id`; broadcasts `message:created` to room subscribers |
| `GET /ws` | WebSocket upgrade |

Validation uses `zValidator` with the shared Zod schemas, so the typed client `hc<AppType>` infers request and response types.

## 5. Real-time delivery

- **Writes over HTTP, pushes over WebSocket.** `POST` endpoints are validated, rate-limited, documentable and trivially testable; the socket carries subscriptions and server events only.
- **Protocol** (Zod discriminated unions in `packages/shared/protocol`): client → `subscribe {roomId}`, `unsubscribe {roomId}`, `ping`; server → `room:created {room}`, `message:created {message}`, `pong`, `error {code}`. One JSON text frame per event; binary frames rejected; unknown or invalid frames answered with `error` and never crash the hub.
- **Flow:** `POST /api/rooms/:id/messages` → validate → insert → respond 201 → broadcast to the room (sender included; the client de-duplicates by id and replaces its optimistic row).
- **Resilience:** server heartbeat (ping/pong every 30 s, dead sockets terminated); client reconnect with capped exponential backoff and full jitter; on (re)connect the client re-subscribes and back-fills with `?after=<lastSeenId>`; slow consumers (`bufferedAmount` over threshold) are dropped. `http.Server.closeAllConnections()` does not close upgraded sockets, so shutdown closes `wss.clients` explicitly before `server.close()`.
- **Limits and security:** WS `maxPayload` 16 KiB, `perMessageDeflate` off, per-connection token bucket, `POST` rate limit per IP, HTTP body limit 16 KiB, `Origin` allowlist on the upgrade (env `ALLOWED_ORIGINS`, including `http://localhost:5173` in development and `capacitor://localhost` / `https://localhost` for a future mobile shell). No header-mutating middleware on `/ws`.
- **Scale-out path (documented, not built):** fan-out sits behind a `Broadcaster` interface. Single instance: in-process. Multiple instances: Postgres `LISTEN/NOTIFY` (message id only, then re-read) or Redis pub/sub; raw WebSockets need no sticky sessions; cross-instance ordering then comes from the database.

## 6. Client state

- `ChatStore` in `packages/shared/client`: rooms, messages per room, connection status, username; `subscribe(listener)` and `getSnapshot()` return immutable snapshots, so `useSyncExternalStore` never loops.
- `ChatClient` wraps the global `WebSocket` (present in browsers and React Native): reconnect with jittered backoff, Zod-parsed inbound events written into the store, backfill through the typed HTTP client on (re)connect, an injectable storage adapter for the username.
- Selected room in the URL so deep links and reloads restore the panel; a small hook over `URLSearchParams` and `popstate`.
- Form: `<form action>` + `useActionState`; `useOptimistic` renders the pending message; `useEffectEvent` for socket handlers that read the latest props.

## 7. Repository layout

```
apps/web         Vite + React SPA — the only place with DOM, Leaflet or react-leaflet imports; Tailwind
apps/server      Hono app, WebSocket hub, SQL migrations, Db interface (pg / PGlite)
packages/shared  schema/ (Zod + types) · protocol/ (WS events) · client/ (ChatStore, ChatClient, hooks) — lib: ["ES2023"], no DOM
scripts/         start/ (first-run wizard, tested) · review.sh (headless self-review) · audit/ and load/ (deploy-readiness audit)
start-wolfchatter  root launcher: checks Node, runs `node scripts/start/index.ts` (POSIX sh; `npm start` is the same on Windows)
docs/            PRD, architecture, delivery plan, infra & cost, self-review, working-with-AI
.claude/         CLAUDE.md, rules, reviewer agent, self-review skill, hooks
.githooks/       pre-commit, commit-msg, pre-push (activated with `npm run hooks`)
```

## 8. Quality policy

- **Coverage:** 100% statements, branches, functions and lines, enforced by Vitest thresholds in CI over `packages/shared/src`, `apps/server/src`, `apps/web/src` and `scripts/start`, so the first-run wizard is held to the same bar as the application. Excluded, and listed in the config: process entry points (`apps/server/src/index.ts`, `apps/web/src/main.tsx`, `scripts/start/main.ts`), type declarations, test files. Coverage-ignore comments are not allowed; untestable code is a design smell to fix (inject the dependency, extract the pure function). Tests assert behaviour: inputs → outputs, events, rendered DOM; every error branch has a test with a real bad input.
- **Gates:** Biome (`biome ci`), `tsc --noEmit` per workspace, tests with coverage, `vite build`, `npm audit`, Docker build. The same checks run locally through versioned git hooks (`.githooks/`: Biome on staged files and typecheck before commit, a Conventional Commits check on the message, tests before push). On GitHub the same gates are required status checks on `main` (one job per gate, plus an aggregate `all-green` job that is the required context, so adding a gate later is one line): pull request required, administrators included, no force pushes or deletions, conversation resolution required, merge commits only. The pre-commit hook also refuses any staged `.env*` file other than `.env.example` and any line that looks like a credential (`DATABASE_URL=postgres://…:…@`, `*_KEY=`, `*_TOKEN=`, `*_SECRET=` with a non-placeholder value), so a secret cannot reach the history by accident.
- **Security controls (PRD NFR-2):** validate at every boundary (Zod on HTTP bodies, params, query and every WS frame), parameterised SQL only, explicit Origin allowlist on HTTP and on the WS upgrade, per-IP and per-connection rate limits (token bucket, in memory), 16 KiB payload cap on both transports, security headers from Hono's `secureHeaders` (CSP with `connect-src` limited to the API and tiles, `nosniff`, `frame-ancestors 'none'`, HSTS only behind TLS), generic 4xx/5xx bodies with a request id, env validated at boot, no secrets in the repo (none are needed; `.env.example` documents defaults), no PII stored or logged, React escaping only, non-root user in the Docker image.
- **Performance budgets (PRD NFR-1):** Lighthouse Performance ≥ 90 on the production build; initial JS ≤ 250 KB gzipped with Leaflet in its own chunk; click → panel < 100 ms; list endpoints p95 < 50 ms at the assumed size, backed by the `(room_id, created_at, id)` index and cursor pagination; marker layer memoised so message traffic never re-renders it; WS frames carry ids and deltas, never full lists; static assets served with immutable cache headers.
- **Deploy-readiness audit (PRD NFR-4, delivery-plan PR 10):** run after the features and infra PRs, before the final self-review, against the app started with `docker compose`. Three tracks, deterministic tools first and Claude-driven analysis second, prompts versioned under `.claude/`: (1) security: scripted probes over HTTP and WS for every NFR-2 control (malformed JSON, oversized bodies, unknown rooms, injection payloads, forbidden origins, flood and slow-consumer behaviour), `npm audit`, `docker scout cves` on the image, a secrets scan of the history; (2) scalability: a dependency-free load and soak script in `scripts/load/` (Node's global `fetch` and `WebSocket`) at 1× and 10× the assumed scale, recording error rate, p95 broadcast latency and the breaking point; (3) performance: Lighthouse via `npx` on the production build, Vite's bundle report, `EXPLAIN ANALYZE` on the two list queries, React Profiler on the marker layer and the message list, each measured before and after any fix. Output: `docs/audit/` with raw results and a curated report using the same gate as the code review: every finding with its reproduction, presented to the author, and the author's decision recorded (approved and fixed with commit hash / declined with reason / open question). The audit agent proposes; it never applies a fix.
- **Accessibility:** `role="log"` live region with an accessible name rendered before messages arrive; labelled inputs; focus moved to the panel heading on room switch; Escape closes the panel; markers carry `title`/`alt` and a keyboard path exists through the room list; reduced motion respected.
- **Readability (PRD §5, delivery-plan PR 2):** the brief grades output quality and says structure and readability matter, for the code and for the documents alike, so clean code is the default mode for every line rather than a cleanup pass at the end. The code tells the story; comments are the exception. Names carry the intent: functions are verbs, values are nouns, booleans read as predicates (`hasUnreadMessages`); no abbreviations, no `data`/`info`/`manager`/`helper`/`utils` buckets; a name that needs a comment is the wrong name. Comments say why, never what: a constraint, a rejected alternative, a protocol quirk; no commented-out code, no TODOs, no restating the signature. One thing per function, one level of abstraction, early returns instead of nested conditionals; pure functions for logic, I/O at the edges. KISS: the simplest thing that satisfies the PRD, no speculative generality, no abstraction before the third repetition; extend through the seams that already exist (`Db`, `Broadcaster`, the storage adapter) instead of adding layers. Files grouped by feature, not by file type, with a small shared area (`components/`, `lib/`) that a thing earns its way into by having a second caller; the same shape in every workspace, so the next feature is obvious to a stranger. The `test/` tree mirrors `src/`, and test names describe behaviour, so it reads as the spec of the source. This is the feature-based layout that Bulletproof React and the current React guidance converge on, minus the `features/` wrapper directory those recommend for codebases two orders of magnitude larger than this one. The same words are the Code style section of `CLAUDE.md`, and the reviewer agent treats a breach of them as a finding.
- **Review:** an independent reviewer agent in a fresh context (read-only tools, explicit criteria — correctness, security, requirement and readability gaps, never formatting, file:line and a reproduction for every finding) plus the built-in `/code-review`; findings are proposals presented to the author with their reproduction; a fix is written only after the author has understood and approved the finding, and the report records the decision (approved and fixed / declined with reason / open question); raw output and curated report committed. Any new dependency not in §1 is a review finding.
- **Approval-gated git:** the AI tooling commits, pushes or opens a pull request only after the gates have run and the author has approved the diff, and it never merges; the author merges every pull request by hand after reviewing it on GitHub. Enforced in `.claude/settings.json` (`ask` for `git commit`, `git push`, `gh pr create`; `deny` for `gh pr merge`, `git merge`, force pushes) and by the branch protection above.
- **No assumptions:** the AI tooling asks the author whenever the PRD, a finding or an expected behaviour is unclear, instead of choosing a default; the unambiguous part of the task proceeds and the question is listed in the PR. Encoded in `CLAUDE.md`, the reviewer agent and the audit skill.

## 9. Mobile readiness

`packages/shared` is DOM-free by construction, the storage adapter and WS origin allowlist already accommodate native shells, and a single React 19.2 is hoisted at the workspace root (React Native 0.86 pins the same React line). Roadmap: hand-written PWA manifest (hours; included if time allows) → Capacitor 8 wrapper of the web build (days) → Expo SDK 57 app importing `@wolfchatter/shared` unchanged, with `react-native-maps` `UrlTile` on the same watercolor tiles (weeks). Wolfpack describes itself as cross-platform-first (React Native, Flutter, KMP), so the shared-package boundary is the piece that makes this credible.

## 10. Map tiles

The reference CodePen's `http://{s}.tile.stamen.com/watercolor/…` returns HTTP 404 (Stamen tiles moved to Stadia Maps in 2023; verified 2026-09-04) and is plain `http://`, which would be blocked as mixed content on any HTTPS deployment. We use `https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg` with `maxZoom: 16` and the Stadia / Stamen / OpenStreetMap attribution. Stadia needs no key on `localhost`; a deployed domain is registered in the Stadia dashboard (domain-based auth, no key in client code). The tile URL and attribution are configuration (`VITE_TILE_URL`, `VITE_TILE_ATTRIBUTION`) so reviewers can switch to OpenStreetMap tiles. The archived tileset has gaps at high zoom in some areas regardless of host.

## 11. First run: the `start-wolfchatter` wizard

Goal: clone, one command, answer a few questions (or press Enter), the app is up. No dependency: `node:readline/promises`, `node:util.parseArgs`, `node:child_process`.

1. **Preflight.** Node ≥ 24.16 (otherwise print the `nvm install` line from `.nvmrc` and stop), `node_modules` present or run `npm install`, Docker reachable only if the user picks it.
2. **Questions**, each with the default in brackets and the reason in one line. Database: `embedded` PGlite in `./data/pg` (default, nothing to install) · `docker` (Compose Postgres 18, real database) · `url` (own `DATABASE_URL`, typed masked). Port `[3000]`. Tiles: `watercolor` via Stadia (default, keyless on localhost) · `osm` (never needs a key). Stadia API key `[none]`, only when the app will be served from a domain. Allowed origins `[http://localhost:5173,http://localhost:3000]`.
3. **Write `.env`** from `.env.example` with the answers, mode 0600, git-ignored; existing `.env` is kept unless `--reconfigure`. Secrets are masked while typing and never echoed or logged; `.env.example` contains only non-secret defaults, so the repository never holds a credential.
4. **Start**: `npm run dev` (embedded or url) or `docker compose up --build` (docker), then print the URL and open the browser when a display is available.
5. **Non-interactive**: `--yes`, `CI=true` or no TTY answers every question with its default, so CI, the Docker image and `npm run dev` need no wizard. `--help` documents the flags.

The wizard's logic (answer parsing, `.env` rendering, preflight checks) lives in pure functions under `scripts/start/`, tested from `scripts/start/test/` in the same mirrored layout the workspaces use, and is part of the coverage gate; only the entry file that wires stdin/stdout is excluded, like the other process entry points. Root `start-wolfchatter` is a ten-line POSIX script (`chmod +x`, LF endings enforced by `.gitattributes`) so the command in the README is literally `./start-wolfchatter`; `npm start` runs the same file for Windows shells.
