#!/bin/sh
# Start Xray, then hand over to the Next.js server.
# POSIX-clean: the image is Alpine, so this runs under busybox ash.
set -e

BASE_PORT="${XRAY_BASE_PORT:-10809}"
mkdir -p /app/xray

VLESS_POOL_SIZE=$(node /app/vless/build-xray-config.js /app/xray/config.json)
export VLESS_POOL_SIZE

/usr/local/bin/xray -c /app/xray/config.json &
XRAY_PID=$!

# Xray binds its listeners shortly after exec, so poll instead of sleeping a
# fixed amount and racing the first request.
i=0
until nc -z 127.0.0.1 "$BASE_PORT" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 60 ] && { echo "xray did not open $BASE_PORT in time" >&2; exit 1; }
  kill -0 "$XRAY_PID" 2>/dev/null || { echo "xray exited during startup" >&2; exit 1; }
  sleep 0.25
done
echo "xray ready: $VLESS_POOL_SIZE exits from port $BASE_PORT"

trap 'kill -TERM "$XRAY_PID" "$NEXT_PID" 2>/dev/null; exit 0' TERM INT

node /app/server.js &
NEXT_PID=$!

# busybox ash has no `wait -n`. If either process dies the container cannot
# serve, so exit and let Vercel replace it.
while kill -0 "$XRAY_PID" 2>/dev/null && kill -0 "$NEXT_PID" 2>/dev/null; do
  sleep 2
done

kill -TERM "$XRAY_PID" "$NEXT_PID" 2>/dev/null || true
exit 1
