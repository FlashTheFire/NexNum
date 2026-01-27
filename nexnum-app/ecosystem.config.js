module.exports = {
    apps: [
        {
            name: "nexnum-web",
            script: "npm",
            args: "run start",
            env: {
                NODE_ENV: "production",
                PORT: 3001,
                NEXT_DISABLE_INTERNAL_WORKERS: "true"
            },
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            exp_backoff_restart_delay: 100
        },
        {
            name: "nexnum-socket",
            script: "npm",
            args: "run services:socket",
            env: {
                NODE_ENV: "production"
            },
            instances: 1,
            autorestart: true,
            watch: false
        },
        {
            name: "nexnum-worker",
            script: "npm",
            args: "run services:worker",
            env: {
                NODE_ENV: "production"
            },
            instances: 1,
            autorestart: true,
            watch: false
        }
    ]
};
