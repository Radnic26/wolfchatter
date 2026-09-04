# Delivery plan

Companion to `PRD.md`. Every step is a branch and a pull request; each PR is merged only when CI is green and the review notes in the PR description are addressed. Commits are small and conventional (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), so the history reads as the sequence below.

| PR | Branch | Scope | Done when |
|---|---|---|---|
| 1 | `main` (root commits) | The PRD, architecture notes and delivery plan, then the repository baseline (license, editorconfig, gitignore, nvmrc, README stub, PR template, CODEOWNERS). An empty repository has no base branch to open a PR against, so these are the only direct commits; branch protection is enabled right after and everything else goes through pull requests | Docs committed before any code, with real timestamps; `main` protected |
| 2 | `chore/scaffold` | npm workspaces (`apps/web`, `apps/server`, `packages/shared`), TypeScript 7 configs, Biome, versioned `.githooks/`, Vitest projects with the 100% coverage thresholds, GitHub Actions, `CLAUDE.md` + `.claude/` (rules, reviewer agent, self-review skill, hooks), `npm run dev`, Dockerfile + `docker compose`, README with the dependency assessment | `npm install && npm run dev` serves a placeholder page and `/api/health`; `npm run check` green (coverage gate active from the first line of code) |
| 3 | `feat/persistence-api` | Zod schemas + protocol in `packages/shared`; SQL migrations + runner; `Db` interface over PGlite/pg; `GET/POST /api/rooms`, `GET/POST /api/rooms/:id/messages`; tests for validation, room naming, idempotent inserts, cursor backfill | Tests green on PGlite `memory://` and on `docker compose` Postgres; coverage still 100% |
| 4 | `feat/map-rooms` | react-leaflet map (center/zoom from the reference, watercolor tiles, attribution), click-to-create, markers, selected-marker highlight, panel with title switching, empty state, `?room=` URL state | FR-1, FR-2, FR-3 verified manually in two browsers |
| 5 | `feat/messages` | Message list, form with `useActionState` + `useOptimistic`, username memory, `ChatStore` + `useSyncExternalStore` wiring, timestamps | FR-4, FR-5, FR-6 verified; reload keeps everything |
| 6 | `feat/realtime` | WS hub (subscriptions, heartbeat, backpressure, origin allowlist, rate limits), `ChatClient` with reconnect + backfill into the store, WS tests | FR-7, FR-8 verified; kill the server mid-session and watch the client recover |
| 7 | `feat/a11y-pwa` | `role="log"` live region, labels, focus management, keyboard paths, reduced motion, hand-written PWA manifest | FR-9 verified with keyboard only and with VoiceOver |
| 8 | `docs/infra-cost` | `docs/infra-and-cost.md`: staging + production tables, assumptions, scale triggers | Reviewed against the PRD's scale-out path |
| 9 | `chore/self-review-1` | Run the committed review configuration and `/code-review`; commit raw output + curated report; fix commits reference finding ids | Every finding is fixed / not fixed with reason / needs human, each with a reproduction |
| 10 | `docs/readme-final` | README (what, run, assumptions, decisions, left out, next), working-with-AI note, self-review round 2 with the previous report in context, final note | End-to-end verification from `PRD.md` §5 passes on a fresh clone |

## Time budget

Friday: research, PRD, questions to Wolfpack, repository initialised (PR 1). Saturday: PRs 2–5. Sunday: PRs 6–9. Monday morning: PR 10, tag `v1.0.0`, send the email before 10:00.

If time runs short, the order of sacrifice is: Playwright e2e, PWA manifest, React Compiler, second self-review round. Never sacrificed: one-command run, the 100% coverage gate, the self-review report, the README. Every PR ships with its tests; coverage never drops below the threshold on `main`.
