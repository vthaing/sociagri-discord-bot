#!/bin/bash
# Wrapper de launchd (hoac ban) chay bot voi Node 22 dung PATH.
set -euo pipefail

BOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BOT_DIR"

# launchd khong co PATH cua nvm -> nap tay
export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p logs

if ! command -v node >/dev/null 2>&1; then
  echo "[run.sh] KHONG tim thay node — sua PATH trong scripts/run.sh" >&2
  exit 1
fi

echo "[run.sh] $(date '+%Y-%m-%d %H:%M:%S') khoi dong bot ($(node -v)) tai $BOT_DIR"
exec node --env-file-if-exists=.env src/bot.mjs
