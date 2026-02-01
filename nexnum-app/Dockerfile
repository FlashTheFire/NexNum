# ==============================================================================
# NexNum Main API Dockerfile (Senior Engineering Hardened)
# Strategy: Debian Build (Stability) -> Alpine Runner (Efficiency)
# ==============================================================================

# Stage 1: Dependencies (Debian for reliability)
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y openssl libssl-dev libc6-dev ca-certificates
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci --legacy-peer-deps

# Generate Prisma client with placeholder for build-time validation
ENV DATABASE_URL="postgresql://localhost:5432/placeholder"
ENV DATABASE_URL_DIRECT="postgresql://localhost:5432/placeholder"
RUN npx prisma generate


# Stage 2: Builder (Debian for reliability)
FROM deps AS builder
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV JWT_SECRET=placeholder_for_build_must_be_32_chars_long
ENV ENCRYPTION_KEY=placeholder_for_build_must_be_32_chars_long
ENV HOME=/tmp
RUN npm run build:skip-types

# Prune for production
RUN --mount=type=cache,target=/root/.npm HOME=/tmp npm prune --omit=dev



# Stage 3: Runner (Debian for reliability and binary consistency)
FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --ingroup nodejs --home /home/nextjs nextjs

# Create home directory and npm cache for nextjs user
RUN mkdir -p /home/nextjs/.npm && chown -R nextjs:nodejs /home/nextjs

# Copy built artifacts from standalone build
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma client and schema for migrations
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy startup script that runs migrations then starts server
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/home/nextjs
ENV npm_config_cache=/home/nextjs/.npm

CMD ["./docker-entrypoint.sh"]
