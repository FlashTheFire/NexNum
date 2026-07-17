#!/bin/sh
set -e

# Run database migrations with explicit error handling and local binary
echo "[STARTUP] Running Prisma migrations..."

# Ensure environment variables are exported for the migration process
if [ -f .env ] && [ -z "$DATABASE_URL" ]; then
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

    echo "[STARTUP] Debug: Checking for valibot..."
    ls -la node_modules/valibot || echo "valibot not found in node_modules"

    # Prefer DATABASE_URL_DIRECT for migrations (real Postgres, supports
    # prepared statements / advisory locks). Falls back to DATABASE_URL.
    # Override DATABASE_URL for the migration subprocess ONLY, then
    # restore the original (pooler) URL for the runtime server below.
    ORIGINAL_DATABASE_URL="$DATABASE_URL"
    MIGRATE_URL="${DATABASE_URL_DIRECT:-${DIRECT_URL:-${DATABASE_URL}}}"
    echo "[STARTUP] Migration URL host: $(echo "$MIGRATE_URL" | sed -E 's#.*@([^/]+)/.*#\1#')"
    export DATABASE_URL="$MIGRATE_URL"
    export DIRECT_URL="${DATABASE_URL_DIRECT:-${DIRECT_URL:-${DATABASE_URL}}}"

    echo "[STARTUP] Running: npx prisma migrate deploy"
    if ! npx prisma migrate deploy; then
        echo "[STARTUP] MIGRATION FAILED — refusing to start with stale schema."
        exit 1
    fi

    # Restore the runtime (pooler) URL so server.js connects through session mode.
    export DATABASE_URL="$ORIGINAL_DATABASE_URL"
else
    echo "[STARTUP] ERROR: DATABASE_URL not found, migrations will likely fail."
    exit 1
fi

# Start the application
echo "[STARTUP] Starting Next.js server..."
exec node server.js
