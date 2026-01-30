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
# Generate Prisma Client here to ensure WASM engines are correctly resolved in context

RUN DATABASE_URL=postgres://localhost:5432/placeholder npx prisma generate


# Stage 2: Builder (Debian for reliability)
FROM deps AS builder
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .


# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgres://localhost:5432/placeholder \
    JWT_SECRET=placeholder_for_build_must_be_32_chars_long \
    ENCRYPTION_KEY=placeholder_for_build_must_be_32_chars_long \
    npm run build
# Prune for production
RUN --mount=type=cache,target=/root/.npm npm prune --omit=dev



# Stage 3: Runner (Debian for reliability and binary consistency)
FROM node:22-bookworm-slim AS runner
RUN apt-get update && apt-get install -y openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built artifacts from standalone build
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
