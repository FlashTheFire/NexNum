# Production Seed Scripts

Idempotent scripts for initializing production data. All scripts use `upsert` patterns to be safely re-runnable.

## Usage

```bash
# Run all seeds (recommended for new deployments)
npx tsx scripts/seeds/run-all.ts

# Run individual seeds
npx tsx scripts/seeds/seed-currencies.ts
npx tsx scripts/seeds/seed-providers.ts
npx tsx scripts/seeds/seed-system-settings.ts
```

## Scripts

| Script | Purpose | Idempotent |
|--------|---------|------------|
| `seed-currencies.ts` | Initial currency data (USD, EUR, INR, RUB) | ✅ |
| `seed-providers.ts` | Provider configurations | ✅ |
| `seed-system-settings.ts` | Default system settings | ✅ |
| `run-all.ts` | Execute all seeds in order | ✅ |

## Adding New Seeds

1. Create `seed-[name].ts` in this directory
2. Use `prisma.model.upsert()` for idempotency
3. Add to `run-all.ts` execution list
4. Document in this README

## Important Notes

- **Production Safety**: All seeds use `upsert` - existing data is preserved
- **Order Matters**: Run `run-all.ts` for correct dependency order
- **Logging**: All operations are logged for audit trail
