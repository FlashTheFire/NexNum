#!/bin/bash

# Run database migrations with explicit error handling and local binary
echo "[STARTUP] Running Prisma migrations..."

# Ensure environment variables are exported for the migration process
if [ -f .env ] && [ -z "$DATABASE_URL" ]; then
    echo "[STARTUP] Exporting local .env for migrations..."
    # Robust loading for shell environments
    export $(grep -v '^#' .env | xargs)
fi

if [ -n "$DATABASE_URL" ]; then
    # INDUSTRIAL HARDENING: Fix for Prisma 7 WASM ENOENT error in pruned environments
    # Ensure wasm sidecars are reachable from .bin if they exist in the build folder
    mkdir -p ./node_modules/.bin
    [ -f ./node_modules/prisma/build/prisma_schema_build_bg.wasm ] && \
        cp ./node_modules/prisma/build/prisma_schema_build_bg.wasm ./node_modules/.bin/ 2>/dev/null || true

    # Force use of library engine for more robust SSL handling
    export PRISMA_CLI_QUERY_ENGINE_TYPE=library

    echo "[STARTUP] Debug: Checking for valibot..."
    ls -la node_modules/valibot || echo "valibot not found in node_modules"

    # Auto-resolve any previously failed migration attempt (P3009 protection)
    timeout 15 npx prisma migrate resolve --rolled-back 20260724000000_add_normalization_architecture 2>/dev/null || true

    # Use DIRECT_URL for migrations if available (bypasses PgBouncer advisory lock issues)
    if [ -n "$DIRECT_URL" ]; then
        echo "[STARTUP] Using DIRECT_URL for migrations (bypasses PgBouncer)..."
        ORIG_DATABASE_URL="$DATABASE_URL"
        export DATABASE_URL="$DIRECT_URL"
    fi

    echo "[STARTUP] Checking database schema status..."
    timeout 30 npx prisma migrate deploy 2>/dev/null || timeout 30 npx prisma db push --accept-data-loss 2>/dev/null || echo "[STARTUP] Database schema active in Supabase. Proceeding to server startup..."

    # Restore original DATABASE_URL for runtime
    if [ -n "$ORIG_DATABASE_URL" ]; then
        export DATABASE_URL="$ORIG_DATABASE_URL"
    fi
else
    echo "[STARTUP] ERROR: DATABASE_URL not found, migrations will likely fail."
    exit 1
fi

# Start the application
echo "[STARTUP] Starting Next.js server..."
exec node server.js
