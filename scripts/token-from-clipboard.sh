#!/bin/bash
# Lay DISCORD_TOKEN tu CLIPBOARD roi ghi vao .env — token KHONG bao gio bi in ra man hinh/log.
# Dung sau khi bam nut "Copy" o Developer Portal (trang Bot, ngay sau khi Reset Token).
#
#   bash scripts/token-from-clipboard.sh
#
# Tuy chon:  bash scripts/token-from-clipboard.sh --claude   (dan token claude sk-ant-oat01-... thay vi discord)
set -uo pipefail

BOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BOT_DIR"
export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

KEY='DISCORD_TOKEN'
[ "${1:-}" = '--claude' ] && KEY='CLAUDE_CODE_OAUTH_TOKEN'

if ! command -v pbpaste >/dev/null 2>&1; then
  echo "❌ khong co pbpaste (chi chay tren macOS)" >&2
  exit 1
fi

VAL="$(pbpaste | tr -d '[:space:]')"

if [ -z "$VAL" ]; then
  echo "❌ Clipboard TRONG. Bam nut Copy o Developer Portal roi chay lai lenh nay." >&2
  exit 1
fi

# --- validate (khong in gia tri) ---
if [ "$KEY" = 'DISCORD_TOKEN' ]; then
  DOTS="$(printf '%s' "$VAL" | tr -cd '.' | wc -c | tr -d ' ')"
  if [ "$DOTS" != '2' ] || [ "${#VAL}" -lt 50 ]; then
    echo "❌ Clipboard KHONG phai bot token: ${#VAL} ky tu, ${DOTS} dau '.'  (can 2 dau '.', >=50 ky tu)" >&2
    case "${#VAL}" in
      32) echo "   → 32 ky tu = CLIENT SECRET (tab OAuth2). Bot token o tab Bot → Reset Token." >&2 ;;
      64) echo "   → 64 ky tu = PUBLIC KEY (General Information)." >&2 ;;
    esac
    exit 1
  fi
  echo "✅ clipboard co bot token hop le (${#VAL} ky tu, 2 dau '.')"
else
  case "$VAL" in
    sk-ant-oat01-*) echo "✅ clipboard co token Claude (${#VAL} ky tu)" ;;
    *)
      echo "❌ Clipboard khong bat dau bang 'sk-ant-oat01-' (${#VAL} ky tu). Chay lai: claude setup-token" >&2
      exit 1
      ;;
  esac
fi

[ -f .env ] || cp .env.example .env
chmod 600 .env

# --- ghi vao .env, moi key chi 1 dong ---
KEY="$KEY" VAL="$VAL" python3 <<'PY'
import os, re

key = os.environ['KEY']
val = os.environ['VAL']

lines = open('.env', encoding='utf-8').read().split('\n')
out, done = [], False

for line in lines:
    m = re.match(r'\s*([A-Z_]+)\s*=', line)
    if m and m.group(1) == key and not line.lstrip().startswith('#'):
        if done:
            continue          # bo dong trung
        out.append(f'{key}={val}')
        done = True
    else:
        out.append(line)

if not done:
    out.append(f'{key}={val}')

open('.env', 'w', encoding='utf-8').write('\n'.join(out))
print(f'→ da ghi {key} vao .env (khong in gia tri)')
PY

chmod 600 .env

# --- xoa clipboard cho sach (token khong nam lai trong clipboard) ---
printf '' | pbcopy
echo "→ da xoa clipboard"

echo
npm run check
