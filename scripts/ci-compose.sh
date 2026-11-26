#!/usr/bin/env bash
set -euo pipefail

# Unique disposable volumes keep the restart test independent of local installations.
export COMPOSE_PROJECT_NAME="pilot-ci-$(openssl rand -hex 6)"
for variable in POSTGRES_PASSWORD APP_DB_PASSWORD WORKER_DB_PASSWORD OPERATOR_PASSWORD RELAY_TOKEN; do
  printf -v "$variable" '%s' "$(openssl rand -hex 32)"
  export "$variable"
done
export AUTH_MODE=shared ALERT_WEBHOOK_URL='' COMPLYOS_MONITOR_ORGANIZATION=installation
trap 'docker compose down --volumes --remove-orphans' EXIT

start() {
  docker compose up -d --wait --wait-timeout 180
  test "$(docker inspect --format '{{.State.ExitCode}}' "$(docker compose ps -aq migrate)")" = 0
}
base=http://127.0.0.1:3000
read_api() {
  curl --retry 12 --retry-delay 2 --retry-all-errors -fsS -u "operator:$OPERATOR_PASSWORD" "$base$1"
}
docker compose build
start
read_api /api/v1/assessments | jq -e 'length == 0'
id=$(cat /proc/sys/kernel/random/uuid)
body=$(jq -nc --arg id "$id" --arg now "$(date -u +%FT%TZ)" \
  '{id:$id,source:"ci-source",observed:$now,policy:"hr.postgres.offboarding/v1",results:[]}')
curl -fsS -H "Authorization: Bearer $RELAY_TOKEN" -H 'Content-Type: application/json' \
  -d "$body" "$base/api/assessments" | jq -e --arg id "$id" '.id == $id'
docker compose exec -T collection-monitor node scripts/collection-monitor.mjs --once
read_api /api/collection-alerts | jq -e '.checked_at != null'
docker compose down
start
read_api /api/v1/assessments | jq -e --arg id "$id" 'any(.[]; .id == $id and .source == "ci-source")'
