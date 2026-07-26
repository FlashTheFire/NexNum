# Completion gates
- For application changes run, from `nexnum-app`: `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
- For orders/financial changes additionally run focused unit/integration/concurrency tests covering duplicate purchase/refund/cancel, cancellation-vs-completion/reconciliation, provider success with local failure, and idempotent replay.
- Inspect `git diff` and confirm no secrets or generated artifacts changed. If schema changes are made, create/validate the Prisma migration and run relevant database tests.