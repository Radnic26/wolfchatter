# Wolfchatter — Infrastructure and cost estimate

| | |
|---|---|
| Status | v1, delivery-plan row 9, written 2026-09-06 against `main` at `b1e92ce` |
| Prices | USD list prices excluding VAT, read on the provider's own page on 2026-09-05; a row still on the 2026-09-04 research says so. Hetzner is EUR excluding VAT |
| Measurements | this repository's production image in Linux containers under Docker Desktop, 2026-09-05 |
| Companions | `PRD.md` §3–§4 (the scale), `architecture.md` §5 (the scale-out seam), §8 (the audit that measures the breaking point) |

## 1. What is being hosted

One Node 24 process serves the HTTP API, the WebSocket hub and the built single-page app from a single origin (`apps/server/src/index.ts`) and talks to one PostgreSQL over `pg`. The browser fetches map tiles straight from Stadia Maps, so tile traffic never crosses our servers. The platform has to offer three things: WebSocket connections that stay open (the hub pings every 30 s), a region in the EU, because every message is a person's text pinned to a place, and TLS at the edge. The process is small:

| Measured on 2026-09-05 | |
|---|---|
| Production image with the `pg` driver, idle after boot | 49 MiB |
| `postgres:18-alpine`, empty database, idle | 33 MiB |
| One cold page load, gzipped: JS 137 KB, CSS 10 KB, HTML 0.6 KB, two woff2 fonts 40 KB | ≈ 190 KB |
| The same image running the embedded PGlite instead of `pg` | 330 MiB, and as the `node` user it exits with `EACCES` on `./data/pg`, because `/app` belongs to root |

The last row is why the embedded database stays what PRD §5 says it is, the zero-install local mode, and why production runs a real PostgreSQL from the first day: a quarter of the memory, and no change to the image.

## 2. Assumptions

Everything below scales from these numbers. They are the PRD's, with the arithmetic that turns them into storage, traffic and tiles written out, so a different scale changes the tables predictably.

| Quantity | Staging | Production | Source |
|---|---|---|---|
| Monthly active users | ≤ 5 testers | 500, about 2,000 sessions a month | PRD §4; sessions from the 2026-09-04 research |
| Concurrent WebSocket connections at peak | ≤ 10 | 50; the load test runs 500 | PRD §4; NFR-3 is 10× |
| Messages | < 1,000 a day | 50,000 a month, an average of 0.02 a second; design peak 5 a second; load-tested at 50 a second | PRD §4, NFR-3 |
| Rooms | tens | a few hundred, all sent on page load | PRD §4 |
| Retention | wipeable | unlimited | PRD §4 |
| Database growth | — | ≈ 0.4 GB a year at worst: 600,000 rows × ≤ 700 B (a 500-character body, a 32-character name, two uuids, `seq`, a timestamp, the `(room_id, seq)` index entry) | `architecture.md` §3 |
| Egress | < 0.5 GB a month | ≈ 1 GB a month: 2,000 cold loads × 190 KB = 0.4 GB; room lists and message pages ≈ 0.4 GB; 50,000 messages × ~10 recipients × 250 B frames = 0.13 GB | measured bundle, schema |
| Tiles | < 50,000 a month | ≈ 300,000 a month: 2,000 sessions × 150 tiles. The one figure with no measurement behind it | 2026-09-04 research |

## 3. Staging

| Component | Plan | $/month | Why this |
|---|---|---|---|
| App | Railway, a second environment of the production project, EU West (Amsterdam), App Sleeping on (2026-09-04) | ≤ 0.50, metered | The same image and variables, deployed from a branch. The service sleeps while no tester is connected: the 30 s heartbeat flows only over an open socket |
| Database | Railway PostgreSQL service in that environment | 0.32, metered: 33 MiB at $10 per GB-month | The engine production runs, wipeable |
| Tiles | Stadia Free, the staging hostname registered | 0 | 200,000 credits a month against fewer than 50,000 tiles; development and evaluation are what the free plan is for |
| CI | GitHub Actions on the public repository | 0 | Already the gate |
| **Total** | | **< 1 of metered usage, inside the Hobby plan's $5 credit: $0 on top of production** | |

## 4. Production

| Component | Plan | $/month | Why this |
|---|---|---|---|
| Plan | Railway Hobby, EU West (Amsterdam) | 5.00, including $5 of usage | WebSockets are exempt from idle timeouts (2026-09-04); billing is per second of what runs; an EU region; one service, and raw WebSockets never need sticky sessions |
| App service | RAM $10 per GB-month, CPU $20 per vCPU-month, both on use | 0.48 at the measured 49 MiB; CPU ≈ 0 idle | The audit's 1× run (`architecture.md` §8) replaces the idle figure with the average under load; the credit absorbs an average of up to 0.5 GB |
| PostgreSQL service | The same metering, plus volume at $0.15 per GB-month | 0.32, plus 0.06 of volume after the first year | The Hobby volume cap is 5 GB, more than ten years at the assumed growth. `LISTEN/NOTIFY` on this engine is the first scale step (§6) |
| Egress | $0.05 per GB | 0.05 | ≈ 1 GB a month |
| Tiles | Stadia Starter, 1,000,000 credits, domain-based authentication | 20.00 | 300,000 tiles exceed the free plan's 200,000, and a public deployment is commercial use, which the free plan excludes; 3¢ per 1,000 tiles beyond the million |
| **Total** | | **25.00: the $5 plan with under $1 of usage inside its credit, plus $20 of tiles** | |

**Before the first deploy.** The deployed hostname is registered in the Stadia dashboard, or the map answers 401 everywhere but on localhost (`architecture.md` §10), and `ALLOWED_ORIGINS` names the deployed origin, because an upgrade from anywhere else is refused (§5). Two review findings are closed first. Every platform in this document terminates TLS at its own proxy, so the process sees one address for everyone, and the per-IP allowance of 40 writes refilled at 2 a second becomes the whole site's: at the 5-a-second peak, legitimate posts get `429`. The limit has to read the platform's forwarded-client header. And the response headers NFR-2 names (CSP, `nosniff`, `frame-ancestors`, HSTS) are not yet sent by the server. Both are recorded as findings for the review round, not fixed here.

## 5. Alternatives considered

Every row was priced against at least two other options. The choice is the cheapest one that carries the requirement without putting operations on us.

| Component | Chosen | Alternative | Alternative | Why the choice |
|---|---|---|---|---|
| App hosting | Railway Hobby, $5 including usage | Fly.io shared-cpu-1x, 512 MB $3.32 or 1 GB $5.92, Amsterdam and Frankfurt priced alike; no free tier, card required | Render Starter $7 (512 MB, 0.5 CPU, Frankfurt); its free tier spins down after 15 minutes and WebSocket traffic does not count as activity (2026-09-04) | Metered billing fits a 49 MiB process; Render's fixed tier costs more for the same footprint; Fly is where the second host goes when host redundancy matters (§6) |
| App hosting, own server | — | Hetzner CX23 €5.49: 2 vCPU, 4 GB, 40 GB NVMe, Falkenstein or Nuremberg, price since 15 June 2026; Coolify or Dokploy on top | — | The cheapest compute of all, and patching, TLS, backups, rollbacks and on-call become ours |
| Database | Railway PostgreSQL service, $0.32 metered | Neon: Free, 100 CU-hours and 0.5 GB, scales to zero after 5 minutes, so the first message after a quiet spell waits for a cold start; Launch, $0.106 per CU-hour and $0.35 per GB-month, 0.25 CU always on ≈ $19.70 | Supabase Pro $25, Frankfurt, the free project pauses after a week idle; Fly Managed Postgres Basic $38 with failover, backups and pooling; Render PostgreSQL Basic-256mb $6 (2026-09-04) | 33 MiB and 0.4 GB a year make no use of a managed tier's headroom; Neon Launch or Fly's is the durability step of §6 |
| Fan-out between instances | Postgres `LISTEN/NOTIFY` on the database already paid for, $0 | Upstash Redis: Free 500,000 commands a month; pay as you go $0.20 per 100,000; Fixed 250 MB $10, Frankfurt | Render Key Value Starter $10 (2026-09-04) | No new component until a measurement asks for one; each is one `Broadcaster` implementation (`architecture.md` §5) |
| Tiles | Stadia Starter $20 | Stadia Free $0: non-commercial only, 200,000 credits, HTTP 429 after | OpenStreetMap public tiles $0: no SLA, access "may be withdrawn at any point", a policy written against production use (2026-09-04); the watercolour style exists only at Stadia | The reference map is the watercolour style; the free plan fits staging |
| Static files | Served by the app: one origin, one CSP | Cloudflare Pages Free | — | 190 KB per cold load at 2,000 sessions is not a CDN problem |

The same production, whole, on the alternatives: Fly 512 MB + Neon Launch + Stadia ≈ $43, ≈ $61 with Fly Managed Postgres; Render Starter + PostgreSQL Basic-256mb + Stadia = $33; Hetzner CX23 with PostgreSQL on the same box + Stadia ≈ €5.49 + $20, operations ours. Railway: $25.

## 6. Scale triggers

NFR-3 fixes the ceiling this design is tested to: 500 open sockets and 50 messages a second with a p95 broadcast latency under 250 ms, and the audit records where one process actually breaks. Until that number exists, each trigger fires at half the tested ceiling; the audit's breaking point then replaces the halves. Four numbers are watched, produced by the audit's load script and by the platform's metrics: concurrent sockets, p95 broadcast latency, the process's CPU (Node uses one core, so 1 vCPU sustained is the ceiling) and the p95 of the two list queries, which NFR-1 holds under 50 ms.

**Step 1: a second instance.** Fires when the weekly peak passes 250 concurrent sockets, when p95 broadcast latency at that peak passes 125 ms, when the service sits at 0.5 vCPU sustained, or earlier, when a deploy is no longer allowed to drop every open socket. What changes: a `Broadcaster` over Postgres `LISTEN/NOTIFY`, exactly as `architecture.md` §5 describes it — the write route publishes the row's id, every instance re-reads the row and fans it out to its own sockets, ordering stays the database's — plus one direct connection per instance for `LISTEN`. Not a line of the routes changes, and a lost notification is already covered, because the row is in the database before it is announced and the client back-fills by id. On Railway this is a second replica of the same service (Hobby allows six; routing is random, which raw WebSockets tolerate).

**Step 2: a database with point-in-time recovery and failover.** Fires on the value of the data, not on load: when the recovery point has to be shorter than the backup interval set on the Railway volume, or when a volume on one host is no longer an acceptable single point of failure. Neon Launch at 0.25 CU always on, with scale-to-zero off because a `LISTEN` session dies with its compute (Neon's compatibility notes); or Fly Managed Postgres Basic, failover included. What changes: `DATABASE_URL`.

**Step 3: Redis for the fan-out.** Fires when the database is measurably the message bus's bottleneck: more instances than a database should serve `LISTEN` connections to, or `NOTIFY` visible in the p95. Upstash Fixed 250 MB in Frankfurt; pub/sub is at-most-once, which the persisted row and the backfill already make safe. What changes: a second `Broadcaster` implementation.

| After | Monthly bill | In the code |
|---|---|---|
| Today: one instance, Railway PostgreSQL | $25 | — |
| Step 1: a second replica, `LISTEN/NOTIFY` | ≈ $25; $0.48 more of usage, still inside the credit | one `Broadcaster` implementation |
| Step 2: Neon Launch ≈ $19.70, or Fly Managed Postgres $38 | ≈ $45, or ≈ $63 | `DATABASE_URL` |
| Step 3: Upstash Redis $10 | + $10 | one more `Broadcaster` implementation |
| The same on two Fly hosts in Frankfurt: 2 × 1 GB $11.84, Neon $19.70, Stadia $20, egress $0.02 | ≈ $52; ≈ $62 with Redis | as above |

## 7. Not included, and why

| Item | Cost when added | Why it is not in the tables |
|---|---|---|
| Domain and DNS | a `.com` ≈ $10.46 a year at Cloudflare Registrar, ≈ $0.87 a month (tracker price, 2026-09-04) | The platform subdomain works from the first deploy and Stadia registers either hostname; a brand domain is a product decision |
| TLS | $0 | Terminated at the platform's edge with its certificate, for the subdomain and for a custom domain alike. HSTS is then the app's to send on the proxied request: part of the headers finding in §4 |
| Backups | $0: scheduled volume backups are part of the Railway service, and a `pg_dump` to Cloudflare R2 fits its free 10 GB (2026-09-04) | The interval is the recovery point; when it is too long, that is step 2 of §6, priced there |
| Monitoring and alerting | $0: Sentry Developer, 5,000 errors a month (Team $26 beyond), and Better Stack Free, 10 monitors at 30 s (2026-09-04) | Nothing is deployed yet; the health endpoint and the container healthcheck exist for the day it is |
| Stadia domain registration | $0 | Required, or the map is blank with 401s on any host but localhost; listed because forgetting it is the failure mode |
| WAF and DDoS protection | $0 at the platform's edge | The app's own limits, 16 KiB payloads and token buckets per connection and per caller, are the second line |
| Secrets manager | $0 | One secret exists, the database password, held as a platform variable; the repository holds none (`architecture.md` §8) |
| CDN for the static files or the API | $0 | One origin at 190 KB per load; Cloudflare in front when the audience becomes intercontinental |

## 8. Why not AWS

The shape a CloudFormation team reaches for — ECS Fargate tasks behind an Application Load Balancer, RDS PostgreSQL, ECR, Route 53, CloudWatch — bills by the hour for things that exist whether or not anyone chats. On the pages read on 2026-09-05, US East list prices, Frankfurt's tables did not render: the load balancer is $0.0225 an hour, $16.43 a month before the first request, plus $0.008 per LCU-hour; a NAT gateway, the moment the tasks sit in a private subnet, is $0.045 an hour, $32.85 a month, plus $0.045 per GB processed; a Fargate task of 0.25 vCPU and 0.5 GB on Linux/x86 is $0.000011244 per vCPU-second and $0.000001235 per GB-second, $9.01 a month, $18.02 for two. That is $67 before the database, the registry, the logs and the DNS, against $25 for the whole of §4, and none of those lines moves a message. RDS prices did not render and are deliberately not estimated.

The AWS shape that does fit this scale is Lightsail: a $7 instance (1 GB, 2 vCPUs, 40 GB, 2 TB of transfer) and a $15 managed PostgreSQL (1 GB, 40 GB; $30 with high availability), $22 before tiles and $42 with Stadia, against $25. It gives up what Railway is paid for: billing is by fixed bundle, the instance is a virtual server whose operating system, reverse proxy, certificate and deploy script are ours, and a second instance means an $18-a-month Lightsail load balancer. It is the Hetzner trade at AWS prices.

What AWS buys is VPC isolation, IAM, compliance paperwork and one account for everything. The day the organisation already runs on it, with a VPC layout, IAM conventions and CloudFormation in place, the fixed lines are shared across services and the operations surface is already staffed, and the port is mechanical: the same image on Fargate (it idles at 49 MiB), the load balancer's idle timeout above the 30 s heartbeat (it carries WebSockets), the smallest RDS PostgreSQL, `DATABASE_URL` and `ALLOWED_ORIGINS` as task variables. Nothing in the code changes, because the code depends on PostgreSQL and a TCP port and on nothing else. The trigger to move is organisational, not technical. API Gateway's WebSocket API and Lambda are not on that path: the hub is a process that holds sockets and a room map, and those would have it rewritten.

## 9. Sources

Read on 2026-09-05: `railway.com/pricing`, `docs.railway.com/reference/volumes`, `fly.io/docs/about/pricing`, `fly.io/docs/mpg`, `neon.com/pricing`, `neon.com/docs/reference/compatibility`, `upstash.com/pricing/redis`, `stadiamaps.com/pricing`, `aws.amazon.com/lightsail/pricing`, `aws.amazon.com/elasticloadbalancing/pricing`, `aws.amazon.com/vpc/pricing`, `aws.amazon.com/fargate/pricing` (the rates quoted in its examples). Read on 2026-09-04 and not re-read: `render.com/pricing`, `docs.hetzner.com` price adjustment of 15 June 2026, `supabase.com/pricing`, `docs.railway.com/reference/regions`, `/reference/app-sleeping` and `/guides/postgresql`, `sentry.io/pricing`, `betterstack.com/pricing`, `developers.cloudflare.com/r2/pricing`, `operations.osmfoundation.org/policies/tiles`, `docs.stadiamaps.com/authentication`; the `.com` price is from a registrar price tracker, not from Cloudflare's page.
