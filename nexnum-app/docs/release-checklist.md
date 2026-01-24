# Release Checklist

Use this checklist before each production release.

## Pre-Release

### Code Quality
- [ ] All tests passing (`npm test`)
- [ ] Type check passes (`npx tsc --noEmit`)
- [ ] Lint passes (`npm run lint`)
- [ ] No console.log statements in production code
- [ ] No TODO/FIXME in critical paths

### Security
- [ ] Dependency audit clean (`npm audit`)
- [ ] Secrets not in codebase
- [ ] Environment-specific configs separated
- [ ] API keys rotated if compromised

### Database
- [ ] Migrations reviewed and tested
- [ ] Rollback migration prepared
- [ ] Backup completed before deployment

### Documentation
- [ ] CHANGELOG.md updated
- [ ] README updated if needed
- [ ] API docs updated for new endpoints
- [ ] Env reference updated for new vars

## Deployment

### Pre-Deploy
- [ ] Version bumped in package.json
- [ ] Git tag created
- [ ] Docker image builds successfully
- [ ] Environment variables set in production

### Deploy
- [ ] Deploy to staging first
- [ ] Run smoke tests on staging
- [ ] Monitor for errors (15 min)
- [ ] Deploy to production

### Post-Deploy
- [ ] Verify health endpoints
- [ ] Check error tracking (Sentry)
- [ ] Monitor performance metrics
- [ ] Validate critical user flows

## Rollback

If issues detected:

1. **Immediate**: Revert to previous Docker image
2. **Database**: Run rollback migration if needed
3. **Notify**: Inform team of rollback
4. **Investigate**: Document root cause

## Smoke Tests

### Critical Flows
- [ ] User can register
- [ ] User can login
- [ ] User can purchase number
- [ ] SMS received successfully
- [ ] Wallet balance updates
- [ ] Admin dashboard loads

### API
- [ ] `/api/health` returns 200
- [ ] `/api/health/ready` returns 200
- [ ] Authentication works

## Sign-Off

| Role | Name | Date | ✓ |
|------|------|------|---|
| Developer | | | |
| Reviewer | | | |
| QA | | | |
| DevOps | | | |
