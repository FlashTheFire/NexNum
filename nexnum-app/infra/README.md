# NexNum Infrastructure Scripts

This directory contains the consolidated management scripts for both local development and production servers.

## 📁 Core Scripts

- **[server.sh](./server.sh)**: The primary production management tool. Use this for AWS/VPS deployments.
  - `setup`: Installs Docker, configures Swap, tunes kernel for production.
  - `deploy`: One-command rollout of the entire application.
  - `backup / restore`: Database and volume management.
- **[local.sh](./local.sh)**: Lightweight bootstrapper for local developers.
  - `up`: Starts Redis, Meilisearch, and Worker containers.
  - `down`: Stops all local containers.
  - `clean`: Wipes volumes and restarts for a fresh state.

---

## 🚀 Production Quick Start

```bash
cd nexnum-app
sudo ./infra/server.sh setup
./infra/server.sh deploy
```

For more details, see the [Deployment Runbook](../docs/deployment.md).
