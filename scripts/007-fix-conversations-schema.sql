-- Fix conversations table schema to match Chatbase field names
-- This script safely renames columns only if they have the old names

-- Step 1: Rename wa_id to external_id (if wa_id exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'wa_id') THEN
    ALTER TABLE conversations RENAME COLUMN wa_id TO external_id;
    RAISE NOTICE 'Renamed wa_id to external_id';
  ELSE
    RAISE NOTICE 'Column wa_id does not exist, skipping rename';
  END IF;
END $$;

-- Step 2: Rename profile_name to name (if profile_name exists)  
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'profile_name') THEN
    ALTER TABLE conversations RENAME COLUMN profile_name TO name;
    RAISE NOTICE 'Renamed profile_name to name';
  ELSE
    RAISE NOTICE 'Column profile_name does not exist, skipping rename';
  END IF;
END $$;

-- Step 3: Add missing columns if they don't exist
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chatbase_contact_id TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chatbase_conversation_id TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS phonenumber TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'WhatsApp';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS stripe_accounts JSONB DEFAULT '[]'::jsonb;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS custom_attributes JSONB DEFAULT '{}'::jsonb;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_conversations_external_id ON conversations(external_id);
CREATE INDEX IF NOT EXISTS idx_conversations_chatbase_contact_id ON conversations(chatbase_contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_chatbase_conversation_id ON conversations(chatbase_conversation_id);

-- Step 5: Populate phonenumber from external_id if empty
UPDATE conversations 
SET phonenumber = '+' || external_id 
WHERE phonenumber IS NULL AND external_id IS NOT NULL;

-- Show final schema
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'conversations'
ORDER BY ordinal_position;
