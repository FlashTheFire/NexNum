import "dotenv/config";
import { defineConfig, env } from '@prisma/config';

export default defineConfig({
    // Prisma 7: the schema datasource block no longer accepts url/directUrl.
    // All migration + introspection URLs live here. The runtime PrismaClient
    // gets its connection through the pg driver-adapter (PrismaPg) so it
    // ignores this URL — but the Prisma CLI uses it for `migrate deploy` etc.
    //
    // Use the Supabase **session-mode pooler** (port 5432, IPv4) for
    // migrations. The direct host db.<ref>.supabase.co:5432 is IPv6-only
    // on the free tier and unreachable from IPv4-only networks (like AWS
    // EC2 without the IPv4 add-on). The session-mode pooler supports
    // DDL transactions and prepared statements are not used because
    // `?pgbouncer=true` in the URL signals the Prisma client to switch
    // them off at the protocol level.
    //
    // The runtime pg.Pool in src/lib/core/db.ts still uses DATABASE_URL
    // (also the session-mode pooler) via the driver adapter.
    datasource: {
        url: env("DATABASE_URL") + (env("DATABASE_URL").includes("pgbouncer=true") ? "" : "?pgbouncer=true"),
        // shadowDatabaseUrl is only required for `prisma migrate dev`.
        // Optional for `migrate deploy` / `migrate reset` in production.
        shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
    },
    schema: "prisma/schema.prisma",
});
