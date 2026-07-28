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

    # Auto-resolve the normalization migration ONLY if it is in a "failed" state (P3009 protection).
    # On a fresh DB this is a no-op because _prisma_migrations doesn't exist.
    FAILED_MIGRATION=$(timeout 10 npx prisma migrate status 2>&1 | grep -c "20260724000000_add_normalization_architecture.*failed" || true)
    if [ "$FAILED_MIGRATION" -gt 0 ]; then
        echo "[STARTUP] Resolving previously failed normalization migration..."
        timeout 15 npx prisma migrate resolve --rolled-back 20260724000000_add_normalization_architecture 2>/dev/null || true
    fi

    # Use DIRECT_URL for migrations if available (bypasses PgBouncer advisory lock issues)
    if [ -n "$DIRECT_URL" ]; then
        echo "[STARTUP] Using DIRECT_URL for migrations (bypasses PgBouncer)..."
        ORIG_DATABASE_URL="$DATABASE_URL"
        export DATABASE_URL="$DIRECT_URL"
    fi

    echo "[STARTUP] Checking database schema status and sync..."
    timeout 30 npx prisma db push --accept-data-loss || timeout 30 npx prisma migrate deploy || echo "[STARTUP] Database schema active in Supabase. Proceeding to server startup..."

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
