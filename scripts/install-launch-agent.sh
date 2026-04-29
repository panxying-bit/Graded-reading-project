#!/bin/bash
# One-time: install Login Item LaunchAgent. Run from project root or any cwd.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.gradedreading.platform.dev.plist"
SRC="$SCRIPT_DIR/$PLIST_NAME"
DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"
mkdir -p "$SCRIPT_DIR/../.dev-logs"
chmod +x "$SCRIPT_DIR/launch-dev-stack.sh" "$SCRIPT_DIR/stop-dev-stack.sh"

if [ ! -f "$SRC" ]; then
  echo "Missing $SRC" >&2
  exit 1
fi

if [ -f "$DEST" ]; then
  echo "Unloading old agent..."
  launchctl unload -w "$DEST" 2>/dev/null || launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
  rm -f "$DEST"
fi
cp "$SRC" "$DEST"
echo "Loading LaunchAgent: $DEST"
# macOS: load user agent
launchctl load -w "$DEST" 2>/dev/null || launchctl bootstrap "gui/$(id -u)" "$DEST"

echo "Done. The stack will start on next login, or run now with:"
echo "  launchctl start com.gradedreading.platform.dev"
echo "Stop auto-start: launchctl unload -w \"$DEST\" && rm \"$DEST\""
