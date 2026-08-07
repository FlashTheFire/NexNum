# ==============================================================================
# NexNum Main API Dockerfile (Monorepo Root)
# ==============================================================================

# Stage 1: Dependencies
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y openssl libssl-dev libc6-dev ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY nexnum-app/package*.json ./
RUN --mount=type=cache,target=/root/.npm NODE_ENV=development npm ci --legacy-peer-deps --timeout=600000 --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY nexnum-app/prisma/schema.prisma prisma/schema.prisma
COPY nexnum-app/prisma.config.ts ./prisma.config.ts
ARG DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
ARG DATABASE_URL_DIRECT="postgresql://postgres:postgres@localhost:5432/postgres"
ENV DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres@localhost:5432/postgres"}
ENV DATABASE_URL_DIRECT=${DATABASE_URL_DIRECT:-"postgresql://postgres:postgres@localhost:5432/postgres"}
RUN npx prisma generate


# Stage 2: Builder
FROM deps AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=2560"
ENV JWT_SECRET=placeholder_for_build_must_be_32_chars_long
ENV ENCRYPTION_KEY=placeholder_for_build_must_be_32_chars_long
ENV HOME=/tmp

COPY nexnum-app .

RUN --mount=type=cache,target=/app/.next/cache npm run build:skip-types
RUN --mount=type=cache,target=/root/.npm npm prune --omit=dev --legacy-peer-deps --prefer-offline --no-audit


# Stage 3: Runner (minimal production image)
FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PRISMA_CLIENT_ENGINE_TYPE=library

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --ingroup nodejs --home /home/nextjs nextjs
RUN mkdir -p /home/nextjs/.npm && chown -R nextjs:nodejs /home/nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN sed -i 's/\r//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/home/nextjs
ENV npm_config_cache=/home/nextjs/.npm

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/bin/bash", "./docker-entrypoint.sh"]
