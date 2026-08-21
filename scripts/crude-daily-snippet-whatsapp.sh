#!/usr/bin/env bash
set -euo pipefail

cd /home/node/clawd

mkdir -p logs
mkdir -p .config

STATE_FILE=".config/crude-daily-snippet-whatsapp-state.json"

{
  echo "[$(date -Is)] starting crude daily snippet WhatsApp send"

  flock -n /tmp/clawd-crude-daily-snippet-whatsapp.lock bash -lc '
    set -euo pipefail

    delivery_date="$(TZ=Asia/Singapore date +%F)"
    state_file=".config/crude-daily-snippet-whatsapp-state.json"
    previous_date="$(node -e '"'"'
const fs = require("fs");
const file = process.argv[1];
try {
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  process.stdout.write(state.lastDeliveryDate || "");
} catch {}
'"'"' "$state_file")"

    if [[ "${FORCE_SEND:-0}" != "1" && "$previous_date" == "$delivery_date" ]]; then
      echo "NO_REPLY already sent for $delivery_date"
      exit 0
    fi

    tmp="$(mktemp)"
    trap '"'"'rm -f "$tmp"'"'"' EXIT

    node skills/crude-daily-snippet/scripts/generate.mjs > "$tmp"

    node -e '"'"'
const fs = require("fs");
const crypto = require("crypto");
const [stateFile, deliveryDate, msgFile] = process.argv.slice(1);
const text = fs.readFileSync(msgFile, "utf8");
const state = {
  lastDeliveryDate: deliveryDate,
  lastSentAt: new Date().toISOString(),
  lastMessageSha256: crypto.createHash("sha256").update(text).digest("hex"),
  firstLine: text.split(/\r?\n/, 1)[0] || ""
};
fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
'"'"' "$state_file" "$delivery_date" "$tmp"

    cat "$tmp"
  '

  echo "[$(date -Is)] finished"
} >> logs/crude-daily-snippet-whatsapp.log 2>&1
