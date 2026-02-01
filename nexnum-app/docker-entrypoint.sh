#!/bin/sh
set -e

# Run database migrations with explicit error handling and local binary
echo "[STARTUP] Running Prisma migrations..."

# Ensure environment variables are exported for the migration process
# Docker injects them, but this is a safety layer for certain shell environments
if [ -z "$DATABASE_URL" ] && [ -f .env ]; then
    echo "[STARTUP] Exporting local .env for migrations..."
    export $(grep -v '^#' .env | xargs)
fi

if [ -n "$DATABASE_URL" ]; then
    # Force use of library engine for more robust SSL handling in some environments
    export PRISMA_CLI_QUERY_ENGINE_TYPE=library
    ./node_modules/.bin/prisma migrate deploy || echo "[STARTUP] Migrations failed or already applied, continuing..."
else
    echo "[STARTUP] ERROR: DATABASE_URL not found, migrations will likely fail."
fi

# Start the application
echo "[STARTUP] Starting Next.js server..."
exec node server.js
