#!/bin/sh
set -e

# Run database migrations with explicit error handling and local binary
echo "[STARTUP] Running Prisma migrations..."
if [ -n "$DATABASE_URL" ]; then
    ./node_modules/.bin/prisma migrate deploy || echo "[STARTUP] Migrations already applied or failed, verify manually."
else
    echo "[STARTUP] WARNING: DATABASE_URL not found, skipping migration check."
fi

# Start the application
echo "[STARTUP] Starting Next.js server..."
exec node server.js
