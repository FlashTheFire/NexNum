# Contributing to NexNum

Thank you for your interest in contributing to NexNum!

## Development Setup

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Git

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/nexnum.git
cd nexnum/nexnum-app

# Copy environment file
cp .env.example .env

# Start infrastructure (Redis, MeiliSearch)
docker-compose up -d

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run development server
npm run dev
```

## Code Standards

### TypeScript
- Use TypeScript strict mode
- No `any` types (use `unknown` if needed)
- Export types alongside functions

### Styling
- Use Prettier for formatting
- Follow ESLint rules
- Use CSS modules or Tailwind classes

### Commits
- Follow [Conventional Commits](https://www.conventionalcommits.org/)
- Format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
```
feat(auth): add two-factor authentication
fix(wallet): correct balance calculation
docs(readme): update setup instructions
```

## Pull Request Process

1. **Create a feature branch** from `develop`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes** with tests

3. **Ensure CI passes**:
   ```bash
   npm run lint
   npx tsc --noEmit
   npm test
   ```

4. **Push and create PR** against `develop`

5. **Address review feedback**

6. **Squash and merge** when approved

## Project Structure

```
src/
├── app/           # Next.js pages & API routes
├── components/    # React components
├── config/        # Configuration (centralized)
├── lib/           # Core business logic
│   ├── auth/      # Authentication
│   ├── wallet/    # Wallet operations
│   ├── sms/       # SMS handling
│   └── workers/   # Background workers
├── hooks/         # React hooks
└── types/         # TypeScript types
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test
npm test -- path/to/test.ts
```

## Need Help?

- Check existing issues and PRs
- Read the docs in `/docs`
- Open a new issue for bugs or features

---

Thank you for contributing! 🎉
