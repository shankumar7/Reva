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

say "Making sure there is enough memory (adds a 2 GB swap file on small servers)"
if [ "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)" -lt 3000 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Installing Docker if needed"
if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sh; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq qrencode iptables-persistent >/dev/null

say "Opening web ports 80 and 443 on this server"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport "$p" -j ACCEPT
done
say "Opening the call relay ports (3478 and 49160-49200)"
iptables -C INPUT -p udp --dport 3478 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p udp --dport 3478 -j ACCEPT
iptables -C INPUT -p tcp --dport 3478 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 3478 -j ACCEPT
iptables -C INPUT -p udp --dport 49160:49200 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p udp --dport 49160:49200 -j ACCEPT
netfilter-persistent save >/dev/null 2>&1 || true

say "Setting up folders and secrets"
docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null
mkdir -p "$EDGE/sites" "$APP/data/updates" "$APP/data/backups" "$APP/secrets"
chmod 700 "$APP/secrets"
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
# the call relay needs a secret and the server's name; add them when updating an older install too
grep -q '^TURN_SECRET=' "$APP/.env" || { umask 077; echo "TURN_SECRET=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" >> "$APP/.env"; }
sed -i '/^TURN_HOST=/d' "$APP/.env"; echo "TURN_HOST=$DOMAIN" >> "$APP/.env"
TURN_SECRET="$(grep '^TURN_SECRET=' "$APP/.env" | cut -d= -f2)"
PRIVIP="$(hostname -I | awk '{print $1}')"
TURNDIR=/opt/turn
mkdir -p "$TURNDIR" && chmod 700 "$TURNDIR"
umask 077
cat > "$TURNDIR/turnserver.conf" <<TURN
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=$DOMAIN
server-name=$DOMAIN
${MYIP:+external-ip=$MYIP/$PRIVIP}
min-port=49160
max-port=49200
no-tls
no-dtls
no-cli
no-multicast-peers
no-stdout-log
log-file=/dev/null
total-quota=20
user-quota=6
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
TURN
chmod 644 "$TURNDIR/turnserver.conf"
cp "$HERE/deploy/docker-compose.turn.yml" "$TURNDIR/docker-compose.yml"
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
docker compose -f "$TURNDIR/docker-compose.yml" --project-directory "$TURNDIR" up -d || echo "(the call relay did not start; chat still works, voice calls may fail on some networks)"
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
