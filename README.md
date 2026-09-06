<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/wordmark-dark.svg">
    <img src="apps/web/public/brand/wordmark-light.svg" alt="Wolfchatter" width="440">
  </picture>
</p>

<p align="center"><strong>Chat that lives on the map.</strong></p>

<p align="center">
Click anywhere in the world and a room opens, pinned to that spot.<br>
Click a pin and you are in the conversation that belongs to that place.<br>
Post a message and everyone looking at the same spot sees it arrive.
</p>

<p align="center">
  <a href="https://github.com/Radnic26/wolfchatter/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Radnic26/wolfchatter/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/Radnic26/wolfchatter/actions/workflows/ci.yml"><img alt="Coverage 100%" src="https://img.shields.io/badge/coverage-100%25-EC2A6E"></a>
  <a href=".nvmrc"><img alt="Node 24" src="https://img.shields.io/badge/node-24-EC2A6E"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-EC2A6E"></a>
</p>

From a clone to a running map, in one command:

```sh
git clone https://github.com/Radnic26/wolfchatter.git
cd wolfchatter
./start-wolfchatter
```

Enter answers every question.

## Why it exists

A chatroom is normally a name in a list, and the name is something somebody had to invent. Wolfchatter makes the **place** the room: the Old Town square, a festival field, the office you are standing outside of. The map is the directory, so there is nothing to name, nothing to search and nothing to join — you click where you are already looking.

What the decision rules out matters as much. There are no accounts, because a room you walk up to should not ask you to sign up first; identity is a username you type once and the browser remembers. Rooms are public and permanent, and everything that follows from *not* deciding that — moderation, private rooms, discovery, a feed — is a different product, not a missing feature of this one.

## What it does

- **Click the map, get a room.** A pin appears at that point, named in order, and its panel opens on the tap rather than after the round trip. *(FR-2)*
- **Click a pin, join the conversation.** Title, history and the highlighted marker switch together. *(FR-3)*
- **Post, and everyone at that spot sees it.** Your own message renders optimistically; theirs arrive over the socket. *(FR-4, FR-7)*
- **Nothing is lost.** Messages are stored server-side, ordered by the sequence the server accepted them in, and a client that drops back-fills exactly what it missed. *(FR-5, FR-6, FR-7)*
- **The keyboard goes everywhere the pointer does.** A skip link past the pins, Enter or Space to open one, focus that follows the room and stays put when a message lands. *(FR-9)*
- **Built small-screen first.** Below 768 px the panel is a bottom sheet over the map, 44 px targets, safe areas honoured, and a pan gesture never creates a room. *(FR-10)*

## Numbers

Measured on the production image against a real PostgreSQL, on 2026-09-06. Every row links to the run it came from.

| | Measured | Where it comes from |
|---|---|---|
| Broadcast latency, p95 | **4.8 ms** at 500 sockets and 50 msg/s — 10× the assumed scale, 0 errors, 30,000 of 30,000 delivered | [audit § scalability](docs/audit/README.md#scalability) |
| Concurrent sockets | **8,000**, still p95 3.9 ms; the breaking point was not reached — the load generator ran out first | [audit § scalability](docs/audit/README.md#scalability) |
| Write throughput | **1,860 msg/s** accepted and delivered, p95 3.4 ms | [audit § scalability](docs/audit/README.md#scalability) |
| Initial JavaScript | **137 KB gzipped**, Leaflet included; ~184 KB for a cold load with CSS and fonts | [audit § performance](docs/audit/README.md#performance) |
| Lighthouse, desktop | Performance **100**, Accessibility **100**, Best Practices 96, SEO 92 | [raw report](docs/audit/raw/lighthouse.after.json) |
| List endpoints, p95 | **2.6 ms** and **2.3 ms** over HTTP, on 200 rooms and a room of 10,000 messages | [audit § performance](docs/audit/README.md#performance) |
| Start-up | **0.9 s** for the application on a healthy database; 6.0 s for the whole stack, of which 5 s is compose's own healthcheck interval | [raw measurement](docs/audit/raw/cold-start.txt) |
| Tests and coverage | 647 tests, **100%** of statements, branches, functions and lines | [CI](https://github.com/Radnic26/wolfchatter/actions/workflows/ci.yml) |

Memory, not CPU, is the first constraint: roughly 42 KiB per connected socket above a 50 MiB idle baseline, flat across a ten-minute soak. [`docs/infra-and-cost.md`](docs/infra-and-cost.md) turns that into a bill.

Every row but the last two comes from the [deploy-readiness audit](docs/audit/). Start-up was measured separately with [`scripts/audit/cold-start.ts`](scripts/audit/cold-start.ts), which prints its own method and is what wrote the raw file linked above.

## Running it

### What you need

| | | |
|---|---|---|
| **Node ≥ 22.18** | **required** | 22.18 is where Node stopped flagging TypeScript type stripping, and this repository runs its TypeScript with no build step — below it the wizard cannot be loaded at all. Verified on **22.18.0, 22.23.2, 24.20.0 and 25.9.0**, app and full test suite. `.nvmrc` pins 24, which is what CI uses. |
| **Docker** | optional | Needed for the two modes that run PostgreSQL in a container, and for `docker compose up --build`. Without a running daemon the wizard offers the embedded database instead and everything still works. |
| Anything else | no | No database to install, no global package, no `.env` to write by hand. |

Odd-numbered Node lines (23, 25) are fine. Some development dependencies declare LTS-only `engines`, which npm reports as a warning and which this repository deliberately does not turn into an error — see the comment in `.npmrc`.

### The wizard

It asks two questions. The first decides how the app runs:

| Choice | What starts | Where | Reloads on edit |
|---|---|---|---|
| Everything in Docker *(default)* | the production image and PostgreSQL | `http://localhost:3000` | no |
| App here, PostgreSQL in Docker | Vite and the API on your machine, the database in a container | `http://localhost:5173` | yes |
| Everything here, embedded database | Vite and the API, with PostgreSQL compiled to WebAssembly | `http://localhost:5173` | yes |

Without a running Docker daemon only the third is offered, so the command still works on a machine with nothing installed. `./start-wolfchatter --yes` skips the questions, which is also what CI and a piped stdin get.

The wizard generates a database password, writes it to `.env` with mode `0600`, and installs before it starts. `.env` is git-ignored; only `.env.example` is committed, and nothing in it is secret.

It also lists this machine's own addresses on the network in `ALLOWED_ORIGINS` and prints them when it starts, so the app can be opened on a phone on the same Wi-Fi without a second step — the layout below 768 px is a requirement, and it is worth seeing on a real one. Both the write path and the socket upgrade check `Origin`, which is why the address has to be named rather than merely reachable.

It also writes `SEED_SAMPLE_DATA=true`, so a first run opens on a map with six sample rooms and their conversations on it rather than on an empty world. The server seeds only a database that has no rooms in it, so a restart adds nothing and a real deployment that never had the flag stays empty; deleting the line stops it entirely.

Once `.env` exists, these do the same thing without the questions:

```sh
npm run dev                  # server and Vite together, proxied onto one origin
docker compose up --build    # the production image against a real PostgreSQL
```

## How it is built

| | |
|---|---|
| Runtime | Node 24 running TypeScript natively — no build step on the server |
| API | Hono 4, with the WebSocket support of its Node adapter over `ws` |
| Database | PostgreSQL through plain SQL and numbered migrations; PGlite when there is no `DATABASE_URL`, `pg` when there is, both behind a four-call `Db` interface |
| Front end | React 19 + Vite 8, react-leaflet, Tailwind 4 |
| Shared | Zod schemas, the WS protocol, the store and the client in `packages/shared` — no DOM, so a native shell can reuse it |
| Tooling | Biome for lint and format, Vitest with a 100% coverage gate, Docker on `node:24-alpine` |

Writes go over HTTP where they can be validated, rate-limited and tested without a socket; the socket carries `subscribe`/`unsubscribe`/`ping` one way and `room:created`/`message:created`/`pong`/`error` the other. Fan-out sits behind a `Broadcaster` interface, so a second instance needs a pub/sub rather than a redesign.

**Every dependency earns its place**: 11 runtime packages and 19 development ones, 6 of the latter being type definitions. [`docs/architecture.md` §1](docs/architecture.md) records each one with the alternative considered and the reason, plus what was replaced by a built-in — `dotenv`, `tsx` and `nodemon` by Node 24's own flags, `uuid` by `crypto.randomUUID()`, husky and commitlint by a versioned `.githooks/` folder, an ORM by SQL files a runner applies at boot.

## Quality

```sh
npm run check     # biome ci + tsc --noEmit per workspace + vitest with the coverage gate
npm run format    # let Biome fix formatting and imports
npm run hooks     # once per clone: points git at the versioned .githooks/
```

`npm run check` is the gate. CI runs it as one job per step plus a Docker build and `npm audit`; `main` is protected on the `all-green` job, which fails unless every one of them succeeded. Coverage thresholds are 100% for statements, branches, functions and lines; process entry points are excluded and named in `vitest.config.ts`, and coverage-ignore comments are not allowed. Each workspace keeps its tests in its own `test/` folder, mirroring `src/` file for file.

Beyond the gate, two rounds ran against the finished code, in this order so that the measurements describe what ships:

- **[Self-review](docs/self-review/)** — an independent reviewer in a fresh context plus `/code-review` at high effort, then an adversarial verifier per finding. 83 candidates, 35 confirmed, 30 refuted, 20 collapsed as restatements; 32 repaired, 2 declined, 1 answered by correcting a document that was wrong about the code.
- **[Deploy-readiness audit](docs/audit/)** — 27 security probes, load and soak runs, and a performance pass, all against the running production image. 9 findings, 8 repaired, 1 declined. Every budget in NFR-1…3 is answered met or missed with the number that decided it.

Two rules bind both rounds and are written into the repository's own AI configuration. **No repro, no finding:** a finding that cannot be shown failing is an opinion. **Findings are proposals, never patches:** nothing was repaired before I had read the finding, understood the reproduction and approved that specific fix, and the report records the decision either way.

## What I left out, and why

The ideas below were all considered. Each one is a decision, not an oversight.

| Left out | Why | What it would cost to add |
|---|---|---|
| **Authentication** | The brief never asks for it, and a room you walk up to should not ask you to sign up. A free-text username per browser is the whole of identity. | A day: sessions, a users table, the whole password or OAuth surface, and a moderation story that follows it. |
| **An ORM** | Two tables and six queries. Drizzle would add two packages for typing that Zod already gives on the way out of the driver. A close call, and reversible: the SQL files are what it would have generated. | Two dependencies and a migration toolchain. |
| **Redis, or any second process** | One instance serves at least 8,000 sockets — sixteen times the 500 NFR-3 asks for. A pub/sub before it is needed is a component to run and pay for. | The `Broadcaster` seam already exists; Postgres `LISTEN/NOTIFY` is the first step, and [`docs/infra-and-cost.md` §6](docs/infra-and-cost.md) prices the rest. |
| **A router** | The application has one screen. The selected room is a query parameter the browser already parses. | A dependency and a layer, for one piece of state. |
| **A query-cache library** | In a real-time app the socket is the source of truth; TanStack Query on top would be a second cache with its own invalidation. The store is 150 lines and reusable unchanged in React Native. | A dependency, plus reconciling two ideas of what is current. |
| **Socket.IO** | It hides exactly the mechanics this app exists to show — heartbeat, reconnect, back-fill — behind a custom protocol and a polling-first handshake. | A dependency on both sides, and a protocol no longer inspectable with `curl` and devtools. |
| **React Compiler** | Evaluated and rejected: the gain is automatic memoisation this app does not need, the price is an experimental pinned version, and the performance budgets are met without it. | An experimental dependency, and no time to catch a subtle regression. |
| **Playwright end-to-end tests** | Out of scope rather than deprioritised: browsers and a large package are not in the baseline, and the flows are covered by the component suite and by scripted passes over the running app. | Hours, plus browsers in CI. |
| **A PWA manifest and service worker** | Named as future work on the mobile path, not part of this deliverable. | Hours, hand-written; then Capacitor in days and an Expo app in weeks, all reusing `packages/shared` unchanged. |
| **A bounding-box query for rooms** | The assumed scale is a few hundred rooms, and `EXPLAIN ANALYZE` sorts 200 of them in 0.045 ms. Paginating a list that fits on one screen of map would be complexity bought with nothing. | A query, an index and a viewport the client has to report. Documented as the next step. |

Three findings were raised against the finished code and **declined**, which is the same decision made under pressure:

| Declined finding | Why |
|---|---|
| A back-fill request that never settles holds a room's live messages behind it forever *(self-review 30)* | The fix is a timeout policy with its own failure surface, and no requirement asks for one. Out of scope, frozen on 5 September. |
| A `subscribe` frame refused by the rate limit leaves the client's followed set disagreeing with the hub's *(self-review 32)* | Same shape: reachable only by deliberately flooding your own connection, and the repair is new behaviour on the last day. |
| `/robots.txt` is answered by the single-page shell, costing eight points of Lighthouse SEO *(audit A1-9)* | Repairing it means adding a file no specification asks for, in a category the PRD never set a budget for. |

One finding was approved and then **could not be repaired in the form approved** — the 512 KiB slow-consumer bound reads `bufferedAmount`, which cannot see past the kernel's own send buffer, so a real bound would need an acknowledgement in the protocol. The repair became a correction to the comment, with the 3.3 MiB a stalled reader was measured holding written next to it. [The audit records why](docs/audit/README.md#what-was-fixed-what-was-not-and-why).

## Documents

| Document | Purpose |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Functional and non-functional requirements, the assumptions behind each ambiguity, and the questions sent to Wolfpack |
| [docs/architecture.md](docs/architecture.md) | The decisions in depth: the dependency assessment with rejected alternatives, data model, protocol, quality policy |
| [docs/delivery-plan.md](docs/delivery-plan.md) | The sequence of pull requests, the time budget and what gets cut first |
| [docs/infra-and-cost.md](docs/infra-and-cost.md) | What running it costs: staging and production, the assumptions behind every number, and the thresholds at which the bill changes |
| [docs/self-review/](docs/self-review/) | Every finding with its reproduction and the decision taken on it |
| [docs/audit/](docs/audit/) | The security probes, the load and soak runs, and every NFR budget answered met or missed |
| [docs/ai/working-with-ai.md](docs/ai/working-with-ai.md) | How this repository was actually built with Claude: what was decided by hand, what was generated, and how it was checked |
| [docs/brand.md](docs/brand.md) | The brand system: colour roles with their measured contrast, the type scale, the marks and their rules |
| [CLAUDE.md](CLAUDE.md) + [.claude/](.claude/) | The AI configuration this repository is built under, committed before the first line of code |

## License

[MIT](LICENSE)
