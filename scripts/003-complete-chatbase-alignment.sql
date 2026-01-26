-- Migration: Complete Chatbase alignment (safe - checks existing state)
-- This script completes any remaining migration steps

-- ============================================
-- STEP 1: Complete MESSAGES table updates
-- ============================================

-- Update role values if they still have old values
UPDATE messages SET role = 'user' WHERE role = 'inbound';
UPDATE messages SET role = 'assistant' WHERE role = 'outbound';

-- Drop old constraint if exists and add new one
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_direction_check;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_role_check 
CHECK (role IN ('user', 'assistant'));

-- Rename message_type to type if not already done
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'message_type'
  ) THEN
    ALTER TABLE messages RENAME COLUMN message_type TO type;
  END IF;
END $$;

-- ============================================
-- STEP 2: Complete CONVERSATIONS table updates
-- ============================================

-- Rename wa_id to external_id if not already done
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'wa_id'
  ) THEN
    ALTER TABLE conversations RENAME COLUMN wa_id TO external_id;
  END IF;
END $$;

-- Rename profile_name to name if not already done
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'profile_name'
  ) THEN
    ALTER TABLE conversations RENAME COLUMN profile_name TO name;
  END IF;
END $$;

-- ============================================
-- STEP 3: Ensure all new columns exist
-- ============================================

-- Add Chatbase IDs
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chatbase_contact_id TEXT UNIQUE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chatbase_conversation_id TEXT UNIQUE;

-- Add contact fields
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS phonenumber TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'WhatsApp';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS stripe_accounts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS custom_attributes JSONB DEFAULT '{}'::jsonb;

-- Add sync tracking
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Add sync_status with check constraint (handle if column exists without constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' AND column_name = 'sync_status'
  ) THEN
    ALTER TABLE conversations ADD COLUMN sync_status TEXT DEFAULT 'pending';
  END IF;
END $$;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_sync_status_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_sync_status_check 
CHECK (sync_status IN ('pending', 'synced', 'error'));

-- Add Chatbase message ID
ALTER TABLE messages ADD COLUMN IF NOT EXISTS chatbase_message_id TEXT UNIQUE;

-- ============================================
-- STEP 4: Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_conversations_chatbase_contact_id ON conversations(chatbase_contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_chatbase_conversation_id ON conversations(chatbase_conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_external_id ON conversations(external_id);
CREATE INDEX IF NOT EXISTS idx_messages_chatbase_message_id ON messages(chatbase_message_id);
CREATE INDEX IF NOT EXISTS idx_conversations_sync_status ON conversations(sync_status);

-- Drop old indexes
DROP INDEX IF EXISTS idx_conversations_wa_id;

-- ============================================
-- STEP 5: Migrate data
-- ============================================

-- Populate phonenumber from external_id
UPDATE conversations 
SET phonenumber = '+' || external_id 
WHERE phonenumber IS NULL AND external_id IS NOT NULL;

-- ============================================
-- STEP 6: Add config keys
-- ============================================

INSERT INTO config (key, value) VALUES
  ('chatbase_sync_enabled', 'true'),
  ('chatbase_sync_interval_seconds', '300')
ON CONFLICT (key) DO NOTHING;

-- Done!
SELECT 'Migration complete: Database aligned with Chatbase API' as status;
