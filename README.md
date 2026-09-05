# Wolfchatter

Real-time chat on a map. Click anywhere on the map to open a chatroom pinned to that spot, click an existing pin to join its conversation, and post messages that everyone viewing the room receives live.

> **Status:** planning complete, implementation in progress. The technical PRD was written and committed before any code, as the brief asks; the application is delivered in small pull requests listed in the delivery plan.

## Documents

| Document | Purpose |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Functional requirements, assumptions and the up-front technical decisions (stack, data model, real-time delivery, state management) |
| [docs/architecture.md](docs/architecture.md) | The decisions in depth: dependency assessment, rejected alternatives, data model, protocol, quality policy, mobile path |
| [docs/delivery-plan.md](docs/delivery-plan.md) | The sequence of pull requests, time budget and what gets cut first if time runs short |

The infra and cost estimate, the self-review configuration and report, and the note on working with AI tooling are added in their own pull requests (see the delivery plan).

## Running it

Coming with the scaffold pull request: `./start-wolfchatter`, a short wizard that asks a few questions (Enter accepts every default), writes a local `.env` and starts the app with nothing else installed; `npm run dev` for the same without questions; `docker compose up --build` for the production image with a real PostgreSQL. No secrets are needed and none are committed: `.env` is git-ignored, only `.env.example` is versioned.

## License

[MIT](LICENSE)
