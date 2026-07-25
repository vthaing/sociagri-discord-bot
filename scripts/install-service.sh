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

  <!-- Restart khi bot thoat voi code != 0 (loi tam thoi).
       Bot dung exit 0 cho loi VINH VIEN (config/token sai) => launchd de yen,
       khong tao crash-loop vo nghia. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <!-- 60s: du cham de khong dot may neu co loi lap lai, du nhanh de tu hoi phuc -->
  <key>ThrottleInterval</key>
  <integer>60</integer>

  <key>StandardOutPath</key>
  <string>$BOT_DIR/logs/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$BOT_DIR/logs/launchd.err.log</string>

  <!-- Standard (khong phai Background): ProcessType=Background bi macOS ha uu tien
       CPU/IO cho ca bot LAN cac process `claude` con => cau tra loi cham, de cham timeout 180s -->
  <key>ProcessType</key>
  <string>Standard</string>
</dict>
</plist>
PLIST_EOF

echo "→ da ghi $PLIST"

# Go ban cu (neu co) roi nap lai.
# enable TRUOC bootstrap: neu label tung bi `launchctl disable` thi bootstrap se
# that bai voi loi kho hieu (Input/output error).
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl enable "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"

echo "→ da nap service $LABEL"
echo
echo "Kiem tra:   launchctl print gui/$UID_NUM/$LABEL | head -20"
echo "Xem log:    tail -f $BOT_DIR/logs/bot.log"
echo "Dung:       bash $BOT_DIR/scripts/uninstall-service.sh"
