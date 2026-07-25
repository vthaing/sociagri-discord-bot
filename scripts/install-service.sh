#!/bin/bash
# Cai bot thanh launchd agent: tu chay khi ban dang nhap may, tu restart neu chet.
set -euo pipefail

BOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.sociagri.discordbot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

mkdir -p "$HOME/Library/LaunchAgents" "$BOT_DIR/logs"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$BOT_DIR/scripts/run.sh</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$BOT_DIR</string>

  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>

  <key>StandardOutPath</key>
  <string>$BOT_DIR/logs/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$BOT_DIR/logs/launchd.err.log</string>

  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PLIST_EOF

echo "→ da ghi $PLIST"

# Go ban cu (neu co) roi nap lai
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
launchctl enable "gui/$UID_NUM/$LABEL" 2>/dev/null || true

echo "→ da nap service $LABEL"
echo
echo "Kiem tra:   launchctl print gui/$UID_NUM/$LABEL | head -20"
echo "Xem log:    tail -f $BOT_DIR/logs/bot.log"
echo "Dung:       bash $BOT_DIR/scripts/uninstall-service.sh"
