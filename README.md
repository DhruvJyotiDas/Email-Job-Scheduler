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

[Highlights](#-highlights) · [Architecture](#-architecture) · [Quick start](#-quick-start) · [Features](#-features-implemented) · [Configuration](#%EF%B8%8F-configuration) · [Structure](#-project-structure) · [Testing](#-testing)

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

### System overview

```mermaid
flowchart LR
  UI["React UI"] -->|"REST + cookie JWT"| API["Express API"]
  API -->|"rows"| PG[("PostgreSQL")]
  API -->|"delayed jobs"| R[("Redis")]
  R --> W["BullMQ Worker x N"]
  W -->|"Lua: quota + gap"| R
  W -->|"SMTP"| E["Ethereal"]
  W -->|"status"| PG
  W -->|"index"| ES[("Elasticsearch")]
  W -->|"rate-limit alert"| S["Slack"]
  W -->|"publish events"| R
  R -->|"pub/sub"| API
  API -->|"socket.io"| UI
  API -->|"generate draft"| G["Gemini"]
```

### How scheduling works

There is **no cron anywhere**. Every email is a **BullMQ delayed job** stored in Redis.

```mermaid
sequenceDiagram
  participant UI as React UI
  participant API as Express API
  participant DB as PostgreSQL
  participant Q as Redis / BullMQ
  participant W as Worker
  UI->>API: POST /api/campaigns (recipients, subject, body, startAt, delay, hourly limit)
  API->>DB: insert campaign + one email row per recipient (UNIQUE idempotency key)
  API->>Q: add delayed job per email (jobId = email id, delay = startAt - now)
  API-->>UI: 201 campaign created
  Note over Q: job waits in Redis until its time
  Q->>W: job becomes due
  W->>DB: load email, send, mark sent
  W-->>UI: live update via pub/sub and socket.io
```

### Send path (per job)

```mermaid
flowchart TD
  A["Job due"] --> B{"Email already sent or failed?"}
  B -->|yes| Z["Skip"]
  B -->|no| C{"Recipient suppressed?"}
  C -->|yes| Z2["Mark suppressed"]
  C -->|no| D["Try each sender: Lua quota + min-gap check"]
  D --> E{"Sender has headroom?"}
  E -->|"no: min gap"| F["Delay job a few seconds"]
  E -->|"no: hourly cap"| G["Delay to next hour window + Slack alert once"]
  E -->|yes| H["CAS status: scheduled to sending"]
  H --> I{"Won the race?"}
  I -->|no| Z3["Another worker owns it, stop"]
  I -->|yes| J["Render spintax + variables, send via SMTP"]
  J --> K["Status = sent, index in Elasticsearch, publish event"]
```

### How persistence on restart is handled

| Concern | What protects it |
|---|---|
| Scheduled jobs lost on restart | Jobs live in **Redis with AOF persistence**, not in process memory. A restarted worker simply resumes consuming. |
| Job was running when the worker crashed | BullMQ marks it **stalled** and another worker retakes it. A `sending` row whose lock is stale is re-claimed by the compare-and-swap. |
| Sent twice | 3 layers: deterministic `jobId`, `UNIQUE` idempotency key in Postgres, and the compare-and-swap status transition. |
| Source of truth | Redis holds *when* to run, Postgres holds *what* and *state*. Elasticsearch is best-effort search only. |

```mermaid
flowchart LR
  K["Worker killed mid-campaign"] --> R1["Redis keeps delayed and waiting jobs"]
  R1 --> S1["Worker restarts"]
  S1 --> T1["Stalled jobs recovered, stale locks re-taken"]
  T1 --> U1["Sent rows are skipped, the rest continue"]
```

### How rate limiting and concurrency are implemented

- **Concurrency:** `WORKER_CONCURRENCY` controls how many jobs one worker runs in parallel. You can also run several worker instances.
- **Min delay between sends:** per-campaign `delayMs` (the *Delay* field in the UI), defaulting to `MIN_DELAY_BETWEEN_SENDS_MS` (**2000 ms**). Enforced per sender by a short-lived Redis key inside the Lua script.
- **Hourly limit:** a Redis counter per `sender + hour window`, capped at the smaller of the sender's limit and the campaign's limit. The check, the increment and the gap key are **one atomic Lua script**, so concurrent workers can't oversubscribe.
- **Over the limit:** the job is **never dropped**. It is moved to the next hour window (plus jitter) and the row shows `delayed_ratelimit`. Other senders with headroom are tried first (rotation, least recently used first).
- **1000+ emails at once:** all jobs are created up front, then drain at the rate the limits allow. Excess jobs wait in Redis and are released window by window.

```mermaid
flowchart LR
  J["1000 jobs due at once"] --> L{"Lua script per sender"}
  L -->|"quota + gap OK"| SEND["Send"]
  L -->|"gap not elapsed"| WAIT["Retry in a few seconds"]
  L -->|"hourly quota used"| NEXT["Reschedule to next hour window"]
  NEXT --> ALERT["Slack alert, once per sender per hour"]
```

## 🚀 Quick start

### Prerequisites
Node.js 22+ and Docker (for Postgres, Redis and Elasticsearch).

### 1. Clone and configure

```bash
git clone https://github.com/DhruvJyotiDas/Email-Job-Scheduler.git
cd Email-Job-Scheduler
cp .env.example .env
npm install
```

### 2. Start infrastructure (Postgres, Redis, Elasticsearch)

```bash
docker compose up -d
npm run prisma:generate
npm run prisma:migrate          # creates the tables
npm run build -w @ejs/shared && npm run build -w @ejs/core
```

### 3. Run the backend (API + worker)

```bash
npm run dev:api                 # Express API    http://localhost:4000
npm run dev:worker              # BullMQ worker  (run a second one to see concurrency)
```

Bull Board (live queue view) is at `http://localhost:4000/admin/queues` and Swagger docs at `http://localhost:4000/api/docs`.

### 4. Run the frontend

```bash
npm run dev:web                 # React + Vite    http://localhost:5173
```

In development, **Login** signs in as a demo user when Google isn't configured
(`/api/auth/dev-login`, automatically disabled in production).

### 5. Set up Ethereal Email (fake SMTP)

Ethereal needs **no signup**. The app creates accounts for you:

- **From the UI:** open **Senders → Add Ethereal sender**. Add two or three to see rotation and per-sender limits.
- **Or from the terminal:** `npm run seed` (creates the demo user and Ethereal senders; needs internet).

Every sent email gets a **preview URL** on the email detail page, where you can read the delivered message.

### 6. Environment variables

The essentials in `.env` (see [Configuration](#️-configuration) for all of them):

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://ejs:ejs@localhost:5432/ejs` | Postgres |
| `REDIS_URL` | `redis://localhost:6379` | Redis (AOF on) |
| `JWT_SECRET` | long random string | The API refuses the default in production |
| `ENCRYPTION_KEY` | 32 characters | Encrypts SMTP passwords and Slack tokens |
| `WEB_URL` / `API_URL` | `http://localhost:5173` / `http://localhost:4000` | Used for redirects and OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | Real Google login. Redirect URI: `{API_URL}/api/auth/google/callback` |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_CHANNEL` | | Redirect URI: `{API_URL}/api/slack/callback` |
| `ELASTICSEARCH_URL` / `ELASTICSEARCH_API_KEY` | `http://localhost:9200` | The API key is only needed for Elastic Cloud |

### Hosting on Render
See [render.yaml](render.yaml): one Postgres, one Redis (`noeviction`), an API web service, a background worker, and a static site that proxies `/api` and `/socket.io` to the API.

## ✅ Features implemented

### Backend

| Area | What is implemented |
|---|---|
| **Scheduler** | BullMQ delayed jobs in Redis, no cron. Campaigns from CSV, content-hash campaign ids. |
| **Persistence** | Redis AOF, Postgres source of truth, stalled-job recovery, stale-lock re-claim. |
| **Idempotency** | Deterministic `jobId`, `UNIQUE` idempotency key, compare-and-swap status. |
| **Rate limiting** | Atomic Lua script: hourly quota and min-gap, per sender, shared by all workers. Over-limit jobs are rescheduled, never dropped. |
| **Concurrency** | Configurable `WORKER_CONCURRENCY`, safe for multiple workers. |
| **Multiple senders** | Ethereal SMTP senders with rotation and per-sender hourly limits. |
| **Search** | Elasticsearch (`multi_match`, fuzziness, highlighting) with Postgres fallback. |
| **Slack** | Real OAuth, encrypted token per user, alert when an hourly limit is hit. No-op if not connected. |
| **Ops** | Bull Board, Swagger, health checks, structured logs, OpenTelemetry tracing. |
| **Extras** | Gemini AI compose, spam score, spintax and variables, suppression list, analytics. |

### Frontend

| Area | What is implemented |
|---|---|
| **Login** | Real Google OAuth, then redirect to the dashboard. |
| **Header** | Name, email, avatar and Logout. |
| **Dashboard** | Scheduled and Sent tabs, search, Compose button. |
| **Compose** | Subject, rich body, CSV upload with detected email count, start time, delay, hourly limit, Schedule. |
| **Tables** | Email, subject, scheduled or sent time, status. Loading, empty and error states. |
| **Live updates** | socket.io: rows flip to *sent* with toasts. |
| **Code quality** | TypeScript types for API and props, reusable components, shared zod schemas. |

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

**Not built yet:** email attachments, production compose + HTTPS, k6 load script.
