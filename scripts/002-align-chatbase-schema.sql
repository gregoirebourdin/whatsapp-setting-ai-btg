-- Migration: Align database schema with Chatbase API field names
-- This ensures perfect synchronization between local DB and Chatbase

-- ============================================
-- STEP 1: Update CONVERSATIONS table
-- Chatbase "Contact" = Our "Conversation" (1 WhatsApp contact = 1 conversation)
-- ============================================

-- Add Chatbase contact ID (returned when creating/getting contacts)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS chatbase_contact_id TEXT UNIQUE;

-- Add Chatbase conversation ID (returned when getting conversations)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS chatbase_conversation_id TEXT UNIQUE;

-- Rename wa_id to external_id (Chatbase field name)
-- We keep wa_id as an alias for backward compatibility
ALTER TABLE conversations 
RENAME COLUMN wa_id TO external_id;

-- Rename profile_name to name (Chatbase field name)
ALTER TABLE conversations 
RENAME COLUMN profile_name TO name;

-- Add email field (Chatbase contact field)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Add phonenumber field (Chatbase uses this exact name, no underscore)
-- This will store the WhatsApp number in E.164 format (+1234567890)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS phonenumber TEXT;

-- Add source field (Chatbase conversation field)
-- Values: API, WhatsApp, Messenger, Instagram, Slack, Playground, Widget, Iframe
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'WhatsApp';

-- Add stripe_accounts field (Chatbase contact field)
-- Structure: [{"label": "main", "stripe_id": "cus_xxx", "stripe_email": "email@example.com"}]
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS stripe_accounts JSONB DEFAULT '[]'::jsonb;

-- Add custom_attributes field (Chatbase contact field)
-- Structure: {"key1": "value1", "key2": "value2"}
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS custom_attributes JSONB DEFAULT '{}'::jsonb;

-- Add sync tracking fields
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending' 
CHECK (sync_status IN ('pending', 'synced', 'error'));

-- ============================================
-- STEP 2: Update MESSAGES table
-- Align with Chatbase message structure
-- ============================================

-- Add Chatbase message ID
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS chatbase_message_id TEXT UNIQUE;

-- Rename direction to role (Chatbase field name)
-- 'inbound' -> 'user', 'outbound' -> 'assistant'
ALTER TABLE messages 
RENAME COLUMN direction TO role;

-- Update role values to match Chatbase
UPDATE messages SET role = 'user' WHERE role = 'inbound';
UPDATE messages SET role = 'assistant' WHERE role = 'outbound';

-- Update check constraint for role
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_direction_check;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check 
CHECK (role IN ('user', 'assistant'));

-- Rename message_type to type (Chatbase field name)
ALTER TABLE messages 
RENAME COLUMN message_type TO type;

-- ============================================
-- STEP 3: Update INDEXES
-- ============================================

-- Index for Chatbase IDs (for sync lookups)
CREATE INDEX IF NOT EXISTS idx_conversations_chatbase_contact_id 
ON conversations(chatbase_contact_id);

CREATE INDEX IF NOT EXISTS idx_conversations_chatbase_conversation_id 
ON conversations(chatbase_conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversations_external_id 
ON conversations(external_id);

CREATE INDEX IF NOT EXISTS idx_messages_chatbase_message_id 
ON messages(chatbase_message_id);

CREATE INDEX IF NOT EXISTS idx_conversations_sync_status 
ON conversations(sync_status);

-- Drop old index if exists
DROP INDEX IF EXISTS idx_conversations_wa_id;

-- ============================================
-- STEP 4: Migrate existing data
-- ============================================

-- Populate phonenumber from external_id (WhatsApp ID is the phone number)
UPDATE conversations 
SET phonenumber = '+' || external_id 
WHERE phonenumber IS NULL AND external_id IS NOT NULL;

-- ============================================
-- STEP 5: Add config keys for Chatbase sync
-- ============================================

INSERT INTO config (key, value) VALUES
  ('chatbase_sync_enabled', 'true'),
  ('chatbase_sync_interval_seconds', '300')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- REFERENCE: Chatbase API Field Mapping
-- ============================================
-- 
-- CONTACTS API (https://www.chatbase.co/api/v1/chatbots/{chatbotId}/contacts):
-- +-----------------------+---------------------------+
-- | Chatbase Field        | Our Field                 |
-- +-----------------------+---------------------------+
-- | id                    | chatbase_contact_id       |
-- | external_id           | external_id               |
-- | name                  | name                      |
-- | email                 | email                     |
-- | phonenumber           | phonenumber               |
-- | stripe_accounts       | stripe_accounts (JSONB)   |
-- | custom_attributes     | custom_attributes (JSONB) |
-- | created_at            | created_at (converted)    |
-- | updated_at            | updated_at (converted)    |
-- +-----------------------+---------------------------+
--
-- CONVERSATIONS API (https://www.chatbase.co/api/v1/get-conversations):
-- +-----------------------+---------------------------+
-- | Chatbase Field        | Our Field                 |
-- +-----------------------+---------------------------+
-- | id                    | chatbase_conversation_id  |
-- | chatbot_id            | (from config)             |
-- | source                | source                    |
-- | created_at            | created_at                |
-- | updated_at            | updated_at                |
-- | messages              | (separate table)          |
-- +-----------------------+---------------------------+
--
-- MESSAGES (inside conversations):
-- +-----------------------+---------------------------+
-- | Chatbase Field        | Our Field                 |
-- +-----------------------+---------------------------+
-- | id                    | chatbase_message_id       |
-- | role                  | role                      |
-- | content               | content                   |
-- | type                  | type                      |
-- +-----------------------+---------------------------+
