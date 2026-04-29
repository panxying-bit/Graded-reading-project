#!/bin/bash
# Graded reading platform: start server + web (Vite) for local dev. Used by macOS LaunchAgent.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

# nvm (common locations)
if [ -n "${HOME:-}" ] && [ -f "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh"
elif [ -f "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "/opt/homebrew/opt/nvm/nvm.sh"
fi

# Project root (same directory layout as this repo)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

# Avoid duplicate servers after re-login: free default ports
for port in 3000 5173; do
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done
sleep 1

cd "$PROJECT_ROOT/server"
nohup npm run dev >> "$LOG_DIR/server.log" 2>&1 &
echo $! > "$LOG_DIR/server.pid"

cd "$PROJECT_ROOT/web"
nohup npm run dev >> "$LOG_DIR/web.log" 2>&1 &
echo $! > "$LOG_DIR/web.pid"

echo "graded-reading dev stack started at $(date -Iseconds). Logs: $LOG_DIR"
