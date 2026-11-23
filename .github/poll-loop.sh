#!/usr/bin/env bash
# Body of the poll workflow (.github/workflows/poll.yml). Polls Liquipedia every INTERVAL seconds for
# up to MAX_SECONDS, then tells the workflow to start its successor (GITHUB_OUTPUT chain=true).
# Idle checks (no stage running today) keep the chain alive while the event window is open (from 3
# days before any stage to 1 day after it, scripts/event-window.ts), so stage changes never depend on
# GitHub's schedule. After that it ends without a successor. A forced STAGE applies to this run only.
# Exits 1 if any poll failed, so GitHub emails the repo owner.
#
# Env: EVENT_ID (required), STAGE (optional stage id), INTERVAL (default 900), MAX_SECONDS (default
# 19800 = 5.5 h; the job limit is 6 h), BRANCH (default main; only for testing a branch),
# THROTTLE_LIMIT (default 2: Liquipedia 429 checks in a row before handing over to a fresh runner),
# GITHUB_OUTPUT (set by GitHub Actions).
set -uo pipefail

: "${EVENT_ID:?EVENT_ID is required}"
STAGE="${STAGE:-}"
INTERVAL="${INTERVAL:-900}"
MAX_SECONDS="${MAX_SECONDS:-19800}"
OUTPUT="${GITHUB_OUTPUT:-/dev/null}"
BRANCH="${BRANCH:-main}"
STATUS=.cache/sync-status.json

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# Force-pushes the status file to the poll-status branch (read by the site; keeps main free of noise).
# If the poller never wrote a status this time (crash before its catch), records the failure.
publish_status() {
  if [ ! -f "$STATUS" ] || [ ! "$STATUS" -nt .cache/run-started ]; then
    printf '{"schemaVersion":1,"eventId":"%s","checkedAt":"%s","outcome":"error","message":"%s"}\n' \
      "$EVENT_ID" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
      "Poller run failed before it wrote a status (see the Actions log)" > "$STATUS"
  fi
  local blob tree commit
  blob=$(git hash-object -w "$STATUS")
  tree=$(printf '100644 blob %s\tsync-status.json\n' "$blob" | git mktree)
  commit=$(git commit-tree "$tree" -m "poll status")
  git push --quiet --force origin "$commit:refs/heads/poll-status" || log "status push failed"
}

mkdir -p .cache
if git fetch --quiet origin poll-status; then
  git show FETCH_HEAD:sync-status.json > "$STATUS" 2>/dev/null || rm -f "$STATUS"
fi

start=$(date +%s)
failures=0
# Checks in a row that Liquipedia refused with 429. Its rate limit is per IP and GitHub runners share
# IPs, so a throttled runner can stay throttled: after THROTTLE_LIMIT such checks this run hands over
# to a successor, which gets a fresh runner (and IP).
throttled=0
THROTTLE_LIMIT="${THROTTLE_LIMIT:-2}"
lock=$(sha256sum package-lock.json)

while :; do
  # Pick up data pushed by cloud Claude tasks and code merged since the last poll.
  git fetch --quiet origin "$BRANCH" && git reset --quiet --hard "origin/$BRANCH" || log "could not update main"
  if [ "$(sha256sum package-lock.json)" != "$lock" ]; then
    log "package-lock.json changed, reinstalling"
    npm ci --no-fund --no-audit || failures=$((failures + 1))
    lock=$(sha256sum package-lock.json)
  fi

  touch .cache/run-started
  sleep 1 # the status file must be strictly newer than run-started
  # shellcheck disable=SC2086 # STAGE is empty or one id
  if ! timeout 600 node scripts/poll-liquipedia.ts "$EVENT_ID" $STAGE --commit; then
    failures=$((failures + 1))
    log "poll failed ($failures so far)"
  fi
  publish_status

  outcome=$(node -p "JSON.parse(require('fs').readFileSync('$STATUS', 'utf8')).outcome" 2>/dev/null)
  message=$(node -p "JSON.parse(require('fs').readFileSync('$STATUS', 'utf8')).message ?? ''" 2>/dev/null)
  if [ "$outcome" = "error" ] && [[ "$message" == *"Liquipedia 429"* ]]; then
    throttled=$((throttled + 1))
    if [ "$throttled" -ge "$THROTTLE_LIMIT" ]; then
      log "Liquipedia throttled $throttled checks in a row, handing over to a fresh runner"
      echo "chain=true" >> "$OUTPUT"
      break
    fi
  else
    throttled=0
  fi
  if [ "$outcome" = "idle" ]; then
    if [ -n "$STAGE" ]; then
      # A forced stage that is finished: carry on picking the stage by date.
      log "stage $STAGE has nothing left to poll, switching to the stage by date"
      STAGE=""
      continue
    fi
    if ! node scripts/event-window.ts "$EVENT_ID"; then
      log "event window closed, ending the chain"
      echo "chain=false" >> "$OUTPUT"
      break
    fi
  fi

  # Next poll at the next INTERVAL boundary + 2 min (:02, :17, :32, :47 for 15 min).
  now=$(date +%s)
  wait=$(( INTERVAL - (now % INTERVAL) + 120 ))
  [ "$wait" -gt "$INTERVAL" ] && wait=$(( wait - INTERVAL ))
  if [ $(( now - start + wait )) -ge "$MAX_SECONDS" ]; then
    log "time limit reached, handing over to the next run"
    echo "chain=true" >> "$OUTPUT"
    break
  fi
  log "next poll in $((wait / 60)) min"
  sleep "$wait"
done

[ "$failures" -eq 0 ]
