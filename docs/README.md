# NexNum Documentation

Welcome to the technical documentation for **NexNum**, the Enterprise Virtual Number Platform.

## 📚 Core Documentation

### 🏗️ [Architecture](./architecture.md)
*High-level system design, database schema, and component interactions.*
- **System Layers**: Client, API, Business Logic, Data.
- **Data Flow**: Purchase, Fulfillment, and Sync engines.
- **Components**: Dynamic Provider Engine, Smart Routing, Activation State Machine.

### ☁️ [Deployment & Infrastructure](./deployment.md)
*Production runbook for the "Smart Startup Stack" (AWS EC2).*
- **Infrastructure**: VPS Specification, Network, Security Groups.
- **Workflow**: GitOps Lite (SSH-based deployment).
- **SSL**: Zero-config HTTPS with Caddy.

### 🔌 [API Reference](./api-reference.md)
*Developer guide for integrating with NexNum.*
- **Authentication**: JWT & API Keys.
- **Endpoints**: Numbers, Wallet, Webhooks.
- **OpenAPI**: Live spec generation.

### 🔒 [Security](./security.md)
*Security architecture and best practices.*
- **Audit**: Immutable financial logging.
- **Secrets**: Environment variable management.
- **Compliance**: Rate limiting and fraud prevention.

### ⚙️ [Operations](./operations.md)
*Runbooks for maintaining the system.*
- **Monitoring**: Prometheus & Grafana.
- **Troubleshooting**: Common issues and resolutions.
- **Performance**: Tuning Guide.

### 📝 [Configuration Reference](./env-reference.md)
*Full list of environment variables and their purpose.*

---

## Quick Links
- [Project Readme](../README.md)
- [Issue Tracker](../.github/ISSUE_TEMPLATE)
