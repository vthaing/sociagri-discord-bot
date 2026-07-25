#!/bin/bash
# Nhap 3 gia tri con thieu vao .env mot cach an toan:
#   - go an (khong hien tren man hinh), khong echo, khong ghi vao shell history
#   - validate dinh dang truoc khi ghi  -> bat loi copy thieu ky tu
#   - moi key CHI con 1 dong trong .env  -> khong con canh "2 dong cung ten"
#   - chmod 600 .env
# Dung:  bash scripts/setup-env.sh
set -uo pipefail

BOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BOT_DIR"

export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "→ da tao .env tu .env.example"
fi
chmod 600 .env

echo
echo "=============================================="
echo " Dien cau hinh cho SociAgri Discord bot"
echo "=============================================="
echo "Bo trong + Enter = giu nguyen gia tri dang co."
echo "Go dau tru '-' + Enter    = XOA gia tri (vd xoa token Claude de dung dang nhap Keychain)."
echo

current_len() { # $1 = key
  python3 - "$1" <<'PY'
import os, sys, re
key = sys.argv[1]
val = ''
try:
    for line in open('.env', encoding='utf-8'):
        if line.lstrip().startswith('#'):
            continue
        m = re.match(r'\s*([A-Z_]+)\s*=(.*)$', line.rstrip('\n'))
        if m and m.group(1) == key and m.group(2).strip():
            val = m.group(2).strip()
except FileNotFoundError:
    pass
print(len(val))
PY
}

# ---------------------------------------------------------------- 1. Discord bot token
LEN=$(current_len DISCORD_TOKEN)
echo "--- 1/3  DISCORD_TOKEN  (hien tai: ${LEN} ky tu) ---"
echo "    Lay o: https://discord.com/developers/applications → app cua ban → Bot → Reset Token → Copy"
printf "    Dan token (go an): "
IFS= read -r -s DISCORD_IN
echo
if [ -n "$DISCORD_IN" ]; then
  DISCORD_IN="$(printf '%s' "$DISCORD_IN" | tr -d '[:space:]')"
  DOTS="$(printf '%s' "$DISCORD_IN" | tr -cd '.' | wc -c | tr -d ' ')"
  if [ "$DOTS" != "2" ] || [ "${#DISCORD_IN}" -lt 50 ]; then
    echo "    ⚠️  Token Discord phai co dung 2 dau '.' va dai >=50 ky tu."
    echo "       Nhan duoc: ${#DISCORD_IN} ky tu, ${DOTS} dau '.'  → CO VE COPY THIEU. Bo qua, chay lai script sau."
    DISCORD_IN=""
  else
    echo "    ✅ dinh dang hop le (${#DISCORD_IN} ky tu)"
  fi
fi

# ---------------------------------------------------------------- 2. Allowed user IDs
CUR_IDS="$(python3 -c "
import re
v=''
for line in open('.env',encoding='utf-8'):
    if line.lstrip().startswith('#'): continue
    m=re.match(r'\s*ALLOWED_USER_IDS\s*=(.*)$', line.rstrip())
    if m and m.group(1).strip(): v=m.group(1).strip()
print(v)
")"
echo
echo "--- 2/3  ALLOWED_USER_IDS  (hien tai: ${CUR_IDS:-trong}) ---"
echo "    Discord → Settings → Advanced → bat Developer Mode"
echo "    → click phai vao ten nguoi → Copy User ID.  Nhieu nguoi thi cach nhau dau phay."
printf "    Dan user ID: "
IFS= read -r IDS_IN
if [ -n "$IDS_IN" ]; then
  IDS_IN="$(printf '%s' "$IDS_IN" | tr -d '[:space:]')"
  if printf '%s' "$IDS_IN" | grep -Eq '^[0-9]{15,25}(,[0-9]{15,25})*$'; then
    echo "    ✅ hop le ($(printf '%s' "$IDS_IN" | tr ',' '\n' | wc -l | tr -d ' ') nguoi)"
  else
    echo "    ⚠️  User ID phai la day so 15-25 chu so (VD 123456789012345678), nhieu nguoi cach nhau dau phay."
    echo "       Neu ban dan ten kieu 'vince#1234' thi SAI — phai bat Developer Mode roi Copy User ID."
    IDS_IN=""
  fi
fi

# ---------------------------------------------------------------- 3. Claude OAuth token
LEN=$(current_len CLAUDE_CODE_OAUTH_TOKEN)
echo
echo "--- 3/3  CLAUDE_CODE_OAUTH_TOKEN  (hien tai: ${LEN} ky tu) ---"
echo "    Lay bang:  claude setup-token   (mo browser → Authorize → in ra token sk-ant-oat01-...)"
echo "    LUU Y: copy TRON VEN ca dong, khong thieu duoi. Bo trong neu muon dung dang nhap Keychain."
printf "    Dan token (go an): "
IFS= read -r -s CLAUDE_IN
echo
if [ -n "$CLAUDE_IN" ]; then
  CLAUDE_IN="$(printf '%s' "$CLAUDE_IN" | tr -d '[:space:]')"
  case "$CLAUDE_IN" in
    '-')
      echo "    → se XOA token trong .env (bot se dua vao dang nhap Keychain: claude → /login)"
      CLAUDE_IN='__CLEAR__'
      ;;
    sk-ant-oat01-*) : ;;
    *)
      echo "    ⚠️  Token phai bat dau bang 'sk-ant-oat01-'. Ban dan thu khac roi. Bo qua."
      CLAUDE_IN=""
      ;;
  esac
  if [ "$CLAUDE_IN" != '__CLEAR__' ] && [ -n "$CLAUDE_IN" ] && [ "${#CLAUDE_IN}" -lt 80 ]; then
    echo "    ⚠️  Chi ${#CLAUDE_IN} ky tu — ngan bat thuong, co the copy thieu duoi. Van ghi, nhung neu 401 thi copy lai."
  fi
  [ "$CLAUDE_IN" != '__CLEAR__' ] && [ -n "$CLAUDE_IN" ] && echo "    ✅ da nhan (${#CLAUDE_IN} ky tu)"
fi

# ---------------------------------------------------------------- ghi vao .env (dedup)
export SET_DISCORD_TOKEN="$DISCORD_IN"
export SET_ALLOWED_USER_IDS="$IDS_IN"
export SET_CLAUDE_TOKEN="$CLAUDE_IN"

python3 <<'PY'
import os, re

updates = {}
for env_name, key in [
    ('SET_DISCORD_TOKEN', 'DISCORD_TOKEN'),
    ('SET_ALLOWED_USER_IDS', 'ALLOWED_USER_IDS'),
    ('SET_CLAUDE_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'),
]:
    v = os.environ.get(env_name, '')
    if v == '__CLEAR__':
        updates[key] = ''
    elif v:
        updates[key] = v

lines = open('.env', encoding='utf-8').read().split('\n')
seen = set()
out = []

for line in lines:
    m = re.match(r'\s*([A-Z_]+)\s*=(.*)$', line)
    if not m or line.lstrip().startswith('#'):
        out.append(line)
        continue
    key, old = m.group(1), m.group(2)

    if key in seen:
        # dong trung ten -> bo, nhung giu lai gia tri neu dong dau dang rong
        if old.strip() and not updates.get(key):
            for i, prev in enumerate(out):
                pm = re.match(r'\s*([A-Z_]+)\s*=(.*)$', prev)
                if pm and pm.group(1) == key and not pm.group(2).strip():
                    out[i] = f'{key}={old.strip()}'
                    break
        continue

    seen.add(key)
    out.append(f'{key}={updates[key]}' if key in updates else line)

for key, val in updates.items():
    if key not in seen:
        out.append(f'{key}={val}')

open('.env', 'w', encoding='utf-8').write('\n'.join(out))

dups = [k for k in updates]
print(f"→ da ghi .env ({len(dups)} gia tri moi), moi key chi con 1 dong")
PY

unset SET_DISCORD_TOKEN SET_ALLOWED_USER_IDS SET_CLAUDE_TOKEN DISCORD_IN IDS_IN CLAUDE_IN
chmod 600 .env

echo
echo "=============================================="
echo " Kiem tra lai"
echo "=============================================="
npm run check
