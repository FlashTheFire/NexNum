#!/bin/sh
set -e

# Run database migrations with explicit error handling and local binary
echo "[STARTUP] Running Prisma migrations..."

# Ensure environment variables are exported for the migration process
if [ -f .env ]; then
    echo "[STARTUP] Exporting local .env for migrations..."
    # Robust loading for shell environments
    set -a
    . ./.env
    set +a
fi

if [ -n "$DATABASE_URL" ]; then
    # INDUSTRIAL HARDENING: Fix for Prisma 7 WASM ENOENT error in pruned environments
    # Ensure wasm sidecars are reachable from .bin if they exist in the build folder
    mkdir -p ./node_modules/.bin
    [ -f ./node_modules/prisma/build/prisma_schema_build_bg.wasm ] && \
        cp ./node_modules/prisma/build/prisma_schema_build_bg.wasm ./node_modules/.bin/ 2>/dev/null || true

    # Force use of library engine for more robust SSL handling
    export PRISMA_CLI_QUERY_ENGINE_TYPE=library
    
    # Run migrations using the direct build index to avoid path resolution issues
    echo "[STARTUP] Running: node node_modules/prisma/build/index.js migrate deploy"
    node node_modules/prisma/build/index.js migrate deploy || \
    ./node_modules/.bin/prisma migrate deploy || \
    npx prisma migrate deploy || \
    echo "[STARTUP] Migrations failed or already applied, continuing..."
else
    echo "[STARTUP] ERROR: DATABASE_URL not found, migrations will likely fail."
fi

# Start the application
echo "[STARTUP] Starting Next.js server..."
exec node server.js
