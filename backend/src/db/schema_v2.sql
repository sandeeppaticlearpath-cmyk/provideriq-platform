-- ============================================================
-- ProviderIQ - Schema Additions v2
-- Deep Scraping, Communications, Book of Business, Integrations
-- ============================================================

-- Add new columns to providers table
ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS linkedin_url       TEXT,
  ADD COLUMN IF NOT EXISTS doximity_url       TEXT,
  ADD COLUMN IF NOT EXISTS healthgrades_url   TEXT,
  ADD COLUMN IF NOT EXISTS vitals_url         TEXT,
  ADD COLUMN IF NOT EXISTS doctor_com_url     TEXT,
  ADD COLUMN IF NOT EXISTS license_numbers    JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ratings            JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS work_history       JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS google_description TEXT,
  ADD COLUMN IF NOT EXISTS accepted_insurance TEXT[],
  ADD COLUMN IF NOT EXISTS board_verified     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS npi_status         VARCHAR(20) DEFAULT 'active';

-- Add contact_flag to candidates
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS contact_flag VARCHAR(50),
  -- flags: active, prospects, not_responding, dormant, pending, booked, placed, on_hold, do_not_contact, warm_lead, hot_lead
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS doximity_url TEXT;

CREATE INDEX IF NOT EXISTS idx_candidates_flag ON candidates(contact_flag);

-- ─── ORG INTEGRATIONS TABLE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS org_integrations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider     VARCHAR(50) NOT NULL,
  -- providers: gmail, outlook, dialpad, 8x8, twilio, teams
  credentials  JSONB NOT NULL DEFAULT '{}',
  -- encrypted in production; stores access_token, api_key, etc.
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_tested  TIMESTAMPTZ,
  test_status  VARCHAR(50),
  metadata     JSONB DEFAULT '{}',
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_org ON org_integrations(org_id);

-- ─── DEEP SCRAPE RESULTS CACHE ────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_scrape_cache (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id  UUID REFERENCES providers(id),
  source       VARCHAR(100) NOT NULL,
  -- npi_registry, linkedin, doximity, healthgrades, medical_board_CA, abms, etc.
  url          TEXT,
  raw_data     JSONB NOT NULL DEFAULT '{}',
  confidence   DECIMAL(3,2),
  scraped_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  UNIQUE(provider_id, source)
);

CREATE INDEX IF NOT EXISTS idx_scrape_cache_provider ON provider_scrape_cache(provider_id);

-- ─── SCRAPE JOB QUEUE ─────────────────────────────────────────
-- Add new job types to scrape_jobs
-- job_type: npi_sync, deep_enrichment, license_check, linkedin_scrape, doximity_scrape

ALTER TABLE scrape_jobs
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS doximity_url TEXT,
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5;

-- ─── CANDIDATE INTERACTION LOG ────────────────────────────────
-- Extends activity_logs for detailed interaction tracking
CREATE TABLE IF NOT EXISTS candidate_interactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  interaction_type VARCHAR(50) NOT NULL,
  -- call, email, sms, teams, note, stage_change, flag_change
  channel         VARCHAR(50),
  direction       VARCHAR(10),
  summary         TEXT,
  notes           TEXT,
  flag_set        VARCHAR(50),
  duration_sec    INTEGER,
  outcome         VARCHAR(100),
  -- connected, left_voicemail, no_answer, replied, opened, interested, declined
  next_action     TEXT,
  next_action_date DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_candidate ON candidate_interactions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interactions_org_user ON candidate_interactions(org_id, user_id);

-- ─── EMAIL TRACKING ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_tracking (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comm_id       UUID REFERENCES communications(id) ON DELETE CASCADE,
  tracking_id   VARCHAR(100) UNIQUE NOT NULL,
  event_type    VARCHAR(50) NOT NULL,
  -- sent, opened, clicked, replied, bounced, unsubscribed
  event_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata      JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_email_tracking_comm ON email_tracking(comm_id);

-- ─── CALL NOTES ───────────────────────────────────────────────
-- Standalone call notes separate from candidate notes
CREATE TABLE IF NOT EXISTS call_notes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comm_id       UUID NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  summary       TEXT,
  notes         TEXT,
  call_outcome  VARCHAR(50),
  -- connected, voicemail, no_answer, callback_requested, interested, not_interested
  contact_flag  VARCHAR(50),
  follow_up_date DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BOOK OF BUSINESS SETTINGS ────────────────────────────────
CREATE TABLE IF NOT EXISTS bob_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  followup_reminder_days INTEGER DEFAULT 7,
  dormant_threshold_days INTEGER DEFAULT 30,
  stale_threshold_days   INTEGER DEFAULT 14,
  notification_prefs     JSONB DEFAULT '{"email": true, "inApp": true}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

-- ─── OUTREACH SEQUENCES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_sequences (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  specialty   VARCHAR(200),
  steps       JSONB NOT NULL DEFAULT '[]',
  -- [{day: 1, channel: 'email', subject: '', body: '', angle: ''}]
  is_active   BOOLEAN DEFAULT TRUE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── SEQUENCE ENROLLMENTS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id     UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enrolled_by     UUID REFERENCES users(id),
  current_step    INTEGER DEFAULT 0,
  status          VARCHAR(50) DEFAULT 'active',
  -- active, paused, completed, replied, unsubscribed
  enrolled_at     TIMESTAMPTZ DEFAULT NOW(),
  next_step_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  UNIQUE(sequence_id, candidate_id)
);

-- ─── UPDATED VIEWS ────────────────────────────────────────────
CREATE OR REPLACE VIEW candidate_overview AS
  SELECT
    c.*,
    u.first_name as assignee_first, u.last_name as assignee_last,
    p.npi, p.linkedin_url as provider_linkedin, p.doximity_url as provider_doximity,
    p.board_certifications, p.hospital_affiliations, p.data_quality_score,
    COUNT(DISTINCT cn.id) as total_notes,
    COUNT(DISTINCT comm.id) as total_comms,
    COUNT(DISTINCT s.id) as total_submissions,
    MAX(comm.created_at) as last_comm_at
  FROM candidates c
  LEFT JOIN users u ON u.id = c.assigned_to
  LEFT JOIN providers p ON p.id = c.provider_id
  LEFT JOIN candidate_notes cn ON cn.candidate_id = c.id
  LEFT JOIN communications comm ON comm.candidate_id = c.id AND comm.org_id = c.org_id
  LEFT JOIN submissions s ON s.candidate_id = c.id AND s.org_id = c.org_id
  GROUP BY c.id, u.first_name, u.last_name, p.npi, p.linkedin_url, p.doximity_url,
           p.board_certifications, p.hospital_affiliations, p.data_quality_score;
