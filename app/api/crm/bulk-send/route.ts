import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

// Delay between each message to respect WhatsApp rate limits
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { contactIds, templateName, templateLanguage, templateComponents, campaignName } = body;

  if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: 'contactIds array is required' }, { status: 400 });
  }

  if (!templateName) {
    return NextResponse.json({ error: 'templateName is required' }, { status: 400 });
  }

  // Fetch ALL selected contacts in batches (Supabase .in() has limits for large lists)
  interface CrmContact {
    id: string;
    firstname: string;
    phone: string;
    opted_in: boolean;
    tags: string[];
    notes: string | null;
  }
  const BATCH_SIZE = 200;
  const allContacts: CrmContact[] = [];
  let contactsError: string | null = null;

  for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
    const batchIds = contactIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('crm_contacts')
      .select('*')
      .in('id', batchIds);

    if (error) {
      contactsError = error.message;
      break;
    }
    if (data) allContacts.push(...(data as CrmContact[]));
  }

  if (contactsError) {
    return NextResponse.json({ error: contactsError }, { status: 500 });
  }

  if (allContacts.length === 0) {
    return NextResponse.json({ error: 'Aucun contact trouve avec ces IDs' }, { status: 400 });
  }

  // Separate opted-in from opted-out for clear reporting
  const optedInContacts = allContacts.filter((c) => c.opted_in);
  const optedOutContacts = allContacts.filter((c) => !c.opted_in);

  if (optedInContacts.length === 0) {
    return NextResponse.json(
      {
        error: `Aucun contact n'a le opt-in actif. ${optedOutContacts.length} contact(s) ont le opt-in desactive.`,
      },
      { status: 400 }
    );
  }

  // Create the campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('bulk_campaigns')
    .insert({
      name: campaignName || `Campagne ${new Date().toLocaleDateString('fr-FR')}`,
      template_name: templateName,
      template_language: templateLanguage || 'fr',
      status: 'sending',
      total_recipients: optedInContacts.length,
    })
    .select()
    .single();

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }

  // Create recipient entries for opted-in contacts only
  const recipients = optedInContacts.map((contact) => ({
    campaign_id: campaign.id,
    contact_id: contact.id,
    status: 'pending' as const,
  }));

  const { error: recipientInsertError } = await supabase
    .from('bulk_campaign_recipients')
    .insert(recipients);

  if (recipientInsertError) {
    console.error('[BulkSend] Failed to insert recipients:', recipientInsertError);
  }

  // Send messages with rate limiting using the shared sendWhatsAppMessage function
  let sentCount = 0;
  let failedCount = 0;
  const results: Array<{ contactId: string; phone: string; firstname: string; status: string; error?: string }> = [];

  for (let i = 0; i < optedInContacts.length; i++) {
    const contact = optedInContacts[i];
    // Build template components, replacing {{firstname}} with actual name
    const components = templateComponents
      ? JSON.parse(JSON.stringify(templateComponents)).map(
          (comp: { type: string; parameters?: Array<{ type: string; text?: string }> }) => {
            if (comp.parameters) {
              comp.parameters = comp.parameters.map(
                (param: { type: string; text?: string }) => {
                  if (param.text === '{{firstname}}') {
                    return { ...param, text: contact.firstname };
                  }
                  return param;
                }
              );
            }
            return comp;
          }
        )
      : [];

    const sendResult = await sendWhatsAppMessage({
      to: contact.phone,
      message: '', // Not used for template messages
      useTemplate: true,
      templateName,
      templateLanguage: templateLanguage || 'fr',
      templateComponents: components.length > 0 ? components : undefined,
    });

    if (sendResult.success) {
      sentCount++;
      results.push({
        contactId: contact.id,
        phone: contact.phone,
        firstname: contact.firstname,
        status: 'sent',
      });

      // Update recipient status
      await supabase
        .from('bulk_campaign_recipients')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('campaign_id', campaign.id)
        .eq('contact_id', contact.id);
    } else {
      failedCount++;
      const errorMsg = sendResult.error || 'Erreur inconnue';
      results.push({
        contactId: contact.id,
        phone: contact.phone,
        firstname: contact.firstname,
        status: 'failed',
        error: errorMsg,
      });

      await supabase
        .from('bulk_campaign_recipients')
        .update({ status: 'failed', error: errorMsg })
        .eq('campaign_id', campaign.id)
        .eq('contact_id', contact.id);
    }

    // Rate limit: wait 150ms between messages (conservative, WhatsApp recommends not exceeding 80/sec)
    if (i < optedInContacts.length - 1) {
      await delay(150);
    }
  }

  // Update campaign final status
  await supabase
    .from('bulk_campaigns')
    .update({
      status: failedCount === optedInContacts.length ? 'failed' : 'completed',
      sent_count: sentCount,
      failed_count: failedCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  return NextResponse.json({
    success: true,
    campaignId: campaign.id,
    total: optedInContacts.length,
    sent: sentCount,
    failed: failedCount,
    skippedOptOut: optedOutContacts.length,
    results,
  });
}
