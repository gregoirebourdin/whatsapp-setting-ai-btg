-- Create a simple mapping table between WhatsApp IDs and Chatbase IDs
-- This is all we need locally - the rest comes from Chatbase API

CREATE TABLE IF NOT EXISTS wa_id_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id TEXT NOT NULL UNIQUE,  -- WhatsApp phone number (external_id)
  chatbase_conversation_id TEXT,  -- Chatbase conversation ID
  chatbase_contact_id TEXT,  -- Chatbase contact ID
  name TEXT,  -- Cached name for quick display
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_wa_id_mappings_wa_id ON wa_id_mappings(wa_id);
CREATE INDEX IF NOT EXISTS idx_wa_id_mappings_chatbase_conv ON wa_id_mappings(chatbase_conversation_id);

-- Comment
COMMENT ON TABLE wa_id_mappings IS 'Minimal mapping between WhatsApp IDs and Chatbase IDs. All other data is fetched from Chatbase API.';
