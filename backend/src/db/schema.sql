-- ============================================================
-- ProviderIQ - Production Database Schema
-- PostgreSQL with multi-tenant isolation
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- ORGANIZATIONS (Tenants)
-- ============================================================
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  domain          VARCHAR(255),
  plan            VARCHAR(50) NOT NULL DEFAULT 'starter', -- starter, growth, enterprise
  status          VARCHAR(50) NOT NULL DEFAULT 'active',
  logo_url        TEXT,
  settings        JSONB NOT NULL DEFAULT '{}',
  seats_limit     INTEGER NOT NULL DEFAULT 5,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_status ON organizations(status);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  password_hash   TEXT NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  role            VARCHAR(50) NOT NULL DEFAULT 'RECRUITER',
  -- roles: SUPER_ADMIN, ORG_ADMIN, MANAGER, RECRUITER, SOURCER
  avatar_url      TEXT,
  phone           VARCHAR(50),
  title           VARCHAR(150),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  preferences     JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, email)
);

CREATE UNIQUE INDEX idx_users_email_org ON users(email, org_id);
CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ============================================================
-- GLOBAL PROVIDER DATABASE (NPI Registry)
-- ============================================================
CREATE TABLE providers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  npi                   VARCHAR(20) UNIQUE NOT NULL,
  first_name            VARCHAR(100),
  last_name             VARCHAR(100) NOT NULL,
  middle_name           VARCHAR(100),
  credential            VARCHAR(100),     -- MD, DO, NP, PA, etc.
  gender                VARCHAR(10),
  specialty             VARCHAR(200),
  taxonomy_code         VARCHAR(50),
  taxonomy_description  TEXT,
  practice_name         VARCHAR(255),
  address_line1         VARCHAR(255),
  address_line2         VARCHAR(255),
  city                  VARCHAR(100),
  state                 CHAR(2),
  zip                   VARCHAR(20),
  phone                 VARCHAR(50),
  fax                   VARCHAR(50),
  email                 VARCHAR(255),
  website               TEXT,
  hospital_affiliations TEXT[],
  education             JSONB DEFAULT '[]',    -- [{school, degree, year}]
  residency             JSONB DEFAULT '[]',    -- [{program, specialty, year}]
  fellowship            JSONB DEFAULT '[]',
  board_certifications  TEXT[],
  languages             TEXT[],
  accepting_patients    BOOLEAN,
  npi_status            VARCHAR(20) DEFAULT 'active',
  enumeration_date      DATE,
  last_update_date      DATE,
  -- Enrichment metadata
  enriched_at           TIMESTAMPTZ,
  enrichment_sources    TEXT[],
  data_quality_score    DECIMAL(3,2) DEFAULT 0,
  raw_npi_data          JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_providers_npi ON providers(npi);
CREATE INDEX idx_providers_state ON providers(state);
CREATE INDEX idx_providers_specialty ON providers(specialty);
CREATE INDEX idx_providers_name ON providers USING gin(to_tsvector('english', first_name || ' ' || last_name));
CREATE INDEX idx_providers_full_text ON providers USING gin(
  to_tsvector('english', 
    coalesce(first_name,'') || ' ' || 
    coalesce(last_name,'') || ' ' || 
    coalesce(specialty,'') || ' ' || 
    coalesce(city,'') || ' ' || 
    coalesce(state,'')
  )
);

-- ============================================================
-- PROVIDER LICENSES
-- ============================================================
CREATE TABLE provider_licenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id     UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  state           CHAR(2) NOT NULL,
  license_number  VARCHAR(100),
  license_type    VARCHAR(100),
  status          VARCHAR(50),
  issued_date     DATE,
  expiration_date DATE,
  verified_at     TIMESTAMPTZ,
  source_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_licenses_provider ON provider_licenses(provider_id);
CREATE INDEX idx_licenses_state ON provider_licenses(state);
CREATE INDEX idx_licenses_status ON provider_licenses(status);

-- ============================================================
-- CANDIDATES (Per-org wrapper around global providers)
-- ============================================================
CREATE TABLE candidates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id       UUID REFERENCES providers(id),  -- link to global DB
  -- Overrides / org-specific data
  first_name        VARCHAR(100),
  last_name         VARCHAR(100),
  email             VARCHAR(255),
  phone             VARCHAR(50),
  specialty         VARCHAR(200),
  credential        VARCHAR(100),
  state             CHAR(2),
  city              VARCHAR(100),
  pipeline_stage    VARCHAR(50) NOT NULL DEFAULT 'sourced',
  -- stages: sourced, contacted, interested, submitted, interview, offer, placed
  source            VARCHAR(100),   -- npi_registry, manual, referral, job_board
  assigned_to       UUID REFERENCES users(id),
  tags              TEXT[],
  resume_url        TEXT,
  linkedin_url      TEXT,
  availability_date DATE,
  desired_salary    DECIMAL(12,2),
  salary_type       VARCHAR(20),    -- annual, hourly
  willing_to_relocate BOOLEAN DEFAULT FALSE,
  notes_count       INTEGER DEFAULT 0,
  activity_count    INTEGER DEFAULT 0,
  last_contacted_at TIMESTAMPTZ,
  do_not_contact    BOOLEAN DEFAULT FALSE,
  custom_fields     JSONB DEFAULT '{}',
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, provider_id)
);

CREATE INDEX idx_candidates_org ON candidates(org_id);
CREATE INDEX idx_candidates_provider ON candidates(provider_id);
CREATE INDEX idx_candidates_stage ON candidates(pipeline_stage);
CREATE INDEX idx_candidates_assigned ON candidates(assigned_to);
CREATE INDEX idx_candidates_specialty ON candidates(specialty);

-- ============================================================
-- CANDIDATE NOTES
-- ============================================================
CREATE TABLE candidate_notes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id  UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES users(id),
  content       TEXT NOT NULL,
  note_type     VARCHAR(50) DEFAULT 'general', -- general, call, email, interview, system
  is_pinned     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_candidate ON candidate_notes(candidate_id);
CREATE INDEX idx_notes_org ON candidate_notes(org_id);

-- ============================================================
-- JOBS
-- ============================================================
CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  requirements      TEXT,
  specialty         VARCHAR(200),
  job_type          VARCHAR(50),     -- permanent, locum, contract, per_diem
  location_city     VARCHAR(100),
  location_state    CHAR(2),
  is_remote         BOOLEAN DEFAULT FALSE,
  facility_name     VARCHAR(255),
  facility_type     VARCHAR(100),    -- hospital, clinic, private_practice
  salary_min        DECIMAL(12,2),
  salary_max        DECIMAL(12,2),
  salary_type       VARCHAR(20),
  start_date        DATE,
  status            VARCHAR(50) NOT NULL DEFAULT 'open', -- draft, open, filled, closed, on_hold
  priority          VARCHAR(20) DEFAULT 'normal',        -- low, normal, high, urgent
  owner_id          UUID REFERENCES users(id),
  client_name       VARCHAR(255),
  client_contact    VARCHAR(255),
  external_id       VARCHAR(100),
  tags              TEXT[],
  custom_fields     JSONB DEFAULT '{}',
  submissions_count INTEGER DEFAULT 0,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_org ON jobs(org_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_specialty ON jobs(specialty);
CREATE INDEX idx_jobs_owner ON jobs(owner_id);

-- ============================================================
-- SUBMISSIONS
-- ============================================================
CREATE TABLE submissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  submitted_by    UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- statuses: pending, review, interview_scheduled, interview_complete, offer_extended, offer_accepted, rejected, withdrawn
  ai_match_score  DECIMAL(4,2),
  notes           TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  interview_date  TIMESTAMPTZ,
  offer_date      TIMESTAMPTZ,
  placement_date  TIMESTAMPTZ,
  placement_fee   DECIMAL(12,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, candidate_id, job_id)
);

CREATE INDEX idx_submissions_org ON submissions(org_id);
CREATE INDEX idx_submissions_candidate ON submissions(candidate_id);
CREATE INDEX idx_submissions_job ON submissions(job_id);
CREATE INDEX idx_submissions_status ON submissions(status);

-- ============================================================
-- ACTIVITY LOGS (Audit + Recruiter Activity)
-- ============================================================
CREATE TABLE activity_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),
  entity_type     VARCHAR(50) NOT NULL,    -- candidate, job, submission, provider
  entity_id       UUID,
  action          VARCHAR(100) NOT NULL,   -- created, updated, stage_changed, email_sent, call_logged
  description     TEXT,
  metadata        JSONB DEFAULT '{}',
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_org ON activity_logs(org_id);
CREATE INDEX idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_created ON activity_logs(created_at DESC);

-- ============================================================
-- COMMUNICATIONS
-- ============================================================
CREATE TABLE communications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id    UUID REFERENCES candidates(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  channel         VARCHAR(50) NOT NULL,  -- email, sms, call, teams
  direction       VARCHAR(10) NOT NULL,  -- inbound, outbound
  subject         TEXT,
  body            TEXT,
  status          VARCHAR(50) DEFAULT 'sent', -- draft, sent, delivered, failed, replied
  external_id     TEXT,     -- ID from telephony/email provider
  duration_sec    INTEGER,  -- for calls
  recording_url   TEXT,
  opened_at       TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comms_org ON communications(org_id);
CREATE INDEX idx_comms_candidate ON communications(candidate_id);
CREATE INDEX idx_comms_user ON communications(user_id);

-- ============================================================
-- EMAIL SEQUENCES (Outreach Automation)
-- ============================================================
CREATE TABLE email_sequences (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  steps       JSONB NOT NULL DEFAULT '[]',
  is_active   BOOLEAN DEFAULT TRUE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SCRAPING JOBS (Worker Queue Tracking)
-- ============================================================
CREATE TABLE scrape_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type        VARCHAR(100) NOT NULL,  -- npi_sync, enrichment, license_check
  status          VARCHAR(50) DEFAULT 'pending',
  provider_npi    VARCHAR(20),
  payload         JSONB DEFAULT '{}',
  result          JSONB,
  error           TEXT,
  attempts        INTEGER DEFAULT 0,
  max_attempts    INTEGER DEFAULT 3,
  scheduled_at    TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX idx_scrape_jobs_type ON scrape_jobs(job_type);
CREATE INDEX idx_scrape_jobs_scheduled ON scrape_jobs(scheduled_at);

-- ============================================================
-- AI GENERATED CONTENT CACHE
-- ============================================================
CREATE TABLE ai_generations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  generation_type VARCHAR(100) NOT NULL,  -- outreach_email, followup, summary, match_score
  entity_type     VARCHAR(50),
  entity_id       UUID,
  prompt_tokens   INTEGER,
  completion_tokens INTEGER,
  model           VARCHAR(100),
  output          TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_gen_org ON ai_generations(org_id);
CREATE INDEX idx_ai_gen_entity ON ai_generations(entity_type, entity_id);

-- ============================================================
-- ANALYTICS SNAPSHOTS (Pre-computed for dashboard speed)
-- ============================================================
CREATE TABLE analytics_snapshots (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  period      VARCHAR(20) NOT NULL, -- daily, weekly, monthly
  metrics     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, snapshot_date, period)
);

CREATE INDEX idx_analytics_org_date ON analytics_snapshots(org_id, snapshot_date DESC);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'organizations','users','providers','candidates','candidate_notes',
    'jobs','submissions','communications','email_sequences'
  ])
  LOOP
    EXECUTE format('
      CREATE TRIGGER trg_%s_updated_at
      BEFORE UPDATE ON %s
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', t, t);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Increment candidate notes_count
CREATE OR REPLACE FUNCTION update_candidate_notes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE candidates SET notes_count = notes_count + 1 WHERE id = NEW.candidate_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE candidates SET notes_count = GREATEST(notes_count - 1, 0) WHERE id = OLD.candidate_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notes_count
AFTER INSERT OR DELETE ON candidate_notes
FOR EACH ROW EXECUTE FUNCTION update_candidate_notes_count();

-- Increment submissions count on jobs
CREATE OR REPLACE FUNCTION update_job_submissions_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE jobs SET submissions_count = submissions_count + 1 WHERE id = NEW.job_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE jobs SET submissions_count = GREATEST(submissions_count - 1, 0) WHERE id = OLD.job_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_submissions_count
AFTER INSERT OR DELETE ON submissions
FOR EACH ROW EXECUTE FUNCTION update_job_submissions_count();

-- Row Level Security (RLS) for tenant isolation
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO organizations (name, slug, plan, seats_limit) VALUES
  ('Demo Staffing Agency', 'demo-agency', 'enterprise', 50),
  ('Precision Medical Staffing', 'precision-medical', 'growth', 20);

-- Super admin user (password: Admin123!)
INSERT INTO users (org_id, email, password_hash, first_name, last_name, role)
SELECT 
  id, 
  'admin@provideriq.com',
  crypt('Admin123!', gen_salt('bf', 12)),
  'System',
  'Admin',
  'SUPER_ADMIN'
FROM organizations WHERE slug = 'demo-agency';
