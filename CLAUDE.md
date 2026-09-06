# Wolfchatter

Real-time chat on a Leaflet map: click the map to open a chatroom pinned to that spot, click a pin to join it, post messages that everyone in the room receives live. `docs/PRD.md` is the spec — read it before feature work. `docs/architecture.md` holds the decisions and the dependency budget, `docs/delivery-plan.md` the pull-request sequence.

Node 24 running TypeScript natively, Hono 4 over `ws`, PostgreSQL through plain SQL (PGlite locally, `pg` when `DATABASE_URL` is set), React 19 + Vite 8 + react-leaflet, Tailwind 4, Zod 4 shared by both sides, Biome, Vitest. Every dependency earns its place: never add a package without a row in `docs/architecture.md` §1 naming the alternative and the reason.

## Commands

The scaffold (delivery-plan PR 3) is what makes these true; before it lands they do not exist yet, and this section is the contract it has to satisfy.

- `npm install && npm run dev` — server under `node --watch` and Vite together, with `/api` and `/ws` proxied
- `npm run check` — `biome ci` + `tsc --noEmit` per workspace + `vitest run --coverage`. This is the gate; run it before claiming anything works.
- `npm run format` fixes formatting · `npm run build` · `npm run hooks` once per clone, to point git at `.githooks/`
- `./start-wolfchatter` — first-run wizard where Enter accepts every default; `--yes` skips the questions
- `docker compose up --build` — the production image against a real PostgreSQL
- `./scripts/review.sh <round>` — headless self-review, output validated against `scripts/review-schema.json`
- `./scripts/audit.sh <round> [security|load|performance|all]` — the same for the deploy-readiness audit, against `scripts/audit-schema.json`, and it refuses to run unless the app is already up. `node scripts/audit/main.ts` sends every NFR-2 input class at it; `node scripts/load/run.ts` is the load and soak run. Both take `--help`, add no dependency, and are instruments rather than shipped code, so they sit outside the coverage gate exactly as `review.sh` does
- Schema changes are new numbered files in `apps/server/src/db/migrations/`, applied at boot; never edit one that has already run

## Layout

- `apps/server` — Hono app, WebSocket hub, SQL migrations, the `Db` interface over `pg` and PGlite
- `apps/web` — the React SPA, and the only workspace allowed to touch the DOM or Leaflet
- `packages/shared` — Zod schemas, the WS protocol, `ChatStore`, `ChatClient`; no DOM, no `react-dom`, no Leaflet, so a native shell can reuse it unchanged
- Inside `src/`, a folder is a feature and owns everything that feature needs: `rooms/`, `messages/`, `map/` in the web app; `rooms/`, `messages/`, `db/`, `ws/` on the server. Colocate first, extract later — something moves to the shared area only once a second feature uses it.
- The shared area is deliberately small: `components/` for UI more than one feature renders, `lib/` for technical functions that belong to no feature. Every file there is named for what it does (`format-timestamp.ts`), never `utils.ts` or `helpers.ts`.
- Every workspace keeps its tests in its own `test/` folder, mirroring `src/` file for file: `src/rooms/panel.tsx` is tested by `test/rooms/panel.test.tsx`. Source files stay free of test code, and the test tree reads as the spec of the source tree.

## Rules that differ from defaults

- Node runs TypeScript natively: relative imports carry the `.ts` / `.tsx` extension, types are imported with `import type`, and there is no `enum`, no parameter property, no decorator and no `paths` mapping in tsconfig.
- Validate every boundary with the shared Zod schemas: HTTP body, params and query, every WS frame, and the environment at boot. Types come from `z.infer`; never write an interface that restates a schema.
- Writes go over HTTP (`POST /api/…`), where they are validated, rate-limited and testable without a socket. The WebSocket carries only `subscribe` / `unsubscribe` / `ping` from the client and `room:created` / `message:created` / `pong` / `error` from the server. Insert first, respond, then broadcast.
- Responsive is a requirement, not a finish: build the small viewport first, breakpoint 768 px, panel as a bottom sheet over the map below it. Touch targets 44 px, `dvh` never `vh`, inputs 16 px or larger, safe-area insets honoured, no horizontal scroll at any width, and a pan gesture never creates a room. `docs/architecture.md` §12 has the full contract.
- React: `ref` is a prop; forms use `useActionState` and `useOptimistic`; room, message and connection state all live in the shared `ChatStore`, read through `useSyncExternalStore` — no query-cache library, because the socket is the source of truth. The selected room lives in the URL as `?room=<id>`.
- No abstraction the PRD does not ask for: no auth, no Redis, no ORM, no service layer over six SQL queries. Reach for a new seam only when the PRD names the requirement.
- Never assume. When the PRD, a finding or an expected behaviour is unclear, do the unambiguous part and ask Radu one precise question with the options you see. Never pick a default silently.
- Review and audit findings are proposals. Present each one with its reproduction and wait for Radu's approval of that finding before writing the fix.
- Git is approval-gated, and the gate is the diff: run `npm run check`, **show Radu the diff and the results, and wait**. Commit, push or open a pull request only after he says OK for that step. Committing before he has seen the diff is the one mistake that cannot be undone politely — once it is committed there is no diff left for him to read, so a working tree that is ready but uncommitted is the correct state to hand over, every time. Never merge, never rebase, never force-push — he reviews on GitHub and merges by hand.
- Biome owns formatting and lint; never hand-format and never work around it. A suppression is the exception and stays one: inline only, at the line it excuses, with a reason that says why the rule is wrong *there* — never a rule disabled in `biome.json`, never a whole file ignored. Biome reports a suppression that has stopped being needed, so the exception cleans itself up. Commit messages follow Conventional Commits.

## Code style

The brief grades output quality and says structure and readability matter, for the code and for the documents alike, so clean code is the default mode for every line rather than a cleanup pass at the end. The code tells the story; comments are the exception.

- Names carry the intent: functions are verbs, values are nouns, booleans read as predicates (`hasUnreadMessages`); no abbreviations, no `data`/`info`/`manager`/`helper`/`utils` buckets; a name that needs a comment is the wrong name.
- Comments say why, never what: a constraint, a rejected alternative, a protocol quirk; no commented-out code, no TODOs, no restating the signature.
- One thing per function, one level of abstraction, early returns instead of nested conditionals; pure functions for logic, I/O at the edges.
- KISS: the simplest thing that satisfies the PRD, no speculative generality, no abstraction before the third repetition; extend through the seams that already exist (`Db`, `Broadcaster`, the storage adapter) instead of adding layers.
- Files grouped by feature, not by file type, with a small shared area (`components/`, `lib/`) that a thing earns its way into by having a second caller; the same shape in every workspace, so the next feature is obvious to a stranger. The `test/` tree mirrors `src/`, and test names describe behaviour, so it reads as the spec of the source.

## Gotchas

- Leaflet: render `MapContainer` once with a fixed height, never inside `Suspense`. Its `center` and `zoom` props are read once at mount, so move the view with `useMap().flyTo`. Pass explicit `L.icon` / `L.divIcon` instances rather than relying on the default icon paths (and note `alt` is written only onto an icon element that is an image, so a `divIcon` is named by `title` alone), give a marker `keydown` of its own because Leaflet makes it focusable with `role="button"` and then never turns Enter into a click, keep a `ResizeObserver` on the container calling `invalidateSize(false)`, because the box does change size — the layout is `dvh` and a phone's viewport grows when the browser hides its URL bar, which leaves an unmeasured strip of blank map behind, and mock `react-leaflet` in component tests.
- Hono: keep the routes chained onto one instance or `hc<AppType>` loses the response types. Handlers are `async` and return the response; a `.then()` chain breaks the same inference. No header-mutating middleware on the `/ws` route.
- WebSockets: `http.Server.closeAllConnections()` leaves an upgraded socket alone, so shutdown closes the hub's sockets before `server.close()` or the process hangs. Hono authorises the upgrade and `ws` owns the socket from `connection` on, because `bufferedAmount`, a protocol-level ping and `terminate()` are what the wrapper hides. An upgrade with no `Origin` is refused, so a probe or load script must send one — `ws` can, Node's global `WebSocket` cannot. Opening the app from a phone over the network needs that address in `ALLOWED_ORIGINS`: the wizard writes this machine's own addresses there, and the server allows its own on top, because in Docker the container cannot see the host's.
- PGlite holds a single exclusive connection to its data directory, so tests use `memory://` and a test run cannot share `./data/pg` with a running dev server.
- When compacting, keep the list of modified files and the commands still to run.
