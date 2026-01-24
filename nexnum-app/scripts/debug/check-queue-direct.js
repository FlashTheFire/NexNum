
const { Client } = require('pg');
require('dotenv').config();

async function checkSchema() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });
    try {
        await client.connect();
        const res = await client.query(`
            SELECT schemaname, tablename 
            FROM pg_catalog.pg_tables 
            WHERE schemaname = 'pgboss'
        `);
        console.log('PG-BOSS Tables:', JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await client.end();
    }
}

checkSchema();
