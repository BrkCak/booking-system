#!/usr/bin/env sh
set -eu

COMPOSE_FILE="infra/docker-compose.yml"

echo "Waiting for Redpanda to be ready..."
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T redpanda rpk cluster info >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Redpanda is not ready after 30 attempts." >&2
    exit 1
  fi
  sleep 1
done

docker compose -f "$COMPOSE_FILE" exec -T redpanda rpk topic create \
  booking.requested \
  booking.confirmed \
  booking.rejected \
  booking.deadletter || true

docker compose -f "$COMPOSE_FILE" exec -T redpanda rpk topic list
