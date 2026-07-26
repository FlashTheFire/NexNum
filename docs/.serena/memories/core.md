# NexNum app source map
- Next.js app routes live under `src/app`; shared domain services under `src/lib`; workers/scripts under `src/workers` and `src/scripts`.
- Prisma schema/migrations live under `prisma`; operational deployment/configuration is in root `Dockerfile*`, `docker-compose.yml`, `infra/`, and `DEPLOYMENT_GUIDE.md`.
- Orders domain spans PurchaseOrder, Number, Activation, wallet ledger, and SMS models; lifecycle changes must preserve financial idempotency and provider/local consistency.
- Read `mem:tech_stack` for pinned runtime/tooling, `mem:suggested_commands` for Windows-safe commands, `mem:conventions` for code patterns, and `mem:task_completion` for validation gates.