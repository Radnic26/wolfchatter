# Self-review, round 1

The round the delivery plan calls PR 10, run on 2026-09-06 against the whole codebase rather than
against a diff. Every finding here carries a reproduction, because a finding that cannot be shown
failing is an opinion. Nothing was repaired before the author had read the finding and approved it.

## How it was run

Two independent sources, both over `apps/server`, `apps/web`, `packages/shared` and `scripts/start`:

- **The committed reviewer configuration** — the read-only agent in `.claude/agents/reviewer.md`, in a
  fresh context, holding `CLAUDE.md` and `docs/PRD.md` as the standard. Its procedure starts from
  `git diff main...HEAD`, which is empty on a branch cut from `main` with no code on it, so this round
  gave it the whole tree as its surface and left everything else in the procedure untouched.
- **`/code-review` at level `high`** — eight finders over the four path targets and the seams between
  the workspaces, then one adversarial verifier per module. Every verifier was told to default to
  *refuted* and to earn a *confirmed* with evidence it gathered itself.

A reviewer always reports something. That is the reason for the second stage and for the shape of the
table below: of eighty-three candidates, thirty were refuted and twenty were restatements of another
finding. Chasing all eighty-three would have been over-engineering with a process attached.

| | |
|---|---|
| Candidates verified | 83 |
| Confirmed | 35 |
| Refuted | 30 |
| Restatements collapsed | 20 |
| Left uncertain | 0 |

Tooling: Claude Code 2.1.260. The round began on Claude Fable 5.1 and continued on Claude Opus 5 after
a session limit; both are recorded because the second model reviewed the first one's output. Raw
verdicts, one per candidate, are committed beside this file in `round-1.code-review.json`.

## Confirmed, with the author's decision

Severity is the verifier's, not the reporter's. `R1-n` in the source column is the id the reviewer
agent gave the same defect, which is worth naming: every finding it raised was independently
confirmed by the adversarial pass.

| id | sev | file:line | the defect | reproduction | decision |
|---|---|---|---|---|---|
| 01 | high | `apps/server/src/app.ts:36` | None of the response headers NFR-2 names are sent: no CSP, `nosniff`, `frame-ancestors` or HSTS (reviewer R1-1, and the infra document's own pre-declared gap) | `curl -sI localhost:3000/api/health` returns five headers, none of them these | approved → fixed |
| 02 | high | `apps/server/src/lib/client-address.ts:10` | The per-IP write bucket is keyed on the socket peer, so behind a TLS-terminating proxy the whole site shares one allowance (reviewer R1-7, session 9) | Behind a one-hop proxy, 45 posts from 45 forwarded clients: five distinct users refused with 429 from the fortieth on | approved → fixed |
| 03 | high | `packages/shared/src/client/chat-client.ts:66` | The back-fill cursor is the store's last message, which includes ones this browser posted, so a reconnect skips everything others said meanwhile while the indicator still reads "Live" | Post with the socket down, reconnect: the gap is asked for after the local message, not the last server one | approved → fixed |
| 04 | high | `packages/shared/src/client/chat-client.ts:160` | `subscribe` returns before the HTTP back-fill when the socket is not live, so a room opened with the socket down shows no history at all, against PRD §4 | With a socket double that never opens, `subscribe` issues zero history requests | approved → fixed |
| 05 | high | `scripts/start/main.ts:84` | The wizard rewrites `.env` on every run with a fresh password, where architecture §11.3 says an existing one is kept (reviewer R1-2) | Second `./start-wolfchatter --yes` in Docker mode: the volume keeps run one's password and the app is locked out of its own database | approved → fixed |
| 06 | medium | `Dockerfile:16` | The bundle is built inside the image, so the tile answer the wizard wrote never reaches it and the chosen tiles are silently discarded | Pick OpenStreetMap, `docker compose up --build`: the map still asks Stadia and answers 401 off localhost | approved → fixed |
| 07 | medium | `apps/server/src/app.ts:40` | The Origin allowlist reaches only the upgrade; architecture §8 requires it on HTTP too (reviewer R1-5) | `curl -X POST /api/rooms -H 'origin: https://evil.example'` is answered 201 | approved → fixed |
| 08 | medium | `apps/server/src/index.ts:39` | The built assets are served with no cache policy, and this adapter never answers 304, so every revalidation re-downloads the whole bundle | `curl -sI /assets/index-*.js` carries no `Cache-Control` | approved → fixed |
| 09 | medium | `apps/web/src/App.tsx:83` | `failedToOpen` is never cleared by a marker click, so after one refused creation every pin shows the error where FR-3 asks for the room's title, and FR-9's focus move stops working (reviewer R1-3) | Fail a creation, click a pin: no heading with the room's name is in the tree | approved → fixed |
| 10 | medium | `apps/web/src/index.css:49` | Leaflet's zoom controls ship at 26 to 30 px, under the 44 px FR-10 requires, and a rule at one selector loses to Leaflet's touch rule | The parsed stylesheet computes `auto` for both controls | approved → fixed |
| 11 | medium | `apps/web/src/map/map-taps.tsx:42` | A click outside the primary world copy carries a longitude no room can be stored at, so the pin the user just saw is taken back | Pan past the 180th meridian and click: the schema refuses the point | approved → fixed |
| 12 | medium | `apps/web/src/messages/message-composer.tsx:42` | A successful send clears the whole field, losing anything typed while the request was in flight | Type on during a slow send: the continuation disappears with the sent words | approved → fixed |
| 13 | medium | `apps/web/src/rooms/room-panel.tsx:130` | The bottom safe-area inset is padding inside a pinned height, so on a device with an inset it eats the peek's newest-message line, which §12 says is the peek's whole reason | With a bottom inset, the peek row is clipped by the inset's height | approved → fixed |
| 14 | medium | `apps/web/vite.config.ts:5` | The proxy targets hardcode the API port, so any answer but the default breaks both hot-reload modes behind a URL that still serves a page | Answer 3001 at the prompt: every `/api` and `/ws` request goes to a dead port | approved → fixed |
| 15 | medium | `packages/shared/src/client/chat-client.ts:71` | The catch-up reads one page and stops, so a gap longer than a page is truncated for the life of the session | A gap of more than 200 messages leaves the remainder unread | approved → fixed |
| 16 | medium | `packages/shared/src/client/chat-store.ts:103` | The arriving room list rescues only *pending* pins, so a room confirmed while it was in flight is dropped off the map, against FR-7 (reviewer R1-4) | `storeRoom(announced)` then `setStoredRooms([other])`: the announced room is gone | approved → fixed |
| 17 | medium | `packages/shared/src/schema/message.ts:4` | A U+0000 in a username or body passes validation and dies in the driver, so a crafted post is answered 500 where FR-8 requires a 4xx | Post a body containing a NUL: 500 rather than 400 | approved → fixed |
| 18 | medium | `scripts/start/main.ts:84` | Mode 0600 is guaranteed only for a file the wizard created, although architecture §11, the README and the code's comment all state it plainly | An `.env` created by hand keeps its own, usually world-readable, permissions | approved → fixed |
| 19 | medium | `scripts/start/plan.ts:27` | The dev server is started without waiting for the database, so it can lose the race against `initdb` and stay down behind a URL that answers | `docker-database` mode on a cold volume: the API is dead and the page is not | approved → fixed |
| 20 | medium | `start-wolfchatter:6` | The Node version check lives inside the TypeScript entry point, so on a Node too old to strip types the process dies in the loader before it can explain why | Run it on Node 20: a stack trace instead of the one-line fix | approved → fixed |
| 21 | low | `apps/server/src/app.ts:19` | A genuine 500 is logged as `String(error)`, dropping the stack, so the request id the client quotes leads nowhere | Reject a query during `GET /api/rooms`: the log holds a message with no frame | approved → fixed |
| 22 | low | `apps/server/src/index.ts:38` | The static root is resolved against the working directory, which differs between `npm run dev` and the container, so every dev boot prints a wrong-looking error | Boot from any other directory: `serveStatic` reports the root missing | approved → fixed |
| 23 | low | `apps/server/src/lib/api-error.ts:13` | Every refused request writes a log line, the unmatched `/api` path carries no rate limiter, and the compose file bounds no log driver | 1000 requests to unmatched paths wrote 1000 lines and 80,890 bytes | approved → fixed, in the compose file |
| 24 | low | `apps/server/src/lib/rate-limit.ts:28` | The refused caller's address is logged, which contradicts architecture §8's "no PII stored or logged" (reviewer R1-9) | Exceed the write allowance: the address is in the log line | approved → **the document was wrong**, not the code |
| 25 | low | `apps/server/src/ws/hub.ts:68` | A broadcast is serialised once per recipient rather than once per frame | One room creation performs one `JSON.stringify` per open connection | approved → fixed |
| 26 | low | `apps/web/src/App.tsx:93` | The tapped-room latch is never spent, so returning to that room by its marker re-opens the sheet expanded, where §12 says a marker leaves a peek (reviewer R1-8) | Tap the map, then tap that marker again: the sheet is expanded, not a peek | approved → fixed |
| 27 | low | `apps/web/src/components/app-header.tsx:11` | The header takes the vertical safe-area insets but not the horizontal ones, so a notched phone in landscape clips the wordmark | With a left inset, the mark sits under the notch | approved → fixed |
| 28 | low | `packages/shared/src/client/chat-client.ts:134` | A replaced socket's close event still schedules a reconnect, so the client can open a second connection beside a live one | Replace the socket and fire its close: a retry is armed | approved → fixed |
| 29 | low | `packages/shared/src/client/chat-client.ts:74` | A late page is written into the store even when a newer catch-up owns the room, so the room can go backwards | Hand a stale page after a second catch-up started: the room reverts | approved → fixed |
| 30 | low | `packages/shared/src/client/chat-client.ts:68` | A back-fill request that never settles holds the room's live messages behind it forever | Never resolve `fetchHistory`: the room stays silent | **declined — out of scope, frozen on 5 September** |
| 31 | low | `packages/shared/src/client/chat-client.ts:138` | A first connection that never came up is announced as "reconnecting", which is the wrong sentence for the FR-9 status region | Close before the first open: the status reads reconnecting | approved → fixed |
| 32 | low | `packages/shared/src/client/chat-client.ts:110` | A subscribe frame refused by the server's rate limit leaves the client's followed set and the hub's disagreeing for the session | Burst past the frame allowance: the room is followed locally and not on the hub | **declined — out of scope, frozen on 5 September** |
| 33 | low | `packages/shared/src/schema/api-error.ts:19` | `apiErrorSchema` and `ApiError` have no consumer outside their own test, which the no-dead-code rule forbids (reviewer R1-10) | `grep` for either outside `schema/` and the tests returns nothing | approved → fixed by giving it its one honest consumer |
| 34 | low | `scripts/start/answers.ts:18` | `--help` and `--reconfigure`, which architecture §11.5 promises, do not exist; `--help` on a piped stdin runs a full Docker build | `./start-wolfchatter --help < /dev/null` builds instead of printing usage | approved → fixed |
| 35 | low | `scripts/start/main.ts:86` | The printed path to the embedded database is not the one the server uses, so anyone following it to back it up finds nothing | The wizard prints `./data/pg`; the data is in `apps/server/data/pg` | approved → fixed |

### Where each repair landed

Every fix is its own commit, grouped so that a commit is coherent on its own and reads as one
decision. The finding numbers are the first column of the table above.

| commit | closes | |
|---|---|---|
| `0f625f9` | 01, 07, 21 | the security headers, the origin gate on writes, a fault's stack in the log |
| `17554c5` | 02 | the client address behind a trusted proxy |
| `17607f9` | 08, 22 | the asset cache policy and the anchored web root |
| `31a221d` | 25, 33 | one serialisation per broadcast, and the error body typed by the shared schema |
| `6b49f3b` | 03, 04, 15, 16, 28, 29, 31 | the back-fill cursor, the history with the socket down, the paged gap, the room the list missed |
| `0b0d1e9` | 17 | the code point the text columns cannot hold |
| `0d15f8d` | 09, 10, 11, 12, 13, 26, 27 | the room heading, the typed words, the peek, the touch targets, the safe areas |
| `cbb329d` | 05, 06, 14, 18, 19, 20, 23, 34, 35 | the whole first-run path |
| `df7f8df` | — | the reviewer agent's own notes kept out of the repository |

Two findings the round produced against **its own fixes**, caught reviewing the diff and repaired in
the same pull request: the new page-chasing loop asked for a page after a cold read, although the
server answers a cold read with the newest page and there is nothing past it; and a mistyped flag
printed the usage and exited zero, so a script wrapping the wizard could not tell a typo from a run.

## Reported and refuted

Listed because the decision not to act is part of the record, and because the list is what "the
reviewer always reports something" looks like in practice.

| # | file:line | why it is not a finding |
|---|---|---|
| 36 | `apps/server/src/db/create-db.ts:9` | Real about PGlite, unreachable in this program: the embedded location is a literal in index.ts and no env var feeds it… |
| 37 | `apps/server/src/db/create-db.ts:21` | Same file and branch as index 9 seen from the other side; the mkdir it wants deleted is the one that keeps a fresh clone's first embedded boot alive. |
| 38 | `apps/server/src/db/db.ts:8` | The proposed interface split breaks migrate.ts:49 at compile time and, on PGlite, at run time — the escape-hatch the comment excludes is a driver-specific API, which `exec` is not. |
| 39 | `apps/server/src/db/migrate.ts:31` | Real for step 1 of the scale-out, which is documented and not built; today it is a missing sentence in the infra document, not a defect in a shipped path. |
| 40 | `apps/server/src/env.ts:9` | Misconfiguring the allowlist already fails loudly with a log line naming the refused origin, and the URL-validation fix would break `capacitor://localhost`… |
| 41 | `apps/server/src/index.ts:25` | Two identical expressions reading the same clock, in the one file the coverage gate excludes; CLAUDE.md's own rule is no abstraction before the third repetition… |
| 42 | `apps/server/src/lib/api-error.ts:1` | The observation is factually right and factually incomplete; adding 18 test files that assert framework behaviour would breach the 'test behaviour… |
| 43 | `apps/server/src/lib/caller-allowances.ts:16` | The finding's own remedy is unachievable: a forgotten caller and a remembered full caller behave identically by construction, so behaviour cannot see the sweep. |
| 44 | `apps/server/src/lib/caller-allowances.ts:31` | The O(n) case exists but starts at 20,000 distinct source addresses per second, 400x the load-tested ceiling — and the proposed remedy would reset a throttled attacker's allowance on demand. |
| 45 | `apps/server/src/lib/only-row.ts:6` | A consistency complaint built on a false equivalence — the asymmetry is the message id-collision case, which the room table cannot have. |
| 46 | `apps/server/src/lib/reject-invalid-input.ts:16` | Type hygiene dressed as a bug: the failing input the finding needs has no way into this function today, and closing it costs a branch no test can reach. |
| 47 | `apps/server/src/messages/queries.ts:58` | First-write-wins inside the room and 409 across rooms is the documented rule in architecture.md §3, tested at queries.test.ts:72 and :87; the client cannot reuse an id anyway… |
| 48 | `apps/server/src/messages/routes.ts:26` | Two repetitions, not three, and the maintenance risk the finding imagines is already caught by the parameterised 404 test. |
| 49 | `apps/server/src/messages/routes.ts:26` | The redundancy is real and the arithmetic is right, but it costs 0.1 ms against a 50 ms budget… |
| 50 | `apps/server/src/messages/routes.ts:48` | The foreign key carries the fact but not the 404: without the pre-check an unknown-room POST becomes a 500, which FR-8 forbids. |
| 51 | `apps/server/src/messages/routes.ts:59` | The two statements are in the order the finding says, but the order is unobservable — the response is written after the handler returns either way… |
| 52 | `apps/server/src/rooms/queries.ts:53` | Deliberate and documented: the PRD sizes this at a few hundred rooms and names the viewport bounding-box query as the next step; measured 3.2 ms and 40 KB at that size… |
| 53 | `apps/server/src/ws/hub.ts:75` | No behaviour is affected and nothing is hidden: the parameter carries ws's `RawData` type and is consumed one line later, so this is a naming preference, not a defect. |
| 54 | `apps/server/src/ws/hub.ts:130` | The handler discards the error on purpose — its two documented jobs are keeping an unhandled `error` from killing the process and dropping the socket… |
| 55 | `apps/server/test/support/api.ts:65` | A reuse preference, not a defect: two identical copies of a four-line builder inside one feature each… |
| 56 | `apps/web/src/components/app-header.tsx:8` | The observation is true and the conclusion is a preference: no input produces a wrong result, no repro exists, and the repair is code motion plus a new component the PRD never asked for… |
| 57 | `apps/web/src/map/chat-map.tsx:62` | A style preference about a duplicated one-line lookup whose two sites cannot diverge; the harm it names is conditional on a change nobody has proposed. |
| 58 | `apps/web/src/messages/message-draft.ts:36` | Real duplication, but no wrong behaviour and no runnable reproduction against the current tree; under the 5 September freeze this is a tidy-up to decline or defer. |
| 59 | `apps/web/src/messages/message-draft.ts:36` | Restates index 26; verified only that the zod 4 `maxLength` the fix depends on is really there, so the option is open if he decides the duplication is worth one commit after the freeze. |
| 60 | `apps/web/src/messages/message-list.tsx:13` | A defensible refactor, but it is a preference with no reproduction, it touches three features during a feature freeze, and the four sites are five lines each… |
| 61 | `apps/web/src/messages/use-chat-store.ts:8` | A naming preference with no reproduction; the strongest part of it is that the file name promises a hook that is not there, which one rename would settle if he ever reopens the tree. |
| 62 | `apps/web/src/rooms/is-small-viewport.ts:7` | Second repetition of a one-line guard in two different features — the project's own rule says wait for the third… |
| 63 | `apps/web/src/rooms/room-panel.tsx:70` | A style preference, not a defect: the four `<picture>` blocks differ in alt, size and animation, the two empty states sit in two different features… |
| 64 | `apps/web/src/rooms/room-requests.ts:5` | The shared schema is already the single source of truth; `z.array()` of it is a call, not a second statement of the shape… |
| 65 | `apps/web/src/rooms/use-selected-room.ts:20` | The two builders agree character for character on every URL this app produces; the claimed "two presses of back per room" needs a hand-edited query with a %-escape and still cannot repeat. |

## What was fixed, what was not, and why

Of the thirty-five confirmed findings, thirty-two were repaired in code, one was answered by
correcting the document rather than the code, and two were declined.

The two declined ones are declined for the same reason and it is worth stating plainly: their repair
would be new behaviour, and the project has been under a feature freeze since 5 September. A deadline
on a stalled back-fill is a timeout policy with its own failure surface that no requirement asks for,
and repairing the drift between the client's followed rooms and the hub's would mean either a retry
protocol on the client or an exemption in the server's frame limit. Both are defensible features.
Neither is a defect in something that exists, and adding a feature on the last day reads worse than
naming it as future work.

The one that moved into the document is the caller's address in a rate-limit log line. The rule said
"no PII stored or logged" without qualification; the code logs an address only when refusing a write,
which is the single thing that tells one flood from many callers and is exactly what makes a 429
actionable. The honest repair was the sentence, not the line of code, so §8 now carries the exception
and its reason.

Three of the fixes needed a setting rather than a constant, and each one is unset by default, so
nothing changes for `npm run dev` or `docker compose` on one machine: the trusted client header, the
tile build arguments, and the port the Vite proxy reads. The trusted client header deserves a note of
its own, because it is the only fix that adds configuration to a security control. It is unset by
default and the socket peer stays the address, which is the only safe default; a deployment behind a
proxy names the header its own proxy appends, and only then is that header read. Setting it where
there is no proxy would let a caller name itself, and `.env.example` says so.

Every fix ships with a regression test in the mirrored `test/` tree, and each was run against the
unmodified source first to confirm it fails there. A handful of the new tests do not fail beforehand,
and that is said here rather than left to be discovered: they exist to cover branches the fixes
introduce, which the 100% gate requires, not to reproduce a defect that was there.

| | before | after |
|---|---|---|
| Tests | 506 | 578 |
| Test files | 55 | 58 |
| Coverage | 100% | 100% |

## The audit's findings, so this table is the whole record

The deploy-readiness audit ran next, against the running production image rather than against
the source, and raised nine more. They are listed here in full in
[docs/audit/README.md](../audit/README.md), with the measurement behind each one; this table
carries them so that "what was repaired, what was not and why" has one address. Source
`audit` in the last column.

| id | sev | where | the defect | reproduction | decision |
|---|---|---|---|---|---|
| A1-1 | high | `apps/server/src/app.ts:44` | `no-referrer`, the framework's default for the headers round 10 added, strips the `Referer` the tile server authenticates by, so the map is blank in the production image | Lighthouse against the container: 25 of 25 tile requests answered 401; the same tile fetched with a `Referer` answers 200 | audit → approved → fixed |
| A1-7 | high | `apps/server/src/index.ts:64`, `app.ts:113` | Nothing was compressed, so a browser downloaded 451 KB of JavaScript for a bundle NFR-1 budgets at 137 KB gzipped | `curl -sI -H 'Accept-Encoding: gzip' /assets/index-*.js` carries no `content-encoding` | audit → approved → fixed |
| A1-2 | medium | `apps/server/src/ws/hub.ts:19` | The queue bound reads what this process holds, which the kernel's send buffer fills before; the 512 KiB the code named was never the ceiling | a paused subscriber received 5,000 of 5,000 frames, 3.3 MiB, with no drop | audit → approved → **the comment was wrong**, not the behaviour |
| A1-3 | medium | `docker-compose.yml:36` | `.env.example` documents `TRUSTED_CLIENT_HEADER` and compose never forwarded it, so finding 02's repair was unreachable in the deployment artefact | set it in the env file, then read it inside the container: `UNSET` | audit → approved → fixed |
| A1-8 | medium | `apps/web/src/App.tsx:43` | A handler rebuilt on every render kept the marker layer's `memo` from ever holding, against NFR-1 and the layer's own comment | 5 arriving messages produced 5 layer renders; the committed test reads `expected 12 to be 6` without the fix | audit → approved → fixed |
| A1-4 | low | `apps/server/src/app.ts:47` | `X-Frame-Options: SAMEORIGIN` was sent beside `frame-ancestors 'none'` | `curl -sI /` carries both, disagreeing | audit → approved → fixed |
| A1-5 | low | `apps/server/src/app.ts:31` | No `base-uri` and no `form-action`, neither of which falls back to `default-src` | `curl -sI /`; Chrome also logged that `script-src` was not set | audit → approved → fixed |
| A1-6 | low | `Dockerfile:31` | Four of the image's six high-severity advisories are npm's own vendored dependencies, which the runtime never runs and `npm audit` cannot see | `trivy image` on the runtime image: 6 HIGH, 2 after removing npm | audit → approved → fixed |
| A1-9 | low | — | `/robots.txt` is answered by the single-page shell with a 200 | Lighthouse SEO 92, 27 parse errors | audit → **declined — out of scope, frozen on 5 September** |

## Reproducing this round

```sh
./scripts/review.sh 1          # the committed reviewer configuration, headless, schema-validated
/code-review high apps/server  # and again for apps/web, packages/shared, scripts/start
npm run check                  # the gate every fix had to leave green
```

`round-1.code-review.json` holds one verdict per candidate, including the refuted ones, so the table
above can be checked against the evidence rather than taken on trust. Two kinds of value are redacted
in it: the throwaway database passwords a reproduction generated while proving the wizard overwrites
`.env`, and a local network address. The commit hook that refuses a staged credential is what caught
them, which is the hook doing exactly the job it was written for.
