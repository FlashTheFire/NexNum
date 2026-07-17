import "dotenv/config";
import { defineConfig, env } from '@prisma/config';

export default defineConfig({
    // Prisma 7: the schema datasource block no longer accepts url/directUrl.
    // All migration + introspection URLs live here. The runtime PrismaClient
    // gets its connection through the pg driver-adapter (PrismaPg) so it
    // ignores this URL — but the Prisma CLI uses it for `migrate deploy` etc.
    //
    // Use the *direct* connection (port 5432) for migrations so Prisma can run
    // DDL safely. The runtime pg.Pool in src/lib/core/db.ts still uses
    // DATABASE_URL (the session-mode pooler) via the driver adapter.
    datasource: {
        url: env("DATABASE_URL_DIRECT") || env("DIRECT_URL") || env("DATABASE_URL"),
        // shadowDatabaseUrl is only required for `prisma migrate dev`.
        // Optional for `migrate deploy` / `migrate reset` in production.
        shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
    },
    schema: "prisma/schema.prisma",
});
