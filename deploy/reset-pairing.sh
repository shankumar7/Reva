#!/usr/bin/env bash
# Use this if a phone was wiped or lost WITHOUT a backup. It makes the server forget both phones so you can
# pair again from the start. Old undelivered messages on the server are cleared too. Messages already on a
# phone stay on that phone.
#   sudo bash reset-pairing.sh
set -euo pipefail
echo "This makes the server forget BOTH phones. You will pair again with the QR codes."
read -r -p "Type YES to continue: " ok
[ "$ok" = "YES" ] || { echo "Cancelled."; exit 1; }
docker exec reva node -e "
const { DatabaseSync } = require('node:sqlite');
const d = new DatabaseSync('/data/chat.db');
d.exec('DELETE FROM devices; DELETE FROM queue;');
console.log('Done. Pair the phones again: the first phone chooses \"I am starting\".');
"
