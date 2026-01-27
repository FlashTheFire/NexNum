---
description: How to start the full NexNum environment (Hybrid Mode)
---

# Unified Environment Startup

To initiate the entire NexNum ecosystem (Docker Infrastructure + Terminal Application) with a single command, use:

```powershell
npm run dev:all
```

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
