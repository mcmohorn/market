#!/bin/bash
fuser -k 3001/tcp 2>/dev/null
sleep 1

npx tsx server/dev.ts &
API_PID=$!

for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:3001/api/stats > /dev/null 2>&1; then
    echo "API server ready on port 3001"
    break
  fi
  sleep 1
done

npx vite --config vite.config.ts

kill $API_PID 2>/dev/null
