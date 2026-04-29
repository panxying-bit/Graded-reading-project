#!/bin/bash
# Stop server (3000) and Vite (5173) for this project — by port, safe for other apps if ports differ.
set -euo pipefail

for port in 3000 5173; do
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Killing listeners on port $port: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  else
    echo "No listener on port $port"
  fi
done
echo "Done."
