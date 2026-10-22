#!/bin/sh
# Serve the compare app + glyph editor (with save/rebuild endpoints). Port 8768 unless taken.
cd "$(dirname "$0")"
PORT=${1:-8768}
while ss -ltn 2>/dev/null | grep -q ":$PORT "; do PORT=$((PORT+1)); done
exec python3 edit_server.py "$PORT"
