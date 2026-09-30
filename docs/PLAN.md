# 🏆 ReachInbox Internship Assignment — Winning Master Plan

**Goal:** Not just complete the assignment — submit something that looks like it was built by engineers who already work at ReachInbox.

**Core strategy in one line:** Every other team will build "a scheduler that passes the checklist." You will build **a miniature ReachInbox** — mirroring their actual product features (Onebox, sender rotation, Spintax, spam checking, AI copy, analytics) on top of a bulletproof scheduling core, deployed live on your VM with a rehearsed demo.

---

## Part 1 — Know the Company (Why This Wins)

ReachInbox (by Outbox Labs, founded 2023 by Alan D'Souza) is an AI cold-email platform. Their real product features:

| ReachInbox Product Feature | Your Assignment Mirror |
|---|---|
| **Onebox** — unified inbox for all replies, auto-categorized by sentiment | Unified "Sent" view + Elasticsearch full-text search + status categorization |
| **Unlimited email accounts + auto-rotation** | Multi-sender support with round-robin sender rotation across Ethereal accounts |
| **Per-mailbox daily/hourly quotas** (their "Daily User Sending Quota" error) | Per-sender hourly rate limits (already required — make it product-grade) |
| **Spintax Generator** — `{Hi|Hello|Hey}` variants to avoid spam fingerprinting | Spintax support in email body/subject |
| **Magic AI Email Generator** | AI-generate subject/body from a prompt in the Compose screen |
| **Real-time Spam Checker** — scores drafts before sending | Spam-score badge on the compose screen before scheduling |
| **Campaigns with sequences & follow-ups** | Group uploaded CSV leads into a "Campaign" with per-campaign progress |
| **Analytics dashboard** (opens, replies, deliverability) | Metrics dashboard: sends/hour, success rate, queue depth, per-sender usage |
| **Slack integration** (listed in their integrations) | Required Slack OAuth rate-limit alerts — frame it as "our Slack integration" |

When the reviewer (Mitrajit) sees your README and demo map 1:1 onto their own product vocabulary, you stop looking like a candidate and start looking like a teammate. **Use their terminology everywhere**: "campaigns," "senders," "Onebox-style search," "sender rotation," "deliverability guardrails."

---

## Part 2 — The Three-Tier Submission Strategy

### Tier 1 — Checklist Perfection (non-negotiable, everyone does this)
Every single requirement in the brief, working, no exceptions:

- ✅ TypeScript + Express + BullMQ + Redis + PostgreSQL (Prisma) + Ethereal SMTP
- ✅ BullMQ **delayed jobs only** — zero cron anywhere (grep the repo to prove it)
- ✅ Elasticsearch indexing of scheduled + sent emails, with a search bar in the UI
- ✅ Bull Board dashboard mounted at `/admin/queues` (protected)
- ✅ Google OAuth (real), avatar + name + email in header, logout
- ✅ Slack OAuth ("Connect Slack" button → real authorize flow → token stored per user → live message on rate-limit hit → graceful when not connected)
- ✅ Restart persistence: `docker compose restart api worker` → future jobs still fire, nothing duplicated
- ✅ Idempotency: same email never sent twice
- ✅ Frontend pixel-close to the Figma: login screen, dashboard with Scheduled/Sent tabs, Compose page with "Send Later" picker, delay + hourly limit fields, CSV upload showing detected count
- ✅ README with architecture + a ≤5 min demo video

**Fail here and nothing else matters. Budget 60% of your effort on Tier 1 quality.**

### Tier 2 — Engineering Excellence (few teams do this well)
This is where "production-grade" is actually demonstrated:

1. **Distributed rate limiter done right** — atomic Redis Lua script (sliding-window or fixed-window counter keyed `sender:{id}:hour:{window}`), shared across workers. On limit hit: compute next window start → `job.moveToDelayed(nextWindow)` → preserves order via priority, never drops. This is the hardest requirement; nail it and explain the trade-offs in the README (why not BullMQ's built-in limiter alone — it doesn't reschedule across hour windows per-sender).
2. **Idempotency at 3 layers** — deterministic `jobId = sha256(campaignId + recipient + step)` (BullMQ dedupes identical jobIds), DB unique constraint on `(campaign_id, recipient, step)`, and a status state-machine (`scheduled → sending → sent | failed`, transitions in a transaction). Demo: schedule the same CSV twice, show only one set of sends.
3. **Graceful shutdown** — `SIGTERM` → worker stops picking new jobs → in-flight job completes or re-queues → clean exit. Then show the restart scenario.
4. **Structured logging + correlation IDs** (pino) — every job lifecycle event traceable.
5. **Swagger/OpenAPI docs** at `/api/docs`.
6. **Tests** — unit tests for the rate limiter + scheduler logic; one integration test that boots Redis+Postgres (testcontainers) and proves "restart → no duplicates."
7. **CI** — GitHub Actions: lint, typecheck, tests on every PR.
8. **Config via env everywhere** — `MAX_EMAILS_PER_HOUR_PER_SENDER`, `MIN_DELAY_BETWEEN_SENDS_MS`, `WORKER_CONCURRENCY` all documented with defaults.

### Tier 3 — Out-of-the-Box Differentiators (what no other team will have)

Pick **4–6** of these, fully working — not half-built. Quality over quantity.

1. **🖥 Live deployed URL on your VM** (the single biggest wow factor)
   - `https://reachinbox-assignment.yourdomain.com` — real HTTPS via Caddy (auto Let's Encrypt), Google OAuth pointing at the live domain.
   - Reviewer clicks a link instead of cloning and fighting local setup. Include the URL at the top of the README and in the submission email.
   - `docker-compose.prod.yml` with: api, worker, web (nginx serving the React build), redis (AOF persistence), postgres (volume), elasticsearch, bull-board, caddy.
   - CI/CD: push to `main` → GitHub Action → SSH into VM → `git pull && docker compose up -d --build`. Mention zero-downtime-ish deploys.

2. **📊 Live "War Room" load-test demo** (proves the 1000+ email requirement visually)
   - A k6 (or autocannon) script that schedules **1,000 emails in one burst** via the API.
   - A **Grafana dashboard** (Prometheus exporter on the worker: jobs waiting, active, completed, failed, per-sender hourly usage, send latency histogram) — or a self-built real-time analytics page via WebSockets if Grafana is too heavy.
   - In the demo video: fire 1,000 jobs → watch the queue drain at exactly the configured rate → watch per-sender counters hit the hourly cap → **Slack alert fires live on screen** → jobs visibly reschedule into the next hour window.
   - Nobody else will *show* rate limiting; they'll just describe it in the README.

3. **🔁 Sender rotation engine (mini-ReachInbox)**
   - Seed 3–5 Ethereal accounts. Campaign sends rotate round-robin (or least-used-this-hour) across senders, each with its own hourly quota — exactly how their product scales volume.
   - UI: a "Senders" page showing each account, quota usage bar (e.g. 47/200 this hour), and health.
   - When one sender caps out, its jobs automatically flow to the next sender with headroom; only when ALL senders cap do jobs move to the next hour window. This is a genuinely thoughtful design they'll recognize from their own infra.

4. **🤖 Magic AI Compose + Spintax + Spam Score (their exact feature trio)**
   - Compose page: "✨ Generate with AI" button (Gemini/OpenAI free tier) that writes subject + body from a one-line prompt.
   - Spintax: `{Hi|Hello|Hey} {{firstName}}` — worker resolves a random variant per recipient at send time. CSV columns become template variables ({{firstName}}, {{company}}) — this is *personalization at scale*, their core pitch.
   - Spam score: a lightweight linter (spam-trigger word list, ALL-CAPS detection, link density, image-only check) showing a live score badge in Compose: "Spam score: 12/100 ✅ Looks good."

5. **🔍 Onebox-style search (makes Elasticsearch visible)**
   - Most teams will index emails and never show it off. You add a global search bar (like the Figma's search input) that does full-text search across subject/body/recipient with filters (status, sender, campaign, date range) — call it "Onebox Search" and say so in the README.
   - Bonus: search highlighting with Elasticsearch `highlight` — matched terms glow in results.

6. **⚡ Real-time dashboard (WebSockets/SSE)**
   - Email rows update live: `scheduled → sending → sent` without refresh; a toast pops "📨 Email sent to lead@x.com from sender-2." Makes the demo feel alive.
   - Queue depth widget on the dashboard fed by BullMQ queue events.

7. **🧪 Chaos/restart proof as a first-class feature**
   - A "Restart resilience" section in the README + a scripted demo: schedule emails 2 minutes out → `docker compose kill worker` → wait → `docker compose start worker` → emails still send on time, zero duplicates. Show the DB row never changed state incorrectly.
   - Even better: a `make chaos` script that does kill/restart automatically for the video.

8. **🕐 Timezone-aware scheduling**
   - "Send Later" picker interprets times in the user's browser timezone, stores UTC, displays localized. Tiny feature, big "they thought about real users" signal. (ReachInbox advertises "timezone accuracy" in scheduling.)

9. **🚫 Suppression list / unsubscribe handling**
   - Notably, reviewers of their actual product complain ReachInbox *lacks* built-in unsubscribe management. Add a simple suppression list: any recipient who appears in `suppressions` is skipped at send time (checked inside the worker, idempotently). One line in the README — "we also handle opt-outs, a gap even in production tools" — shows product thinking, not just coding.

---

## Part 3 — Architecture

```
┌──────────────────────────── Docker Compose (on your VM) ───────────────────────────┐
│                                                                                     │
│   Caddy (HTTPS) ──► web (React build, nginx)                                        │
│                 └─► api (Express+TS) ──► postgres (Prisma)                          │
│                        │           └──► elasticsearch (email index)                 │
│                        │                                                            │
│                        ├─► redis (AOF) ◄── bull-board (/admin/queues)                │
│                        │         ▲                                                  │
│                        ▼         │ delayed jobs                                     │
│                     worker (BullMQ Worker, concurrency=N)                           │
│                        │                                                            │
│              ┌─────────┼──────────────────┐                                         │
│              ▼         ▼                  ▼                                         │
│         Ethereal   Redis Lua          Slack webhook                                 │
│         SMTP x5    rate limiter       (rate-limit alert)                            │
│              │                                                                      │
│              └─► after send: update DB → index to ES → emit WS event                │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Key design decisions (write these in the README — the "why" is what they grade):**

- **Scheduling:** `queue.add('send-email', payload, { jobId: deterministicHash, delay: sendAt - now })`. BullMQ stores delayed jobs in Redis sorted sets — durable across restarts. Redis AOF (`appendonly yes`) so even a Redis restart survives.
- **Rate limiting:** atomic Lua script `INCR` + `PEXPIRE` on key `rl:{senderId}:{hourWindow}`. If count > limit → compute ms until next window → `job.moveToDelayed(nextWindowStart + jitter, priority=originalIndex)` → job keeps its place in line. Fire Slack alert exactly once per sender per window (SET NX flag key).
- **Sender selection:** at send time, pick sender with most remaining quota (greedy). If none → delay all to next window. Fair rotation via per-sender `last_used_at`.
- **Idempotency:** deterministic jobId + DB unique constraint + `UPDATE ... WHERE status='scheduled'` (compare-and-swap) before sending. Triple-redundant — and say that in the README; it shows you *know* distributed systems fail in layers.
- **Delay between sends:** BullMQ group limiter per sender (`limiter: { max: 1, duration: MIN_DELAY_MS, groupKey: senderId }`) — clean, built-in, and documentable.
- **ES indexing:** after every status change, upsert the email doc (`index: emails`, fields: recipient, subject, body, status, sender, campaignId, scheduledAt, sentAt). Search API proxies to ES with `multi_match` + filters + highlight.
- **Monorepo:** pnpm workspaces — `/apps/api`, `/apps/worker`, `/apps/web`, `/packages/shared` (types + zod schemas shared between front and back). Shared types = DRY + type-safe end to end; reviewers notice.

**DB schema (core):**
```
users(id, google_sub, name, email, avatar_url)
senders(id, user_id, email, ethereal_user, ethereal_pass_enc, hourly_limit, is_active)
campaigns(id, user_id, name, subject, body_template, start_at, delay_ms, hourly_limit, status, created_at)
emails(id, campaign_id FK, sender_id FK nullable, recipient, subject_rendered, body_rendered,
       status ENUM(scheduled,sending,sent,failed,delayed_ratelimit,suppressed),
       scheduled_at, sent_at, error, idempotency_key UNIQUE, bullmq_job_id)
slack_connections(id, user_id, team_id, access_token_enc, channel, connected_at)
rate_limit_alerts(id, sender_id, hour_window, notified_at)  -- dedupe Slack alerts
suppressions(id, user_id, email, reason, created_at)
```

---

## Part 4 — Frontend Plan (match the Figma, then exceed it)

Screens from the Figma you must reproduce: **Login** (Google button + email fields), **Dashboard** (ONB logo, sidebar: Compose / Scheduled 12 / Sent 765, top search bar, list rows with badge + subject + preview + star), **Compose New Email** (From dropdown, To with chips + Upload List, Subject, Delay between 2 emails, Hourly Limit, rich-text toolbar, Send Later popover with Tomorrow / Tomorrow 10AM etc., Cancel/Done), **Email detail view** (thread with attachments).

Build order:
1. **Design system first** — `Button`, `Input`, `Badge`, `Table`, `Modal`, `EmptyState`, `Spinner`, `Toast` components in `/components/ui`. The Figma uses a green accent (#16a34a-ish), rounded-full pills, light-gray inputs — extract exact colors with a color picker and put them in `tailwind.config`. Pixel-fidelity is free points.
2. **Pages:** `/login` → `/` (dashboard with Scheduled/Sent tabs) → `/compose` → `/senders` (Tier 3) → `/campaigns/:id` (per-campaign progress: sent/total bar, live).
3. **Compose polish:** CSV upload → client-side parse → "✅ 1,247 emails detected" → chips preview of first few → validation errors shown per bad line. Rich text: TipTap (lightweight) or contentEditable toolbar matching Figma icons.
4. **States everywhere:** skeleton loaders on tables, illustrated empty states ("No scheduled emails yet — compose your first campaign"), error toasts on every API failure path.
5. **Real-time:** socket.io or SSE hook `useEmailEvents()` updating rows in place.

---

## Part 5 — The Demo Video (≤5 min) — Script It Like a Product Launch

Record with OBS, 1080p, voice-over. Rehearse twice. Structure:

| Time | Scene |
|---|---|
| 0:00–0:20 | "Hi, we built a production-grade email scheduler inspired by ReachInbox's own architecture. It's live at https://…" — show the deployed URL working |
| 0:20–0:50 | Google login → dashboard tour (Scheduled/Sent tabs, Onebox search with highlighting) |
| 0:50–1:40 | Compose: paste prompt → AI generates email → spintax + {{firstName}} merge → spam score badge → upload 1,000-lead CSV → "1,000 emails detected" → set start time, 2s delay, 200/hr limit → Schedule |
| 1:40–2:30 | Watch it work live: Bull Board queue draining, dashboard rows flipping scheduled→sent via WebSocket, sender rotation across 5 senders, quota bars filling |
| 2:30–3:20 | **Rate limit moment:** per-sender counter hits 200 → Slack alert arrives **live on screen** → Bull Board shows jobs re-delayed to next hour window → explain the Lua-script limiter in one sentence |
| 3:20–4:10 | **Chaos moment:** `docker compose kill worker` mid-campaign → talk over it: "jobs are in Redis with AOF, state in Postgres" → `start worker` → sending resumes on schedule → query DB showing zero duplicates, idempotency keys |
| 4:10–4:40 | Search Elasticsearch: type a lead name → instant highlighted results. Show Grafana/analytics chart of the 1,000-email burst |
| 4:40–5:00 | Architecture diagram slide (one clean diagram) + "everything is in the README: setup, env vars, trade-offs" |

**Why this works:** every claim in the brief ("handle 1000+", "survive restart", "Slack must be live and verifiable") is *demonstrated on camera*, not asserted. Reviewers watch videos first; a great video buys goodwill before they read a line of code.

---

## Part 6 — VM Deployment Runbook

1. **DNS:** A record `app.yourdomain.com` → VM IP (free subdomain from DuckDNS/afraid.org if you don't own a domain).
2. **VM hardening basics:** ufw allow 80/443/22 only, non-root user, SSH keys.
3. **Stack:** `docker-compose.prod.yml` — services: caddy, web, api, worker, redis (with `appendonly yes` + volume), postgres (volume), elasticsearch (`discovery.type=single-node`, 512MB heap cap), bull-board. All with `restart: unless-stopped` and healthchecks.
4. **Caddyfile:** 3 lines — reverse proxy to web, `/api` to api, automatic HTTPS.
5. **OAuth:** Google + Slack apps configured with the live HTTPS redirect URIs (this is why the live URL matters — OAuth needs a real domain).
6. **CI/CD:** GitHub Action on push to main → `ssh vm 'cd app && git pull && docker compose up -d --build'`.
7. **Seed script:** `pnpm seed` creates 5 Ethereal senders + demo campaign so the reviewer sees data immediately.
8. **README gets a "🌐 Live Demo" section at the very top** with the URL and a demo login path.

---

## Part 7 — Two-Week Execution Plan (adjust to your deadline)

**Days 1–2 — Foundation (pair program this, everyone must understand it)**
- Monorepo scaffold, docker-compose (redis+postgres+es), Prisma schema, Google OAuth flow end-to-end, "hello world" delayed job firing through BullMQ.

**Days 3–5 — Scheduler core (the graded heart)**
- Schedule API (CSV parse → campaign → batch `queue.add` with deterministic jobIds), worker with Ethereal sending, Lua rate limiter + per-sender windows + Slack alert, sender rotation, idempotency layers, graceful shutdown. **Unit-test the limiter and idempotency before touching UI.**

**Days 6–8 — Frontend to Figma**
- Design system → Login → Dashboard tabs → Compose (upload, delay, hourly limit, Send Later) → loading/empty/error states.

**Days 9–10 — Tier 3 differentiators**
- Elasticsearch search UI (Onebox), Bull Board, WebSocket live updates, then pick remaining wow features (AI compose, spam score, spintax, analytics) based on time.

**Days 11–12 — Deploy + harden**
- Live on VM with HTTPS, Slack OAuth verified against live domain, k6 load test of 1,000 emails, chaos/restart drill, fix everything that breaks (something will).

**Day 13 — README + video**
- README: quickstart (one command), env table, architecture diagram (excalidraw), deep-dives on scheduling/rate-limiting/idempotency/restart behavior, feature checklist mapping every requirement to where it's implemented + proof (screenshot/file link), trade-offs section.
- Record demo video (script above), re-record any fumbled take.

**Day 14 — Buffer + submission**
- Fresh-clone test: teammate clones the repo on a clean machine and follows the README blind. If it doesn't boot in <10 minutes, fix the README, not their machine.
- Private repo → add `Mitrajit` and `Yadav036` → submit with live URL + video link.

**Team split (if 2–3 people):** one owns backend core (scheduler/limiter/idempotency), one owns frontend + design fidelity, one owns infra (VM, CI/CD, ES, Grafana) + video. Backend core is the heaviest load — put your strongest engineer there.

---

## Part 8 — Common Failure Modes (how other teams will lose)

1. **Cron sneaks in** — a `setInterval` reconciliation loop is fine (it's not cron), but `node-cron` in `package.json` = instant fail. Add a README line: "grep the repo: zero cron."
2. **In-memory rate limiting** — brief explicitly forbids it. Redis counters or nothing.
3. **Dropping jobs at rate limit** — brief says reschedule, never drop. Test this path explicitly.
4. **Restart = resend everything** — they *will* test the restart scenario; the brief tells you so.
5. **Fake Slack/Google OAuth** — brief says "live, verifiable call." Do real OAuth or don't claim it.
6. **Half-built bonus features** — five broken extras hurt more than zero extras. Feature-flag anything unfinished OFF in the demo.
7. **README as afterthought** — for a senior reviewer, the README's architecture/trade-offs section IS the interview.
8. **Video over 5 minutes** — they said max 5. Respect it; it signals you read instructions — which is literally the meta-test of this assignment.

---

## Part 9 — Final Checklist Before Submit

- [ ] `docker compose up` boots everything from a clean clone
- [ ] Live URL works, HTTPS, Google + Slack OAuth on the real domain
- [ ] 1,000-email burst demoed, rate limit hit, Slack alert received, jobs rescheduled not dropped
- [ ] Kill/restart drill: zero lost jobs, zero duplicates (idempotency keys shown)
- [ ] Search returns highlighted results from Elasticsearch
- [ ] Bull Board visible at `/admin/queues`
- [ ] No cron anywhere; delay/concurrency/limits all env-configurable
- [ ] Figma fidelity: side-by-side screenshots in the README
- [ ] README: architecture, trade-offs, feature map, env table, assumptions
- [ ] Video ≤5:00, every claim demonstrated live
- [ ] Repo access granted to `Mitrajit` and `Yadav036`

---

*The winning insight: the assignment is a slice of their production system. Teams that treat it as homework will build homework. Treat it as "we already work here, and this is our first internal tool" — same vocabulary, same product instincts, production discipline — and you'll be the submission they compare everyone else against.*
