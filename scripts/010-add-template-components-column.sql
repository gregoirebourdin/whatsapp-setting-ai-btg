-- Add template_components column to bulk_campaigns
-- This stores the variable values used when sending the campaign
-- so they can be re-used when retrying pending/failed recipients
ALTER TABLE bulk_campaigns
  ADD COLUMN IF NOT EXISTS template_components JSONB DEFAULT NULL;
