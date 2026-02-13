#!/bin/bash
npx tsx server/dev.ts &
API_PID=$!

for i in $(seq 1 30); do
  if curl -s http://localhost:3001/api/stats > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

npx vite --config vite.config.ts
