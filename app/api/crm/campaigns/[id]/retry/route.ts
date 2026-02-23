import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST: Retry sending to pending/failed recipients of a campaign
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Fetch campaign info
  const { data: campaign, error: campaignError } = await supabase
    .from('bulk_campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 });
  }

  // Optionally filter by statuses from request body
  let body: { statuses?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    // Default: retry pending and failed
  }
  const retryStatuses = body.statuses || ['pending', 'failed'];

  // Fetch recipients that need retry with their contact info
  const { data: recipients, error: recipientsError } = await supabase
    .from('bulk_campaign_recipients')
    .select(`
      id,
      status,
      contact_id,
      crm_contacts (
        id,
        firstname,
        phone,
        opted_in
      )
    `)
    .eq('campaign_id', id)
    .in('status', retryStatuses);

  if (recipientsError) {
    return NextResponse.json({ error: recipientsError.message }, { status: 500 });
  }

  if (!recipients || recipients.length === 0) {
    return NextResponse.json({ error: 'Aucun destinataire a relancer' }, { status: 400 });
  }

  // Filter only opted-in contacts that still exist
  const validRecipients = recipients.filter(
    (r) => r.crm_contacts && (r.crm_contacts as { opted_in: boolean }).opted_in
  );

  if (validRecipients.length === 0) {
    return NextResponse.json({ error: 'Aucun destinataire valide (opt-in actif) a relancer' }, { status: 400 });
  }

  // Update campaign status to sending
  await supabase
    .from('bulk_campaigns')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', id);

  // Build template components from the original campaign
  const templateName = campaign.template_name;
  const templateLanguage = campaign.template_language || 'fr';

  let sentCount = campaign.sent_count || 0;
  let failedCount = 0;
  let retriedCount = 0;

  for (let i = 0; i < validRecipients.length; i++) {
    const recipient = validRecipients[i];
    const contact = recipient.crm_contacts as { id: string; firstname: string; phone: string; opted_in: boolean };

    // Build basic components with firstname replacement
    const components = [
      {
        type: 'body',
        parameters: [{ type: 'text', text: contact.firstname }],
      },
    ];

    const sendResult = await sendWhatsAppMessage({
      to: contact.phone,
      message: '',
      useTemplate: true,
      templateName,
      templateLanguage,
      templateComponents: components,
    });

    if (sendResult.success) {
      sentCount++;
      retriedCount++;

      await supabase
        .from('bulk_campaign_recipients')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
        .eq('id', recipient.id);
    } else {
      failedCount++;
      const errorMsg = sendResult.error || 'Erreur inconnue';

      await supabase
        .from('bulk_campaign_recipients')
        .update({ status: 'failed', error: errorMsg })
        .eq('id', recipient.id);
    }

    // Rate limit
    if (i < validRecipients.length - 1) {
      await delay(150);
    }
  }

  // Update campaign final counts
  const totalFailed = (campaign.failed_count || 0) - retriedCount + failedCount;
  await supabase
    .from('bulk_campaigns')
    .update({
      status: totalFailed === validRecipients.length ? 'failed' : 'completed',
      sent_count: sentCount,
      failed_count: Math.max(0, totalFailed),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return NextResponse.json({
    success: true,
    retried: validRecipients.length,
    sent: retriedCount,
    failed: failedCount,
  });
}
