import { defineConfig } from '@prisma/config';

export default defineConfig({
    datasource: {
        url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL,
    },
});
