module.exports = {
    apps: [
        {
            name: 'nexnum-app',
            script: 'npm',
            args: 'start',
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
                // Internal Scheduler runs automatically in production
                NEXT_RUNTIME: 'nodejs'
            },
            instances: 1, // Start with 1 instance strictly for stateful worker safety
            autorestart: true,
            watch: false,
            max_memory_restart: '1G'
        }
    ]
}
