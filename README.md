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

---

A chatroom is usually a name in a list. Here it is a **place**: the Old Town square, a
festival field, the office you are standing outside of. Rooms are created by dropping a
pin, so the map is the directory, and the conversation is anchored to somewhere real
rather than to a topic somebody had to invent.

Everything is built to be run by someone who has never seen the repository before. One
command from a fresh clone brings up the app, the API and a real PostgreSQL — or, on a
machine with nothing installed at all, a PostgreSQL compiled to WebAssembly, so there is
still nothing to set up. Messages survive reloads, arrive live over a WebSocket, and
reconcile themselves after a dropped connection instead of quietly losing what you
missed.

> **Status:** the persistence layer and the HTTP API are in. The map, the message panel
> and the live socket land in the pull requests listed in the
> [delivery plan](docs/delivery-plan.md); the app today serves its shell, the health
> endpoint and the rooms and messages API.

## Running it

One command from a fresh clone. Docker is the only prerequisite, and even that is optional.

```sh
git clone https://github.com/Radnic26/wolfchatter.git
cd wolfchatter
./start-wolfchatter
```

The wizard asks two questions and Enter answers both. The first one decides how the app runs:

| Choice | What starts | Where | Reloads on edit |
|---|---|---|---|
| Everything in Docker *(default)* | the production image and PostgreSQL | `http://localhost:3000` | no |
| App here, PostgreSQL in Docker | Vite and the API on your machine, the database in a container | `http://localhost:5173` | yes |
| Everything here, embedded database | Vite and the API, with PostgreSQL compiled to WebAssembly | `http://localhost:5173` | yes |

Without a running Docker daemon only the third is offered, so the command still works on a machine with nothing installed. `./start-wolfchatter --yes` skips the questions, which is also what CI and a piped stdin get.

The wizard generates a database password, writes it to `.env` with mode `0600`, and installs before it starts. `.env` is git-ignored; only `.env.example` is committed, and nothing in it is secret.

Once `.env` exists, these do the same thing without the questions:

```sh
npm run dev                  # server and Vite together, proxied onto one origin
docker compose up --build    # the production image against a real PostgreSQL
```

## Working on it

```sh
npm run check     # biome ci + tsc --noEmit per workspace + vitest with the coverage gate
npm run format    # let Biome fix formatting and imports
npm run hooks     # once per clone: points git at the versioned .githooks/
```

`npm run check` is the gate, and CI runs it as one job per step plus a `docker` job and `npm audit`. Coverage thresholds are 100% for statements, branches, functions and lines over `apps/server/src`, `apps/web/src` and `scripts/start`; process entry points are excluded and listed in `vitest.config.ts`. Coverage-ignore comments are not allowed.

Each workspace keeps its tests in its own `test/` folder, mirroring `src/` file for file.

## Layout

| Path | What lives there |
|---|---|
| `apps/server` | Hono HTTP API, the WebSocket hub, SQL migrations, the `Db` interface over `pg` and PGlite |
| `apps/web` | the React single-page app, and the only workspace that touches the DOM or Leaflet |
| `packages/shared` | Zod schemas, the WS protocol and the client store — no DOM, so a native shell can reuse it |
| `scripts/start` | the first-run wizard: pure decision logic, with I/O confined to `main.ts` |

## Documents

| Document | Purpose |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Functional requirements, assumptions and the up-front technical decisions |
| [docs/architecture.md](docs/architecture.md) | The decisions in depth: dependency assessment, rejected alternatives, data model, protocol, quality policy |
| [docs/brand.md](docs/brand.md) | The brand system: colour roles and their measured contrast, the type scale, the marks and their rules |
| [docs/delivery-plan.md](docs/delivery-plan.md) | The sequence of pull requests, the time budget and what gets cut first |
| [docs/infra-and-cost.md](docs/infra-and-cost.md) | What running it costs: staging and production tables, the assumptions behind every number and the thresholds at which the bill changes |
| [docs/self-review/](docs/self-review/) | The first review round: every finding with its reproduction and the decision taken on it, what was repaired and what was deliberately not |
| [CLAUDE.md](CLAUDE.md) + [.claude/](.claude/) | The AI configuration this repository is built under, committed before the first line of code |

## Dependencies

Every package has to earn its place: it stays when it removes real work or real risk, and it goes when a built-in or a few dozen lines do the same job. Eleven runtime packages and nineteen development ones, six of the latter being type definitions. [docs/architecture.md §1](docs/architecture.md) records each one with the alternative considered and the reason, plus what was replaced by built-ins and what was evaluated and rejected.

**Runtime:** `hono`, `@hono/node-server`, `@hono/zod-validator`, `ws`, `zod`, `@electric-sql/pglite`, `pg`, `react`, `react-dom`, `leaflet`, `react-leaflet`.

**Replaced by built-ins:** `dotenv`, `ts-node`/`tsx` and `nodemon` by Node 24's `--env-file-if-exists`, native type stripping and `--watch`; `uuid` by `crypto.randomUUID()`; `husky`, `lint-staged` and `commitlint` by a versioned `.githooks/` folder; Prettier, ESLint and its plugin stack by Biome; an ORM by numbered SQL migrations and a four-call `Db` interface; TanStack Query by the shared store the socket already feeds.

## License

[MIT](LICENSE)
