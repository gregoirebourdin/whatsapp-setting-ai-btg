-- =============================================
-- CRM TABLES FOR BULK DM
-- Contacts management + Bulk campaigns tracking
-- =============================================

-- 1. CRM_CONTACTS TABLE
-- Stores contacts imported via CSV or added manually
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firstname TEXT NOT NULL,
  phone TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  opted_in BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_phone ON crm_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_created ON crm_contacts(created_at DESC);

-- 2. BULK_CAMPAIGNS TABLE
-- Tracks bulk DM campaigns
CREATE TABLE IF NOT EXISTS bulk_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_language TEXT DEFAULT 'fr',
  status TEXT NOT NULL DEFAULT 'draft', -- draft, sending, completed, failed
  total_recipients INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_status ON bulk_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_bulk_campaigns_created ON bulk_campaigns(created_at DESC);

-- 3. BULK_CAMPAIGN_RECIPIENTS TABLE
-- Tracks individual recipient status within a campaign
CREATE TABLE IF NOT EXISTS bulk_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES bulk_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bcr_campaign ON bulk_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_bcr_contact ON bulk_campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_bcr_status ON bulk_campaign_recipients(status);

-- RLS Policies
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to crm_contacts" ON crm_contacts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to bulk_campaigns" ON bulk_campaigns
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to bulk_campaign_recipients" ON bulk_campaign_recipients
  FOR ALL USING (auth.role() = 'service_role');
