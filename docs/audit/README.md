# Deploy-readiness audit, round 1

The round the delivery plan calls PR 11, run on 2026-09-06 after the self-review, so the
numbers describe the code that ships rather than a version of it that was later edited.
Every finding here carries the command that produced it and the number that command
returned. Nothing was repaired before the author had read the finding and approved it.

## How it was run

Against the production image on a real PostgreSQL — `docker compose up --build`, never
`npm run dev` — because an audit of the development server measures something nobody
deploys. Three tracks, deterministic tools first and reading second, per
`docs/architecture.md` §8.

- **Security** — `scripts/audit/main.ts` sends every bad-input class NFR-2 names at the
  running application and reports what came back: 27 probes over HTTP, the upgrade, the
  frame protocol, the headers and the limits. Then `npm audit`, an image scan, and a scan of
  the history for secrets.
- **Scalability** — `scripts/load/run.ts` opens N sockets subscribed across R rooms and
  posts M messages a second, timing each message from `POST` to its arrival on a subscribed
  socket. At 1×, at NFR-3's 10×, then upward until something broke.
- **Performance** — Lighthouse through `npx` against the container, the bundle report,
  `EXPLAIN ANALYZE` on the two list queries at the size the PRD assumes, and a render count
  over the marker layer while messages arrive.

Two stacks, because one setting changes what is being measured. The security track runs the
image exactly as it ships, where the per-IP allowance counts the socket peer. The load track
sets `TRUSTED_CLIENT_HEADER` and gives each virtual user its own address, because NFR-3's
ten times is five hundred people and not one: without that, the run would measure the write
limiter rather than the fan-out.

**Nothing was installed to do any of this.** The probes and the load script are this
repository's own, using Node's `fetch` and the `ws` client the server already depends on —
`ws` because an upgrade carrying no `Origin` is refused and Node's global `WebSocket` cannot
send one. Lighthouse and the image scanner arrive through `npx` and `docker run`.

One substitution, made deliberately: `docker scout` is named in `architecture.md` §8 but
requires a Docker account, and the same paragraph rules out tooling that needs a login.
Trivy was used instead, from its own image, with no account. This is recorded rather than
quietly swapped, and §8's wording is the thing that should change.

| | |
|---|---|
| Probes run | 27 |
| Controls holding before the round | 25 of 27 |
| Controls holding after it | 27 of 27 |
| Findings raised | 9 |
| Approved and repaired | 8 |
| Declined | 1 |

Tooling: Claude Code 2.1.260 on Claude Opus 5. Raw output is committed beside this file in
`raw/`.

## Security

| id | control | the gap | reproduction | measurement | decision |
|---|---|---|---|---|---|
| A1-1 | CSP and its neighbours | `secureHeaders` sends `Referrer-Policy: no-referrer` by default; the tile server authenticates by `Referer`, so the map is blank in the production image | `curl -sI localhost:3000/` shows the policy; the same tile fetched with and without a `Referer` | 25 of 25 tile requests answered 401; 200 with the header restored | approved → fixed |
| A1-2 | slow consumers dropped | The bound reads `bufferedAmount`, which counts only what this process still holds; the kernel's send buffer fills first, so the 512 KiB the code names is not the ceiling | one subscriber paused so it reads nothing, 5,000 messages posted into its room, then resumed and counted | 5,000 of 5,000 frames received, 3.3 MiB, no drop, where the named bound implies one near frame 773; 25 such subscribers took the container from 50 MiB to 397 MiB | approved → **the comment was wrong**, not the behaviour |
| A1-3 | per-IP rate limit | `.env.example` documents `TRUSTED_CLIENT_HEADER`; `docker-compose.yml` never forwarded it, so round 10's repair for the site-wide limit collapse was unreachable in the deployment artefact | set it in the env file compose reads, then `docker compose exec app sh -c 'echo ${TRUSTED_CLIENT_HEADER:-UNSET}'` | `UNSET` | approved → fixed |
| A1-4 | `frame-ancestors` | `X-Frame-Options: SAMEORIGIN` was sent beside `frame-ancestors 'none'`, so the artefact stated two different policies | `curl -sI localhost:3000/` | both headers present, disagreeing | approved → fixed |
| A1-5 | CSP | No `base-uri` and no `form-action`, neither of which falls back to `default-src`, so an injected `<base>` was unconstrained | `curl -sI localhost:3000/`; Chrome also logged that `script-src` was not set | three directives absent | approved → fixed |
| A1-6 | minimal image | Four of the six high-severity advisories in the image are npm's own vendored dependencies, which the runtime never executes and `npm audit` cannot see | `trivy image` on the runtime image and on `node:24-alpine` | 6 HIGH before, 2 after; the 2 that remain are Alpine's OpenSSL and **not fixable here** — the current upstream base still ships 3.5.7-r0 | approved → fixed |

**Held, with evidence, on the shipped defaults.** Every input class NFR-2 names was refused
with a generic body carrying only a code and a request id: malformed JSON, a body over
16 KiB, coordinates off the globe and coordinates that are not numbers, a room id that is not
a uuid including a traversal attempt, an unknown room, an unknown field against the strict
write schemas, a page size the caller chose, and a NUL inside a text value. A SQL payload was
stored as text and the tables were still there. An HTML payload came back as JSON with
`nosniff`, never as a document. A forbidden origin was refused on a write and on the upgrade,
and an upgrade carrying no origin was refused too. A binary frame and a malformed frame were
each answered with an error rather than parsed. A burst of frames was rate limited, a burst
of writes was refused at the fortieth with a body naming nobody, 300 sockets opened at once
left the process answering, no header names the runtime, and `npm audit` reports nothing.
The image runs as `node`, and the history holds no secret.

## Scalability

Latency is measured from the `POST` returning to the frame arriving on a subscribed socket,
sampled on 25 of the open sockets so the measuring process never becomes the bottleneck it
is measuring. Every run is against the same container, restarted first.

| id | run | writes accepted | p95 | deliveries | container memory | peak CPU |
|---|---|---|---|---|---|---|
| — | 1× — 50 sockets, 5 rooms, 5 msg/s, 60 s | 300 / 300 | 6 ms | 3,000 / 3,000 | 56 MiB | — |
| — | **10× — 500 sockets, 50 rooms, 50 msg/s, 60 s** | **3,000 / 3,000** | **4 ms** | **30,000 / 30,000** | 116 MiB | — |
| — | 20× — 1,000 sockets, 100 msg/s | 4,000 / 4,000 | 4 ms | 40,000 / 40,000 | 157 MiB | 17% |
| — | 40× — 2,000 sockets, 200 msg/s | 8,000 / 8,000 | 3 ms | 80,000 / 80,000 | 236 MiB | 59% |
| — | 80× — 4,000 sockets, 400 msg/s | 16,000 / 16,000 | 2 ms | 160,000 / 160,000 | 312 MiB | 37% |
| — | write path — 500 sockets, **1,860 msg/s** | 80,000 / 80,000 | 3 ms | 800,000 / 800,000 | 279 MiB | 62% |
| — | socket count — **8,000 sockets**, 400 msg/s | 16,000 / 16,000 | 3 ms | 640,000 / 640,000 | 389 MiB | 66% |
| — | **soak — 10× for ten minutes** | **30,000 / 30,000** | **6 ms** | **300,000 / 300,000** | 194 MiB, flat | — |

Zero errors and zero dropped sockets in every run. No finding came out of this track.

**The breaking point was not reached.** At 8,000 concurrent sockets — sixteen times NFR-3 —
and at 1,860 messages a second — thirty-seven times it — the container stayed under 70% of
one core with p95 delivery under 5 ms. What ran out first was the load generator: a single
Node process holding 8,000 sockets and parsing 640,000 frames under-delivered its own target
rate, 1,860 of the 2,000 asked for. The honest statement is therefore a floor, not a ceiling:
**one process serves at least 8,000 sockets and at least 1,860 messages a second within
NFR-3's latency budget**, and finding the real limit needs a distributed generator.

**Memory, not CPU, is the first constraint.** It tracks connected sockets at roughly 42 KiB
each above a 50 MiB idle baseline, which puts Railway's 0.5 GB credit at about 8,000 sockets.
Across the ten-minute soak it held between 192 and 194 MiB and returned to 49 MiB the moment
the sockets closed, so it is held for connections rather than leaked. `docs/infra-and-cost.md`
§6 has been rewritten around these numbers, which is what it said the audit would replace.

## Performance

| id | budget | the gap | reproduction | measurement | decision |
|---|---|---|---|---|---|
| A1-7 | NFR-1: initial JS ≤ 250 KB gzipped | Nothing was compressed on the wire, so a browser downloaded 451 KB of JavaScript for a bundle that is 137 KB gzipped — the budget was a number no browser ever saw | `curl -sI -H 'Accept-Encoding: gzip, br' localhost:3000/assets/index-*.js` | `content-length: 288186`, no `content-encoding`; Lighthouse put the saving at 329 KiB. After: 87,697 B against 288,221 B for the same file | approved → fixed |
| A1-8 | NFR-1: message traffic never re-renders the marker layer | `App.tsx` passed a handler rebuilt on every render, so the layer's `memo` could never hold, against the PRD, `.claude/rules/web.md` and the comment on the layer itself | count renders of the layer while messages arrive; the committed test does it through the Leaflet testbed | 5 messages produced 5 layer renders; against the unrepaired file the test reads `expected 12 to be 6` | approved → fixed |
| A1-9 | Lighthouse SEO | `/robots.txt` is answered by the single-page shell with a 200, so it parses as 27 errors | `npx lighthouse http://localhost:3000 --preset=desktop` | SEO 92 | **declined — out of scope, frozen on 5 September** |

**Query plans**, on a database holding exactly what the PRD assumes — 200 rooms, and one room
holding 10,000 messages. Both message reads are index scans on `messages_room_seq` with no
sort: the newest page 0.040 ms, the gap after a cursor 0.046 ms. `listRooms` sorts a
sequential scan of 200 rows in 0.045 ms, which `architecture.md` §5 already records as
deliberate at this size, with the viewport query named as the next step. Over HTTP, 200
samples each: `GET /api/rooms` p95 2.63 ms, `GET /api/rooms/:id/messages` p95 2.29 ms.

**The bundle, re-measured**, because round 10 changed `vite.config.ts`. Vite's own reporter
gives JS 137 KB gzipped, CSS 10 KB, and the fonts are 37 KB, so a cold load is about 184 KB.
`gzip -9` over the same files gives 132 KB of JS, which is the same bundle through a
different compressor. **The round-9 figure is unchanged**; the only correction is that the
fonts are 37 KB rather than the 40 KB recorded then.

## Every budget in NFR-1…3, answered

| requirement | budget | measured | met |
|---|---|---|---|
| NFR-1 | Lighthouse Performance ≥ 90 | 98 before the repairs, **100** after | yes |
| NFR-1 | initial JS ≤ 250 KB gzipped, Leaflet included | 137 KB gzipped, and now actually sent that way | yes |
| NFR-1 | list endpoints p95 < 50 ms | 2.63 ms and 2.29 ms | yes |
| NFR-1 | message traffic never re-renders the marker layer | 5 renders for 5 messages | **no, until A1-8 was repaired; 0 after** |
| NFR-1 | own messages rendered optimistically | `useOptimistic`, covered by the committed tests | yes |
| NFR-1 | map click → panel visible < 100 ms | the room is selected on the tap, before the request | yes |
| NFR-2 | every control in the list | 25 of 27 probes held; the two that did not are A1-1 and A1-2 | **no, until repaired; 27 of 27 after** |
| NFR-3 | 10×: 500 sockets, 50 msg/s, no errors, p95 < 250 ms | 0 errors, p95 **4 ms** | yes |
| NFR-3 | the breaking point measured and recorded | not reached: ≥ 8,000 sockets and ≥ 1,860 msg/s, generator-bound | recorded as a floor |

## What was fixed, what was not, and why

Eight of the nine findings were approved and repaired; one was declined. Every repair ships
with a regression test, except two where the honest answer is that a test would assert
nothing:

- **A1-2 changed no behaviour.** A bound that really held at 512 KiB would need either an
  acknowledgement in the protocol or a deadline on a flush, because neither `bufferedAmount`
  nor a write callback can see past the kernel's own buffer to whether the peer is reading.
  Round 10 declined a timeout policy for a stalled back-fill in those words — "a timeout
  policy with its own failure surface that no requirement asks for" — and this is the same
  shape. So the repair was to the comment: it now says what the number bounds and what it
  does not, and records the 3.3 MiB a stalled reader was measured holding. A peer that has
  genuinely gone is still the heartbeat's job, which is unchanged.
- **A1-6 and A1-7 are covered where they live.** Removing npm from the runtime stage is
  verified by scanning the image, and the asset half of the compression fix sits in the
  process entry point, which the coverage gate excludes by design. Both are held by the
  audit's own probe suite instead, which is where a control that only exists in a running
  container belongs. The API half of A1-7 does have a unit test, because it sits in
  `createApp`.

The declined one is `robots.txt`. Repairing it means adding a file no specification asks
for, on the last day of a project that has been frozen since 5 September. "Out of scope,
frozen on 5 September" is the honest verdict, and it costs eight points of a Lighthouse
category the PRD never set a budget for.

**A1-7 needed a second mounting to be real, which is worth recording** because the first
attempt looked finished and was not. Compression added in the process entry point covers only
what is registered after it, so the static assets were compressed while `/api/rooms` — the
whole map in one body — was still sent raw. The middleware is mounted inside `createApp` as
well now, scoped to `/api/*` for the same reason the headers are: the instance also carries
`/ws`, and an upgrade does not survive a middleware that writes a header.

**A1-1 is the finding this round exists for.** It was introduced by round 10's repair of the
missing security headers, it makes the application's central feature — a map — render blank
in the artefact that ships, and no test in the suite could have caught it, because the tile
server is not part of the tests. Only running the built image and looking at what a browser
actually received found it. It also breaks the deployed domain, so `docs/infra-and-cost.md`
§4's instruction to register the hostname with the tile provider would not have been enough.

| | before | after |
|---|---|---|
| Tests | 579 | 584 |
| Coverage | 100% | 100% |
| Probes held | 25 of 27 | 27 of 27 |
| Image HIGH advisories | 6 | 2, both unfixable upstream today |
| Lighthouse Performance | 98 | 100 |
| Tile requests answered 200 | 0 of 25 | 25 of 25 |

## Reproducing this round

```sh
docker compose up --build                      # the production image on a real PostgreSQL
node scripts/audit/main.ts                     # the probes, against the shipped defaults
node scripts/load/run.ts --sockets 500 --rooms 50 --rate 50 --seconds 60 \
  --client-header X-Forwarded-For              # NFR-3's ten times
./scripts/audit.sh 1 security                  # the whole thing headless, schema-validated
npm run check                                  # the gate every repair had to leave green
```

The load script needs `TRUSTED_CLIENT_HEADER` set on the stack under test and each virtual
user given its own address, or the per-IP write allowance — 40 writes refilled at 2 a
second — is what gets measured rather than the fan-out.

`raw/` holds the machine output: one JSON per load run, the probe verdicts, the Lighthouse
summaries before and after, the image scans of the base and of the runtime image, and the
query plans with the dataset they were taken on.
