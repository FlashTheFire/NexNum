# NexNum Documentation

Welcome to the NexNum SMS Activation Platform documentation.

## Quick Links

- [Architecture Overview](./architecture.md)
- [API Reference](./api-reference.md)
- [Security Audit](./security-audit.md)
- [Performance Guide](./performance-guide.md)
- [Environment Variables Reference](./env-reference.md)
- [Secret Manager Migration](./secret-manager-migration.md)
- [Deployment Guide](./deployment.md)
- [Release Checklist](./release-checklist.md)

## Overview

NexNum is an enterprise-grade SMS activation platform that aggregates multiple SMS providers to offer virtual phone numbers for service verification.

### Key Features

- **Multi-Provider Integration**: 5sim, HeroSMS, GrizzlySMS, SMSBower, OnlineSim
- **Real-time SMS Polling**: Background workers with adaptive polling
- **Wallet System**: Balance management with transaction history
- **Admin Dashboard**: Provider management, inventory, monitoring
- **Search**: MeiliSearch-powered instant search
- **Internationalization**: 9 languages supported

## Getting Started

```bash
# Clone and setup
git clone https://github.com/your-org/nexnum.git
cd nexnum/nexnum-app
cp .env.example .env

# Start infrastructure
docker-compose up -d

# Install and run
npm install
npm run dev
```

## Project Structure

```
nexnum-app/
├── src/
│   ├── app/              # Next.js app router
│   ├── components/       # React components
│   ├── config/           # Centralized configuration
│   ├── lib/              # Core business logic
│   └── workers/          # Background workers
├── prisma/               # Database schema
├── scripts/              # Utility scripts
├── docs/                 # Documentation
└── tests/                # Test files
```

## Support

For issues and feature requests, please use GitHub Issues.
