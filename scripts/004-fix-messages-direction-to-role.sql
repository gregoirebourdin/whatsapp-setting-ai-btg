-- Migration: Fix messages table - replace direction with role
-- The previous migration didn't complete properly
-- This script safely converts direction to role with proper values

-- Step 1: Add role column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'messages' AND column_name = 'role') THEN
        ALTER TABLE messages ADD COLUMN role TEXT;
    END IF;
END $$;

-- Step 2: Populate role from direction if direction exists and has data
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'messages' AND column_name = 'direction') THEN
        -- Convert direction values to role values
        UPDATE messages SET role = 'user' WHERE direction = 'inbound' AND (role IS NULL OR role = '');
        UPDATE messages SET role = 'assistant' WHERE direction = 'outbound' AND (role IS NULL OR role = '');
        -- Set default for any remaining
        UPDATE messages SET role = 'user' WHERE role IS NULL OR role = '';
    END IF;
END $$;

-- Step 3: Make role NOT NULL with default
ALTER TABLE messages ALTER COLUMN role SET DEFAULT 'user';
UPDATE messages SET role = 'user' WHERE role IS NULL;
ALTER TABLE messages ALTER COLUMN role SET NOT NULL;

-- Step 4: Drop the old direction column if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'messages' AND column_name = 'direction') THEN
        ALTER TABLE messages DROP COLUMN direction;
    END IF;
END $$;

-- Step 5: Add type column if it doesn't exist (was message_type)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'messages' AND column_name = 'type') THEN
        ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text';
    END IF;
END $$;

-- Step 6: Migrate message_type to type if message_type exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'messages' AND column_name = 'message_type') THEN
        UPDATE messages SET type = message_type WHERE type IS NULL OR type = '';
        ALTER TABLE messages DROP COLUMN message_type;
    END IF;
END $$;

-- Step 7: Ensure type has default and not null
UPDATE messages SET type = 'text' WHERE type IS NULL;
ALTER TABLE messages ALTER COLUMN type SET DEFAULT 'text';
ALTER TABLE messages ALTER COLUMN type SET NOT NULL;

-- Step 8: Add chatbase_message_id if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'messages' AND column_name = 'chatbase_message_id') THEN
        ALTER TABLE messages ADD COLUMN chatbase_message_id TEXT;
    END IF;
END $$;

-- Step 9: Create index on chatbase_message_id
CREATE INDEX IF NOT EXISTS idx_messages_chatbase_message_id ON messages(chatbase_message_id);

-- Verify the schema
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'messages' 
ORDER BY ordinal_position;
