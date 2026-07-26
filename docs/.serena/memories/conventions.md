# Conventions
- TypeScript/TSX source uses single quotes, no semicolons, and 4-space indentation in inspected order routes.
- API handlers authenticate with `getCurrentUser(request.headers)` and return `NextResponse.json` status payloads.
- Prisma access is through shared `prisma` from `@/lib/core/db`; money is Prisma Decimal and must not use floating-point arithmetic internally.
- Order/lifecycle transitions must be conditional/idempotent under concurrency; avoid stale pre-transaction reads for destructive or financial updates.
- Preserve existing route response shapes unless intentionally versioning an API; validate query/body input with project schemas/Zod where available.