#!/usr/bin/env bash
# Put a new app version on the server so the "Check for updates" button finds it.
# Usage:  sudo bash publish-update.sh app.apk 2 0.2.0 "What is new"
set -euo pipefail
APK="${1:?apk file}"; CODE="${2:?versionCode (number, higher than the installed one)}"; NAME="${3:?versionName}"; NOTES="${4:-}"
D=/opt/reva/data/updates
mkdir -p "$D"
cp "$APK" "$D/app.apk"
NOTES_ESC="$(printf '%s' "$NOTES" | sed 's/\\/\\\\/g; s/"/\\"/g')"
printf '{"versionCode":%s,"versionName":"%s","notes":"%s"}\n' "$CODE" "$NAME" "$NOTES_ESC" > "$D/latest.json"
chown -R 1000:1000 "$D"
echo "Published version $NAME ($CODE). Phones will see it under Settings > Check for updates."
