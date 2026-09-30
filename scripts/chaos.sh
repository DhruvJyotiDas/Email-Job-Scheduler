#!/usr/bin/env bash
# Restart-resilience drill: kill the worker mid-campaign, restart it, verify zero duplicates.
# Usage: run API + worker (locally or via docker), schedule a campaign, then run this script.
set -euo pipefail
PSQL="docker compose exec -T postgres psql -U ejs -d ejs -At"

echo "== before: status counts"; $PSQL -c "select status, count(*) from emails group by 1 order by 1"
echo "== killing worker (SIGKILL, worst case)"; docker compose kill worker 2>/dev/null || pkill -9 -f "apps/worker" || true
sleep 10
echo "== restarting worker"; docker compose start worker 2>/dev/null || echo "start the worker manually: npm run dev:worker"
sleep 20
echo "== after: status counts"; $PSQL -c "select status, count(*) from emails group by 1 order by 1"
echo "== duplicate check (must be 0 rows)"
$PSQL -c "select recipient, campaign_id, count(*) from emails where status='sent' group by 1,2 having count(*)>1"
echo "== duplicate idempotency keys (must be 0 rows)"
$PSQL -c "select idempotency_key, count(*) from emails group by 1 having count(*)>1"
