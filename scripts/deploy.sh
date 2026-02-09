#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/home/mikhailst-laurent/projects/brule-ai/montreal-score"
CF_TOKEN_FILE="$HOME/.config/cloudflare/api_token"
ZONE_ID="7c80804534f0718cb0646311fa746505"

cd "$PROJECT_DIR"

echo "==> Pulling latest changes..."
git pull --ff-only

echo "==> Running ETL (incremental)..."
npm run etl

echo "==> Building production bundle..."
npm run build

echo "==> Restarting montreal-score service..."
sudo systemctl restart montreal-score

echo "==> Waiting for server to be ready..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:3891 > /dev/null 2>&1; then
    echo "    Server is up."
    break
  fi
  sleep 1
done

echo "==> Purging Cloudflare cache..."
CF_TOKEN=$(cat "$CF_TOKEN_FILE" | tr -d '\n')
RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hosts":["montrealscore.ashwater.ca"]}')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "    Cache purged."
else
  echo "    WARNING: Cache purge failed: $RESPONSE"
fi

echo "==> Deploy complete!"
