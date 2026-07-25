#!/bin/bash
# Tat + xoa launchd agent cua bot.
set -euo pipefail

LABEL="com.sociagri.discordbot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null && echo "→ da dung service" || echo "→ service khong chay"
rm -f "$PLIST" && echo "→ da xoa $PLIST"
