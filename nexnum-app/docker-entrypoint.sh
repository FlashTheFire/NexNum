#!/bin/sh
set -e

# Run database migrations first
echo "[STARTUP] Running Prisma migrations..."
npx prisma migrate deploy || echo "[STARTUP] Migrations failed or already applied, continuing..."

# Start the application
echo "[STARTUP] Starting Next.js server..."
exec node server.js
