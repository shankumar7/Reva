#!/usr/bin/env bash
# Run this in Oracle Cloud Shell, or on an always-on computer such as a Raspberry Pi (see docs/ORACLE-ON-PI.md).
# It creates the free Arm server for you, and keeps
# trying politely until Oracle has room (Arm servers are often "out of capacity").
#
#   bash oracle-get-server.sh
#
# Safe to stop (Ctrl+C) and run again: it never creates a second server or a second network.
# In Cloud Shell keep the browser tab open (it closes after about 20 minutes with no typing, so press Enter now
# and then). On a Pi or other computer it can run all night: start it with  nohup bash oracle-get-server.sh > reva-oracle.log 2>&1 &
set -uo pipefail

NAME="reva-server"
KEY="$HOME/reva_key"
WAIT_BETWEEN_TRIES=300   # seconds between rounds (5 minutes keeps Oracle happy)
WAIT_IF_RATE_LIMITED=900 # seconds to wait if Oracle says "too many requests"

say() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

command -v oci >/dev/null || die "The Oracle command-line tool (oci) is missing. Use Oracle Cloud Shell, or see docs/ORACLE-ON-PI.md."
T="${OCI_TENANCY:-}"
[ -n "$T" ] || T="$(oci iam compartment list --all --compartment-id-in-subtree false --query 'data[0]."compartment-id"' --raw-output 2>/dev/null)"
[ -n "$T" ] || die "Could not find your account id. In Cloud Shell: close and reopen it. On a Pi: run  oci setup config  again."

# 1. SSH key (RSA, because Cloud Shell does not allow ed25519)
if [ ! -f "$KEY.pub" ]; then
  say "Making your SSH key"
  ssh-keygen -t rsa -b 4096 -N "" -f "$KEY" >/dev/null
fi

# 2. Is there already a server?
existing_server() {
  oci compute instance list -c "$T" --display-name "$NAME" \
    --query 'data[?"lifecycle-state"!=`TERMINATED` && "lifecycle-state"!=`TERMINATING`] | [0].id' --raw-output 2>/dev/null | grep -E '^ocid1' || true
}

show_result() {
  local id="$1" ip="" state=""
  say "Waiting for the server to start..."
  for _ in $(seq 1 40); do
    state="$(oci compute instance get --instance-id "$id" --query 'data."lifecycle-state"' --raw-output 2>/dev/null)"
    ip="$(oci compute instance list-vnics --instance-id "$id" --query 'data[0]."public-ip"' --raw-output 2>/dev/null | grep -E '^[0-9]' || true)"
    [ "$state" = "RUNNING" ] && [ -n "$ip" ] && break
    sleep 10
  done
  echo
  echo "=========================================================="
  echo " YOUR SERVER IS READY"
  echo " State:      ${state:-unknown}"
  echo " Public IP:  ${ip:-not shown yet, look on the instance page}"
  echo "=========================================================="
  echo "Next: point a DuckDNS name at the Public IP, then run the install command in docs/SERVER-SETUP.md."
}

ID="$(existing_server)"
if [ -n "$ID" ]; then
  say "You already have a server called $NAME. Nothing to create."
  show_result "$ID"
  exit 0
fi

# 3. Network (made once, reused after)
say "Preparing the network"
VCN="$(oci network vcn list -c "$T" --display-name reva-vcn --lifecycle-state AVAILABLE --query 'data[0].id' --raw-output 2>/dev/null | grep -E '^ocid1' || true)"
if [ -z "$VCN" ]; then
  VCN="$(oci network vcn create -c "$T" --display-name reva-vcn --cidr-block 10.0.0.0/16 --dns-label revavcn \
        --wait-for-state AVAILABLE --query 'data.id' --raw-output)" || die "Could not create the network."
fi
IGW="$(oci network internet-gateway list -c "$T" --vcn-id "$VCN" --query 'data[0].id' --raw-output 2>/dev/null | grep -E '^ocid1' || true)"
if [ -z "$IGW" ]; then
  IGW="$(oci network internet-gateway create -c "$T" --vcn-id "$VCN" --is-enabled true --display-name reva-igw \
        --wait-for-state AVAILABLE --query 'data.id' --raw-output)" || die "Could not create the internet gateway."
fi
RT="$(oci network vcn get --vcn-id "$VCN" --query 'data."default-route-table-id"' --raw-output)"
oci network route-table update --rt-id "$RT" --force \
  --route-rules "[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$IGW\"}]" >/dev/null || die "Could not set the route."
SL="$(oci network vcn get --vcn-id "$VCN" --query 'data."default-security-list-id"' --raw-output)"
tcp() { printf '{"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":%s,"max":%s}}}' "$1" "$1"; }
udp() { printf '{"source":"0.0.0.0/0","protocol":"17","isStateless":false,"udpOptions":{"destinationPortRange":{"min":%s,"max":%s}}}' "$1" "$1"; }
udp_range() { printf '{"source":"0.0.0.0/0","protocol":"17","isStateless":false,"udpOptions":{"destinationPortRange":{"min":%s,"max":%s}}}' "$1" "$2"; }
oci network security-list update --security-list-id "$SL" --force \
  --ingress-security-rules "[$(tcp 22),$(tcp 80),$(tcp 443),$(tcp 3478),$(udp 3478),$(udp_range 49160 49200),{\"source\":\"0.0.0.0/0\",\"protocol\":\"1\",\"isStateless\":false,\"icmpOptions\":{\"type\":3,\"code\":4}}]" \
  --egress-security-rules '[{"destination":"0.0.0.0/0","protocol":"all","isStateless":false}]' >/dev/null || die "Could not open the ports."
SUBNET="$(oci network subnet list -c "$T" --vcn-id "$VCN" --display-name reva-subnet --query 'data[0].id' --raw-output 2>/dev/null | grep -E '^ocid1' || true)"
if [ -z "$SUBNET" ]; then
  SUBNET="$(oci network subnet create -c "$T" --vcn-id "$VCN" --cidr-block 10.0.0.0/24 --display-name reva-subnet --dns-label revasub \
        --wait-for-state AVAILABLE --query 'data.id' --raw-output)" || die "Could not create the subnet."
fi

# 4. Ubuntu 24.04 for Arm, and the data centre
say "Finding Ubuntu 24.04 for Arm"
IMG="$(oci compute image list -c "$T" --operating-system "Canonical Ubuntu" --operating-system-version "24.04" \
      --shape VM.Standard.A1.Flex --sort-by TIMECREATED --sort-order DESC --limit 1 --query 'data[0].id' --raw-output 2>/dev/null | grep -E '^ocid1' || true)"
[ -n "$IMG" ] || die "Could not find the Ubuntu 24.04 Arm image."
AD="$(oci iam availability-domain list -c "$T" --query 'data[0].name' --raw-output)"
[ -n "$AD" ] || die "Could not find the data centre."

# 5. Keep trying. Biggest first (2 CPU / 12 GB), then a smaller one (1 CPU / 6 GB) that is easier to get.
try_launch() {
  local ocpus="$1" mem="$2"
  oci compute instance launch -c "$T" --availability-domain "$AD" --display-name "$NAME" \
    --shape VM.Standard.A1.Flex --shape-config "{\"ocpus\":$ocpus,\"memoryInGBs\":$mem}" \
    --image-id "$IMG" --subnet-id "$SUBNET" --assign-public-ip true \
    --ssh-authorized-keys-file "$KEY.pub" 2>&1
}

n=0
while true; do
  n=$((n + 1))
  for size in "2 12" "1 6"; do
    set -- $size
    say "Try $n: asking Oracle for $1 CPU and $2 GB memory"
    OUT="$(try_launch "$1" "$2")"
    if echo "$OUT" | grep -q '"lifecycle-state"'; then
      ID="$(echo "$OUT" | grep -m1 '"id"' | sed 's/.*"\(ocid1[^"]*\)".*/\1/')"
      say "Oracle accepted it!"
      [ "$1" = "1" ] && echo "(It is the smaller 1 CPU / 6 GB size. You can make it bigger later in the console: Instance, then Edit shape.)"
      show_result "$ID"
      exit 0
    elif echo "$OUT" | grep -qiE 'TooManyRequests|429'; then
      say "Oracle says slow down. Waiting $((WAIT_IF_RATE_LIMITED / 60)) minutes."
      sleep "$WAIT_IF_RATE_LIMITED"
      break
    elif echo "$OUT" | grep -qiE 'out of (host )?capacity|OutOfHostCapacity|capacity'; then
      say "No room right now."
      sleep 20
    else
      echo "$OUT" | tail -n 12
      die "Oracle gave an error I do not recognise (shown above). Please report it as an issue (without any secrets)."
    fi
  done
  say "Next try in $((WAIT_BETWEEN_TRIES / 60)) minutes. Leave this running. (Cloud Shell: press Enter now and then.)"
  sleep "$WAIT_BETWEEN_TRIES"
done
