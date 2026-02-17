import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// GET: Get campaign details with recipient-level status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Fetch campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('bulk_campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 });
  }

  // Fetch recipients with contact details
  const { data: recipients, error: recipientsError } = await supabase
    .from('bulk_campaign_recipients')
    .select(`
      id,
      status,
      error,
      sent_at,
      created_at,
      contact_id,
      crm_contacts (
        id,
        firstname,
        phone
      )
    `)
    .eq('campaign_id', id)
    .order('created_at', { ascending: true });

  if (recipientsError) {
    return NextResponse.json({ error: recipientsError.message }, { status: 500 });
  }

  return NextResponse.json({
    campaign,
    recipients: (recipients || []).map((r) => ({
      id: r.id,
      status: r.status,
      error: r.error,
      sent_at: r.sent_at,
      contact: r.crm_contacts,
    })),
  });
}
