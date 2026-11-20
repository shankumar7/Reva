#!/usr/bin/env bash
# One-time install of the chat server. Safe to run again (keeps your secrets, rebuilds the code).
# Usage:  sudo bash install.sh your-name.duckdns.org
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then echo "Usage: sudo bash install.sh your-name.duckdns.org"; exit 1; fi
if [ "$(id -u)" != 0 ]; then echo "Please run with sudo."; exit 1; fi

HERE="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/reva
EDGE=/opt/edge
say() { printf '\n==> %s\n' "$*"; }

say "Checking that $DOMAIN points at this server"
MYIP="$(curl -fsS https://api.ipify.org || true)"
DNSIP="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
echo "this server: ${MYIP:-unknown}   $DOMAIN points to: ${DNSIP:-nothing yet}"
if [ -n "$MYIP" ] && [ "$MYIP" != "$DNSIP" ]; then
  echo "WARNING: the name does not point here yet. Fix it on duckdns.org, then run this again."
  echo "         (continuing anyway; HTTPS will start working once the name is right)"
fi

say "Installing Docker if needed"
if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sh; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq qrencode iptables-persistent >/dev/null

say "Opening web ports 80 and 443 on this server"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$p" -j ACCEPT
done
netfilter-persistent save >/dev/null 2>&1 || true

say "Setting up folders and secrets"
docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null
mkdir -p "$EDGE/sites" "$APP/data/updates" "$APP/data/backups"
rm -rf "$APP/src" && mkdir -p "$APP/src" && cp -r "$HERE/server" "$HERE/shared" "$HERE/deploy" "$APP/src/"
rm -rf "$APP/src/server/node_modules" "$APP/src/server/dist"
chown -R 1000:1000 "$APP/data"
if [ ! -f "$APP/.env" ]; then
  umask 077
  {
    echo "SETUP_TOKEN=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
    echo "BACKUP_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  } > "$APP/.env"
  chmod 600 "$APP/.env"
fi
cp "$HERE/deploy/docker-compose.reva.yml" "$APP/docker-compose.yml"
cp "$HERE/deploy/docker-compose.edge.yml" "$EDGE/docker-compose.yml"
cp "$HERE/deploy/Caddyfile" "$EDGE/Caddyfile"
cat > "$EDGE/sites/reva.caddy" <<CADDY
$DOMAIN {
	reverse_proxy reva:8080
}
CADDY

say "Building and starting (the first time takes a few minutes)"
docker compose -f "$APP/docker-compose.yml" --project-directory "$APP" up -d --build
docker compose -f "$EDGE/docker-compose.yml" --project-directory "$EDGE" up -d
docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true

say "Waiting for the server to answer over HTTPS"
OK=0
for i in $(seq 1 45); do
  if curl -fsS "https://$DOMAIN/health" 2>/dev/null | grep -q ok; then OK=1; break; fi
  sleep 4
done

TOKEN="$(grep '^SETUP_TOKEN=' "$APP/.env" | cut -d= -f2)"
CODE="{\"v\":1,\"url\":\"wss://$DOMAIN\",\"token\":\"$TOKEN\"}"
umask 077
echo "$CODE" > "$APP/setup-code.txt"

if [ "$OK" = 1 ]; then
  say "DONE. The server is running at https://$DOMAIN"
else
  say "Installed, but https://$DOMAIN did not answer yet."
  echo "Most likely: the DuckDNS name does not point here yet, or ports 80/443 are not open in the Oracle Cloud network rules."
fi
echo
echo "Scan this with the app (first phone, 'I am starting'). It works only until both phones are paired:"
echo
qrencode -t ANSIUTF8 "$CODE"
echo
echo "Or type these in the app:"
echo "   Server address: wss://$DOMAIN"
echo "   Setup code:     $TOKEN"
echo
echo "Saved on the server in $APP/setup-code.txt (only the root user can read it)."
echo "Keep $APP/.env safe: BACKUP_KEY in it is the only way to open your backups."
