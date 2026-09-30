<div align="center">

# 📬 ONB · Email Job Scheduler

**Schedule emails and CSV campaigns that survive restarts, respect per-sender hourly limits, and never send twice.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-DC382D?logo=redis&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-005571?logo=elasticsearch&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)

[Highlights](#-highlights) · [Architecture](#-architecture) · [Quick start](#-quick-start) · [Configuration](#%EF%B8%8F-configuration) · [Structure](#-project-structure) · [Testing](#-testing)

</div>

---

## ✨ Highlights

| | Feature | How |
|---|---|---|
| ⏱ | **Durable scheduling** | BullMQ *delayed jobs* stored in Redis (AOF on). No cron anywhere. |
| 🚦 | **Distributed rate limiting** | One atomic Redis Lua script per send: hourly quota + min gap, shared by all workers. Over limit → **rescheduled, never dropped**. |
| 🔁 | **Sender rotation** | Least-recently-used sender first; when one caps out, sends flow to the next with headroom. |
| 🛡 | **Idempotency (3 layers)** | Deterministic `jobId`, `UNIQUE` idempotency key, compare-and-swap status transition. |
| 💥 | **Crash recovery** | Kill the worker mid-send; stalled jobs are recovered, stale locks re-taken. |
| 🔍 | **Onebox search** | Elasticsearch `multi_match` + highlighting, with a Postgres fallback if ES is down. |
| ✨ | **AI compose (Gemini)** | One click → subject + body. Cached, capped output, per-user daily budget, fallback model. |
| 🧪 | **Spam score** | Free, local heuristic linter with a live badge and fix hints. |
| 🧩 | **Spintax + variables** | `{Hi\|Hello} {{firstName}}`, CSV columns become variables. |
| ⚡ | **Live UI** | Worker → Redis pub/sub → socket.io; rows flip to *sent* with toasts. |
| 📊 | **Analytics** | Queue depth, success rate, sent/hour (24 h), per-sender usage. |
| 🚫 | **Suppression list** | Opted-out recipients are skipped inside the worker. |
| 🔔 | **Slack alerts** | Real OAuth; one alert per sender per hour window when a limit is hit. |
| 🕐 | **Timezone-aware** | *Send Later* uses your browser timezone; stored as UTC. |
| 🧰 | **Ops** | Bull Board (`/admin/queues`), Swagger (`/api/docs`), structured pino logs. |

## 🏗 Architecture

```mermaid
flowchart LR
  UI[React UI] -->|REST + cookie JWT| API[Express API]
  API -->|rows| PG[(PostgreSQL)]
  API -->|delayed jobs| R[(Redis)]
  R --> W[Worker x N]
  W -->|Lua: quota + gap| R
  W -->|SMTP| E[Ethereal]
  W -->|status| PG
  W -->|index| ES[(Elasticsearch)]
  W -->|rate-limit alert| S[Slack]
  W -. pub/sub .-> API -. socket.io .-> UI
  API -->|generate draft| G[Gemini]
```

**Send path (per job):** load email → skip if terminal → suppression check → reserve a sender (Lua) →
CAS `scheduled → sending` → render (spintax + variables) → SMTP → `sent` → index + publish.
If no sender has headroom: `moveToDelayed(next window)` and alert Slack once.

## 🚀 Quick start

```bash
cp .env.example .env               # add GOOGLE_*/SLACK_*/GEMINI_API_KEY as needed
docker compose up -d               # postgres, redis (appendonly), elasticsearch
npm install
npm run prisma:generate && npm run prisma:migrate
npm run build -w @ejs/shared && npm run build -w @ejs/core
npm run seed                       # demo user + Ethereal senders (needs internet)

npm run dev:api                    # http://localhost:4000
npm run dev:worker
npm run dev:web                    # http://localhost:5173
```

In development, the **Login** button signs in as a demo user when Google isn't configured
(`/api/auth/dev-login`, automatically disabled in production).

## ⚙️ Configuration

| Variable | Default | Purpose |
|---|---|---|
| `WORKER_CONCURRENCY` | `5` | Parallel jobs per worker |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200` | Default quota for new senders |
| `MIN_DELAY_BETWEEN_SENDS_MS` | `2000` | Fallback min gap between sends per sender |
| `GOOGLE_CLIENT_ID/SECRET` | | Redirect: `{API_URL}/api/auth/google/callback` |
| `SLACK_CLIENT_ID/SECRET`, `SLACK_CHANNEL` | | Redirect: `{API_URL}/api/slack/callback` (HTTPS required by Slack) |
| `GEMINI_API_KEY` | | Enables AI compose |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | `gemini-3.8-flash` / `gemini-3.1-flash-lite` | Fallback used only on 5xx/timeout |
| `AI_DAILY_LIMIT_PER_USER` | `20` | Cost guard; failed calls don't count |
| `ENCRYPTION_KEY` | dev value | 32 chars; AES-256-GCM for SMTP passwords and Slack tokens |

**AI cost controls:** calls happen only on an explicit click · output capped at 350 tokens · identical prompts are served
from a 24 h Redis cache · per-user daily budget · the spam checker is local and free.

## 🧠 Design decisions

- **Why a Lua script, not BullMQ's limiter?** Per-group limiting is BullMQ Pro, and it can't express per-sender *hourly windows*
  with cross-sender failover. The script checks quota and min-gap and reserves atomically, so concurrent workers can't oversubscribe.
- **Never drop on limit.** The job is moved to the next hour window (plus jitter) and the row shows `delayed_ratelimit`.
- **Campaign ids are content hashes**, so resubmitting the same CSV/subject/body/time returns the same campaign: no duplicate rows, no duplicate jobs.
- **Delivery semantics.** Exactly-once in normal operation; a crash *between* SMTP accept and the DB write can re-send once
  (at-least-once in that narrow window). This is the standard trade-off without two-phase commit with the SMTP server.
- **ES is best-effort.** Indexing is fire-and-forget with short timeouts; Postgres is the source of truth and search falls back to it.
- **Secrets at rest.** SMTP passwords and Slack tokens are AES-256-GCM encrypted; user HTML is rendered in a sandboxed iframe.

## 🗂 Project structure

```
.
├── frontend/                React + Vite + Tailwind + TipTap  (@ejs/web)
│   └── src/
│       ├── pages/           Login · Dashboard · Compose · EmailDetail · Senders · Analytics
│       ├── components/      Layout and shared UI
│       └── lib/             api client · auth · toasts · live email events
│
├── backend/
│   ├── api/                 Express API · auth · Bull Board · Swagger · socket.io  (@ejs/api)
│   │   └── src/routes/      campaigns · emails · senders · slack · ai · stats
│   ├── worker/              BullMQ worker  (@ejs/worker)
│   │   └── src/             processor.ts (limiter, rotation, CAS, SMTP) · mailer.ts
│   ├── core/                prisma · redis · queue · Lua rate limiter · Elasticsearch · Slack · crypto  (@ejs/core)
│   └── prisma/              schema.prisma · migrations · seed.ts
│
├── packages/
│   └── shared/              zod schemas · spintax/variables · spam linter · time + idempotency helpers
│                            (used by both frontend and backend)
│
├── scripts/                 chaos.sh (kill/restart drill)
├── docs/
│   ├── PLAN.md              product + engineering plan
│   └── design/              Figma screenshots the UI is built against
├── docker-compose.yml       postgres · redis (AOF) · elasticsearch
├── render.yaml              Render blueprint
└── .env.example
```

## 🧪 Testing

```bash
npm run typecheck          # all workspaces
npm test                   # shared unit tests + limiter tests (limiter tests need Redis)
bash scripts/chaos.sh      # kill worker mid-campaign, restart, assert zero duplicates
```

The limiter test fires 50 concurrent reservations at real Redis and asserts exactly `limit` are granted.

## 📌 Status

**Verified locally:** scheduling, atomic limiter, rotation, reschedule-on-cap, idempotent re-submit, crash recovery, real Ethereal sends,
spintax/variables, Bull Board auth, Swagger, stats, AI compose (via fallback model while the primary was overloaded), search fallback.

**Needs credentials or services to verify:** Google OAuth, Slack OAuth + live alert, Elasticsearch path.

**Not built yet:** email attachments, integration/CI pipeline, production compose + HTTPS, k6 load script.
