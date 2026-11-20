#!/usr/bin/env bash
# Builds reva-server.tar.gz: everything the server needs, nothing secret.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-reva-server.tar.gz}"
tar czf "$OUT" --transform 's,^,reva-server/,' \
  --exclude=node_modules --exclude=dist --exclude='*.db' \
  server/package.json server/package-lock.json server/tsconfig.json server/src shared deploy
echo "wrote $OUT"
