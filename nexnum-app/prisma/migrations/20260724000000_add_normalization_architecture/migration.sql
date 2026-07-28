-- Create pg_trgm extension for fuzzy string matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- Canonical Services
-- ============================================================
CREATE TABLE "canonical_services" (
  id            SERIAL PRIMARY KEY,
  canonical_code VARCHAR(100) UNIQUE NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  display_name  VARCHAR(255),
  aliases       JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata      JSONB,
  is_verified   BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  provider_count INTEGER NOT NULL DEFAULT 0,
  offer_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cs_name ON canonical_services USING gin(to_tsvector('english', canonical_name));
CREATE INDEX idx_cs_aliases ON canonical_services USING gin(aliases);
CREATE INDEX idx_cs_is_verified_active ON canonical_services(is_verified, is_active);
CREATE INDEX idx_cs_name_trgm ON canonical_services USING gin(canonical_name gin_trgm_ops);

-- ============================================================
-- Canonical Countries
-- ============================================================
CREATE TABLE "canonical_countries" (
  id            SERIAL PRIMARY KEY,
  canonical_code CHAR(2) UNIQUE NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  display_name  JSONB NOT NULL DEFAULT '{}'::jsonb,
  aliases       JSONB NOT NULL DEFAULT '[]'::jsonb,
  flag_url      VARCHAR(500),
  region        VARCHAR(100),
  sub_region    VARCHAR(100),
  coordinates   JSONB,
  is_verified   BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  provider_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cc_name ON canonical_countries USING gin(to_tsvector('english', canonical_name));
CREATE INDEX idx_cc_aliases ON canonical_countries USING gin(aliases);
CREATE INDEX idx_cc_is_verified_active ON canonical_countries(is_verified, is_active);
CREATE INDEX idx_cc_name_trgm ON canonical_countries USING gin(canonical_name gin_trgm_ops);

-- ============================================================
-- MatchMethod enum (Prisma double-quoted + lowercase)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MatchMethod') THEN
    CREATE TYPE "MatchMethod" AS ENUM ('AUTO_ALIAS', 'AUTO_FUZZY', 'AUTO_NEW', 'MANUAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_method') THEN
    CREATE TYPE match_method AS ENUM ('AUTO_ALIAS', 'AUTO_FUZZY', 'AUTO_NEW', 'MANUAL');
  END IF;
END $$;

-- ============================================================
-- Provider Service Mappings
-- ============================================================
CREATE TABLE "provider_service_mappings" (
  id                  SERIAL PRIMARY KEY,
  provider_id         TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  provider_service_id TEXT NOT NULL REFERENCES provider_services(id) ON DELETE CASCADE,
  canonical_service_id INTEGER NOT NULL REFERENCES canonical_services(id) ON DELETE RESTRICT,
  confidence          FLOAT NOT NULL DEFAULT 0,
  match_method        "MatchMethod" NOT NULL DEFAULT 'AUTO_ALIAS',
  is_verified         BOOLEAN NOT NULL DEFAULT false,
  reviewed_by_id      TEXT REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, provider_service_id)
);

CREATE INDEX idx_psm_provider_canonical ON provider_service_mappings(provider_id, canonical_service_id);
CREATE INDEX idx_psm_confidence ON provider_service_mappings(confidence);
CREATE INDEX idx_psm_match_method ON provider_service_mappings(match_method);

-- ============================================================
-- ReviewEntityType & ReviewStatus enums
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewEntityType') THEN
    CREATE TYPE "ReviewEntityType" AS ENUM ('SERVICE', 'COUNTRY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_entity_type') THEN
    CREATE TYPE review_entity_type AS ENUM ('SERVICE', 'COUNTRY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewStatus') THEN
    CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CREATE_NEW');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_status') THEN
    CREATE TYPE review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CREATE_NEW');
  END IF;
END $$;

-- ============================================================
-- Mapping Review Queue
-- ============================================================
CREATE TABLE "mapping_review_queue" (
  id                      SERIAL PRIMARY KEY,
  entity_type             review_entity_type NOT NULL,
  provider_id             TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  raw_external_id         VARCHAR(100) NOT NULL,
  raw_name                VARCHAR(255) NOT NULL,
  raw_code                VARCHAR(100),
  candidate_matches       JSONB NOT NULL DEFAULT '[]'::jsonb,
  best_match_id           INTEGER,
  best_match_confidence   FLOAT,
  status                  review_status NOT NULL DEFAULT 'PENDING',
  resolved_by_id          TEXT REFERENCES users(id),
  resolved_at             TIMESTAMPTZ,
  priority                INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mrq_entity_status ON mapping_review_queue(entity_type, status);
CREATE INDEX idx_mrq_provider_status ON mapping_review_queue(provider_id, status);
CREATE INDEX idx_mrq_priority_created ON mapping_review_queue(priority DESC, created_at ASC);

-- ============================================================
-- Provider Country Mappings
-- ============================================================
CREATE TABLE "provider_country_mappings" (
  id                  SERIAL PRIMARY KEY,
  provider_id         TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  provider_country_id TEXT NOT NULL REFERENCES provider_countries(id) ON DELETE CASCADE,
  canonical_country_id INTEGER NOT NULL REFERENCES canonical_countries(id) ON DELETE RESTRICT,
  confidence          FLOAT NOT NULL DEFAULT 0,
  match_method        match_method NOT NULL DEFAULT 'AUTO_ALIAS',
  is_verified         BOOLEAN NOT NULL DEFAULT false,
  reviewed_by_id      TEXT REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_id, provider_country_id)
);

CREATE INDEX idx_pcm_provider_canonical ON provider_country_mappings(provider_id, canonical_country_id);
CREATE INDEX idx_pcm_confidence ON provider_country_mappings(confidence);
CREATE INDEX idx_pcm_match_method ON provider_country_mappings(match_method);
