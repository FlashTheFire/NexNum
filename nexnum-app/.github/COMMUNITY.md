# NexNum Community & Security Policy

Welcome to the NexNum community! This document outlines our standards for security reporting and technical contributions.

---

## 🛡️ Security Policy

NexNum takes security seriously. If you discover a vulnerability, please report it through the proper channels.

### Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

### Reporting a Vulnerability

**Do not open a GitHub Issue for security vulnerabilities.**

Please report any security concerns directly to the maintainers:
- **Maintainer**: @FlashTheFire
- **Email**: security@nexnum.com

You can expect an initial response within **24-48 hours**. We follow a 90-day responsible disclosure timeline.

---

## 🤝 Contributing to NexNum

We love contributions! This project is an enterprise-grade platform, so we maintain high standards for code quality, security, and documentation.

### 🚀 Getting Started

1.  **Fork** the repository and clone it locally.
2.  **Install** dependencies: `npm install`.
3.  **Setup** environment: `cp .env.example .env` and fill in required keys.
4.  **Local Dev**: Use `./infra/local.sh up` to start infrastructure, then `npm run dev`.

### 🛠️ Project Standards

- **TypeScript**: No `any`. Use interfaces and Zod schemas for all external data.
- **Logging**: Use the centralized `logger` (Pino) instead of `console.log`.
- **Infrastructure**: Ensure scripts work on Ubuntu 22.04 and follow the `server.sh` pattern.

### 🏠 Pull Request Process

1.  Create a fresh branch for your feature/fix.
2.  Use the [PR Template](./pull_request_template.md).
3.  **Verify the Build**: Ensure `npm run build` passes locally.
4.  Submit the PR for review.

---
*Thank you for making NexNum better!*
