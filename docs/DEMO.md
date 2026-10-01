# Demo guide (5-minute video)

## 1. Load demo emails into your account

**Easiest: use the in-app buttons.** In the left sidebar under **Compose**, click **Demo data** (a welcome campaign that sends in ~10 s and a launch campaign scheduled ~5 min ahead) or **Rate limit** (15 emails, hourly limit 3, triggers rescheduling and the Slack alert). It works for any account, new or old, and also creates 3 Ethereal senders if you have none.

Or, from the terminal:

Log in to the app once with Google (this creates your user), then run from the repo root:

```bash
# Local
npm run demo -- you@gmail.com

# Against the deployed app: use the Render *External* database URL and the API's JWT_SECRET
DATABASE_URL="postgresql://...external-url..." \
JWT_SECRET="<same as the API service>" \
API_URL="https://<your-api>.onrender.com" \
npm run demo -- you@gmail.com ratelimit
```

What it creates (through the real API, exactly like the UI):

| # | Campaign | When | Purpose |
|---|---|---|---|
| 1 | Welcome series, 6 emails | ~10 s from now | Shows up in **Sent** during the video |
| 2 | Product launch, 8 emails | ~6 min from now (`DEMO_FUTURE_MINUTES`) | Stays in **Scheduled**, used for the restart demo |
| 3 | Rate limit, 15 emails, hourly limit 3 (only with `ratelimit`) | ~15 s from now | Triggers `delayed_ratelimit` and the Slack alert |

It also makes sure the account has 3 Ethereal senders. Re-running creates new campaigns.

## 2. Video script (about 5 minutes)

1. **(0:00) Intro.** Show the README diagram for ten seconds. No cron: BullMQ delayed jobs in Redis.
2. **(0:20) Schedule from the UI.** Compose, upload a CSV (the count shows "5 emails detected"), set start time, delay and hourly limit, click Send.
3. **(1:00) Dashboard.** Show **Scheduled** filling up and emails moving to **Sent** live with the time. Open one email and its Ethereal preview. Show search, including a typo like `invoise`.
4. **(2:00) Restart scenario** (below).
5. **(3:30) Rate limit and delay (bonus).** Run `npm run demo -- you@gmail.com ratelimit`. Show rows flipping to *Rate-limited*, the Slack message in the channel, and Bull Board at `/admin/queues` with the delayed jobs.
6. **(4:30) Wrap-up.** Mention the trade-offs section in the README.

## 3. How to show the restart scenario

Do this while campaign #2 (the "later" campaign) is still in **Scheduled**.

### On Render
1. Show the Scheduled tab with the 8 "Product launch" emails and their times.
2. In Render, open the **worker** service, then **Suspend Service**. Do the same for the **API** service to show a full server stop. Show the site failing or the dashboard unreachable for a moment.
3. **Resume** both services.
4. Refresh the dashboard. The 8 emails are still there with the same times, and they send at their scheduled time. If the time passed while you were down, they send right after the restart, **exactly once**. Point out there are no duplicates: the count stays at 8.
5. Optional proof: open `/admin/queues` on the API. The delayed jobs survived because they live in Redis, not in process memory.

### Locally (more dramatic)
```bash
# terminal 1: npm run dev:api     terminal 2: npm run dev:worker
npm run demo -- you@gmail.com
# Ctrl+C both terminals while campaign #2 is still scheduled, wait a few seconds
npm run dev:api
npm run dev:worker
```
For the worst case, kill the worker mid-campaign and verify there are no duplicates:
```bash
bash scripts/chaos.sh
```

### What to say
"Jobs are stored in Redis with AOF persistence and every email row is in Postgres. On restart the worker resumes from Redis, stalled jobs are recovered, and the unique idempotency key plus compare-and-swap status make sure an email is never sent twice."
