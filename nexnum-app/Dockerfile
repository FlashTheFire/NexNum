# ==============================================================================
# NexNum Main API Dockerfile (Optimized)
# Strategy: Debian Build (Stability) -> Debian Runner (Consistency)
# ==============================================================================

# Stage 1: Dependencies
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y openssl libssl-dev libc6-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install dependencies first (most stable layer — only busts on package.json change)
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --legacy-peer-deps

# Prisma generate AFTER npm ci (schema changes don't invalidate dep cache)
COPY prisma/schema.prisma prisma/schema.prisma
ARG DATABASE_URL
ARG DATABASE_URL_DIRECT
ENV DATABASE_URL=${DATABASE_URL}
ENV DATABASE_URL_DIRECT=${DATABASE_URL_DIRECT}
RUN npx prisma generate


# Stage 2: Builder
FROM deps AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV JWT_SECRET=placeholder_for_build_must_be_32_chars_long
ENV ENCRYPTION_KEY=placeholder_for_build_must_be_32_chars_long
ENV HOME=/tmp

COPY . .

# Build with persistent Next.js cache across Docker builds
RUN --mount=type=cache,target=/app/.next/cache npm run build:skip-types

# Prune dev dependencies — removes ~100MB of eslint, typescript, vitest, playwright, etc.
RUN --mount=type=cache,target=/root/.npm npm prune --omit=dev --legacy-peer-deps


# Stage 3: Runner (minimal production image)
FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PRISMA_CLIENT_ENGINE_TYPE=library

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --ingroup nodejs --home /home/nextjs nextjs
RUN mkdir -p /home/nextjs/.npm && chown -R nextjs:nodejs /home/nextjs

# Copy built artifacts from standalone build
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and config for migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Copy startup script that runs migrations then starts server
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/home/nextjs
ENV npm_config_cache=/home/nextjs/.npm

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["./docker-entrypoint.sh"]
