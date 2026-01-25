# Changelog

All notable changes to NexNum will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Centralized configuration system (`src/config/`)
- Zod schema validation for environment variables
- GitHub Actions CI/CD pipeline
- CONTRIBUTING.md and CODEOWNERS files
- Production guard for mock SMS provider

### Changed
- Reorganized scripts into `db/`, `debug/`, `security/`, `sync/`, `utils/`
- Workers now use central config (`LimitsConfig`, `TimeoutsConfig`, `WorkersConfig`)
- Updated `.env.example` with 47+ configuration variables

### Removed
- Root-level debug scripts (moved to `scripts/debug/`)
- Stale log and build artifact files

### Fixed
- Import paths for relocated scripts
- OfferDocument type mismatch with `operatorDisplayName`
- Missing `@types/uuid` package

---

## [0.1.0] - 2026-01-24

### Added
- Initial release of NexNum SMS activation platform
- Multi-provider SMS integration (5sim, HeroSMS, GrizzlySMS, SMSBower, OnlineSim)
- Real-time SMS polling and notifications
- Wallet system with transaction history
- Admin dashboard with provider management
- MeiliSearch integration for fast search
- i18n support (9 languages)
- Push notifications via Web Push API
- Two-factor authentication
- Rate limiting and security hardening
