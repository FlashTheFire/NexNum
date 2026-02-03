---
description: how to start the full NexNum environment (Hybrid Mode)
---

This workflow starts the infrastructure (Redis, Meilisearch) and the background worker, while allowing the user to run the Next.js app on their local machine for the fastest HMR.

// turbo-all
1.  Navigate to the `nexnum-app` directory.
2.  Start local infrastructure: `./infra/local.sh up`
3.  Start the Next.js frontend: `npm run dev`
4.  Open [http://localhost:3000](http://localhost:3000)

---
*For production-like tests, use `./infra/server.sh deploy` (Linux/WSL only).*
:all

### What this does:
1. **Infra (Docker)**: Launches Redis, MeiliSearch, Grafana, Prometheus, Alertmanager, Workers, and Socket Server in the background.
2. **App (Terminal)**: Launches the Next.js development server in your current terminal window with Turbopack.

### Verification URLs:
| Service | URL |
| :--- | :--- |
| **Main App** | [http://localhost:3000](http://localhost:3000) |
| **Grafana** | [http://localhost:3100](http://localhost:3100) |
| **Redis Insight** | [http://localhost:5540](http://localhost:5540) |

### Troubleshooting:
- If containers fail to start, run `npm run infra:down` first to clear state.
- Ensure Docker Desktop is running before executing the command.
