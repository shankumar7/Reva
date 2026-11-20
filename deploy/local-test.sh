#!/usr/bin/env bash
# Test Reva on your own laptop (Mac or Linux) before the real server exists.
# Needs: Node 22 or newer, and (for phones) the free "cloudflared" tunnel.
#   Mac:    brew install cloudflared
# Run from the unpacked reva-server folder:   bash deploy/local-test.sh
# Everything it makes is throwaway test data in ./local-test-data. Do NOT use it for real conversations.
set -euo pipefail
cd "$(dirname "$0")/.."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ]; then echo "Please install Node 22 or newer from nodejs.org, then run this again."; exit 1; fi

if [ ! -d server/node_modules ]; then (cd server && npm install --no-audit --no-fund); fi

DATA="$PWD/local-test-data"; mkdir -p "$DATA"
TOKEN="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
PORT=8080
export SETUP_TOKEN="$TOKEN" DATA_DIR="$DATA" PORT NODE_NO_WARNINGS=1

(cd server && npx tsx src/index.ts) &
SERVER=$!
trap 'kill $SERVER ${TUNNEL:-} 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -fs "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 1; done
echo "Server is running on this laptop."

if ! command -v cloudflared >/dev/null; then
  echo
  echo "To connect phones you also need the free tunnel. Install it, then run this again:"
  echo "  Mac:   brew install cloudflared"
  echo "  Other: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 0
fi

LOG="$(mktemp)"
cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >"$LOG" 2>&1 &
TUNNEL=$!
URL=""
for _ in $(seq 1 40); do
  URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1 || true)"
  [ -n "$URL" ] && break; sleep 1
done
[ -n "$URL" ] || { echo "The tunnel did not start. Details: $LOG"; exit 1; }

echo
echo "=========================================================="
echo " In the app, 'I am starting', type these two:"
echo "   Server address: wss://${URL#https://}"
echo "   Setup code:     $TOKEN"
echo "=========================================================="
if command -v qrencode >/dev/null; then
  echo; echo "Or scan this with the app (first phone, 'I am starting'):"; echo
  qrencode -t ANSIUTF8 "{\"v\":1,\"url\":\"wss://${URL#https://}\",\"token\":\"$TOKEN\"}"
else
  echo "(Optional: 'brew install qrencode', then run again, to get a QR code to scan instead of typing.)"
fi
echo "Keep this window open while testing. Press Ctrl+C to stop."
echo "The address changes every time you run this, so pair the phones in one go."
wait $SERVER
