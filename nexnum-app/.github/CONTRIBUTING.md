# Contributing to NexNum

We love contributions! This project is an enterprise-grade platform, so we maintain high standards for code quality, security, and documentation.

## 🚀 Getting Started

1.  **Fork** the repository and clone it locally.
2.  **Install** dependencies: `npm install`.
3.  **Setup** environment: `cp .env.example .env` and fill in required keys.
4.  **Local Dev**: `npm run dev` (Turbopack).

## 🛠️ Project Standards

### 📝 Code Quality
- **TypeScript**: No `any`. Use interfaces and Zod schemas for all external data.
- **Logging**: Use the centralized `logger` (Pino) instead of `console.log`.
- **Error Handling**: Use `ResponseFactory` for API responses to ensure standardized envelopes.

### 🧪 Testing
- All core logic in `src/lib` should have unit tests.
- Run `npm run typecheck` before pushing.

### 🏠 Infrastructure
If you are contributing to our infrastructure (`infra/` folder):
- **Portability**: Ensure scripts work on Ubuntu 22.04.
- **Security**: Never expose Redis or Postgres ports to the public internet.

## 🤝 Pull Request Process

1.  Create a fresh branch for your feature/fix.
2.  Use the [PR Template](./pull_request_template.md).
3.  **Verify the Build**: Ensure `npm run build` passes locally on your machine.
4.  Submit the PR and wait for review from @FlashTheFire.

## 🔒 Security
If you find a security bug, please **do not** open an issue. Follow the instructions in [SECURITY.md](./SECURITY.md).

---
*Thank you for making NexNum better!*
