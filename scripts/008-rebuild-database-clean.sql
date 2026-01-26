-- =============================================
-- CLEAN DATABASE REBUILD
-- Only what we need for WhatsApp + Chatbase integration
-- =============================================

-- Drop all existing tables (clean slate)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS scheduled_jobs CASCADE;
DROP TABLE IF EXISTS event_logs CASCADE;
DROP TABLE IF EXISTS config CASCADE;
DROP TABLE IF EXISTS wa_id_mappings CASCADE;

-- =============================================
-- 1. CONFIG TABLE
-- Stores API credentials and settings
-- =============================================
CREATE TABLE config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config keys (user will fill values)
INSERT INTO config (key, value) VALUES 
  ('chatbase_api_key', ''),
  ('chatbase_chatbot_id', ''),
  ('whatsapp_token', ''),
  ('whatsapp_phone_number_id', ''),
  ('whatsapp_verify_token', ''),
  ('send_mode', 'text'),
  ('template_name', ''),
  ('template_language', 'en'),
  ('debounce_ms', '3000')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- 2. WA_ID_MAPPINGS TABLE
-- Links WhatsApp users to Chatbase conversations
-- This is the ONLY local data we store about conversations
-- =============================================
CREATE TABLE wa_id_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id TEXT UNIQUE NOT NULL,                    -- WhatsApp phone number (e.g., "33612345678")
  chatbase_conversation_id TEXT,                 -- Chatbase conversation ID for history continuity
  chatbase_contact_id TEXT,                      -- Chatbase contact ID
  name TEXT,                                     -- Cached name for display
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wa_id_mappings_wa_id ON wa_id_mappings(wa_id);
CREATE INDEX idx_wa_id_mappings_chatbase_conv ON wa_id_mappings(chatbase_conversation_id);

-- =============================================
-- 3. SCHEDULED_JOBS TABLE
-- Job queue for debounced message processing
-- =============================================
CREATE TABLE scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id TEXT NOT NULL,                           -- WhatsApp ID to process
  status TEXT NOT NULL DEFAULT 'pending',        -- pending, processing, completed, failed
  scheduled_for TIMESTAMPTZ NOT NULL,            -- When to process (for debounce)
  attempts INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduled_jobs_status ON scheduled_jobs(status);
CREATE INDEX idx_scheduled_jobs_scheduled_for ON scheduled_jobs(scheduled_for);
CREATE INDEX idx_scheduled_jobs_wa_id ON scheduled_jobs(wa_id);

-- =============================================
-- 4. EVENT_LOGS TABLE
-- For debugging and monitoring
-- =============================================
CREATE TABLE event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  wa_id TEXT,
  job_id UUID,
  payload JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_logs_type ON event_logs(event_type);
CREATE INDEX idx_event_logs_wa_id ON event_logs(wa_id);
CREATE INDEX idx_event_logs_created ON event_logs(created_at DESC);

-- =============================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_id_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (for server-side operations)
-- Config table - read/write for service role only
CREATE POLICY "Service role full access to config" ON config
  FOR ALL USING (auth.role() = 'service_role');

-- WA ID Mappings - service role full access
CREATE POLICY "Service role full access to wa_id_mappings" ON wa_id_mappings
  FOR ALL USING (auth.role() = 'service_role');

-- Scheduled Jobs - service role full access  
CREATE POLICY "Service role full access to scheduled_jobs" ON scheduled_jobs
  FOR ALL USING (auth.role() = 'service_role');

-- Event Logs - service role full access
CREATE POLICY "Service role full access to event_logs" ON event_logs
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- DONE! Database is now clean and minimal
-- =============================================
