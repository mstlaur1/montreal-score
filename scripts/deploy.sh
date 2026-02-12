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

echo "==> Running DB migrations..."
node scripts/migrations/add-processing-days.js
node scripts/migrations/build-fts.js
node scripts/migrations/cache-permit-trends.js
node scripts/migrations/create-areas.js

echo "==> Building production bundle..."
npm run build

echo "==> Linking standalone assets..."
ln -sf "$PROJECT_DIR/.next/static" "$PROJECT_DIR/.next/standalone/.next/static"
ln -sf "$PROJECT_DIR/public" "$PROJECT_DIR/.next/standalone/public"
ln -sf "$PROJECT_DIR/messages" "$PROJECT_DIR/.next/standalone/messages"
rm -rf "$PROJECT_DIR/.next/standalone/data"
ln -sf "$PROJECT_DIR/data" "$PROJECT_DIR/.next/standalone/data"

echo "==> Restarting montreal-score service..."
sudo systemctl restart montreal-score

echo "==> Waiting for server to be ready..."
SERVER_UP=0
for i in $(seq 1 15); do
  if curl -sf http://localhost:3891 > /dev/null 2>&1; then
    echo "    Server is up."
    SERVER_UP=1
    break
  fi
  sleep 1
done
if [ "$SERVER_UP" -eq 0 ]; then
  echo "    ERROR: Server failed to start after 15 seconds."
  exit 1
fi

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
