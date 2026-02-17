import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const WHATSAPP_API_VERSION = 'v18.0';

async function getConfig(key: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', key)
    .single();
  return data?.value || null;
}

// Delay between each message to respect WhatsApp rate limits
// WhatsApp Cloud API: 80 messages/second for business tier, but we'll be conservative
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

  const phoneNumberId = await getConfig('whatsapp_phone_number_id');
  const accessToken = await getConfig('whatsapp_access_token');

  if (!phoneNumberId || !accessToken) {
    return NextResponse.json(
      { error: 'WhatsApp credentials not configured' },
      { status: 400 }
    );
  }

  // Fetch the contacts
  const { data: contacts, error: contactsError } = await supabase
    .from('crm_contacts')
    .select('*')
    .in('id', contactIds)
    .eq('opted_in', true);

  if (contactsError) {
    return NextResponse.json({ error: contactsError.message }, { status: 500 });
  }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ error: 'No opted-in contacts found' }, { status: 400 });
  }

  // Create the campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('bulk_campaigns')
    .insert({
      name: campaignName || `Campaign ${new Date().toLocaleDateString('fr-FR')}`,
      template_name: templateName,
      template_language: templateLanguage || 'fr',
      status: 'sending',
      total_recipients: contacts.length,
    })
    .select()
    .single();

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }

  // Create recipient entries
  const recipients = contacts.map((contact) => ({
    campaign_id: campaign.id,
    contact_id: contact.id,
    status: 'pending',
  }));

  await supabase.from('bulk_campaign_recipients').insert(recipients);

  // Send messages with rate limiting
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
  let sentCount = 0;
  let failedCount = 0;
  const results: Array<{ contactId: string; phone: string; status: string; error?: string }> = [];

  for (const contact of contacts) {
    try {
      // Build template body, optionally replacing {{1}} with firstname
      const components = templateComponents
        ? JSON.parse(JSON.stringify(templateComponents)).map(
            (comp: { type: string; parameters?: Array<{ type: string; text?: string }> }) => {
              if (comp.parameters) {
                comp.parameters = comp.parameters.map((param) => {
                  if (param.text === '{{firstname}}') {
                    return { ...param, text: contact.firstname };
                  }
                  return param;
                });
              }
              return comp;
            }
          )
        : [];

      const messageBody = {
        messaging_product: 'whatsapp',
        to: contact.phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage || 'fr' },
          components,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageBody),
      });

      if (response.ok) {
        sentCount++;
        results.push({ contactId: contact.id, phone: contact.phone, status: 'sent' });

        // Update recipient status
        await supabase
          .from('bulk_campaign_recipients')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('campaign_id', campaign.id)
          .eq('contact_id', contact.id);
      } else {
        const errorData = await response.json().catch(() => ({}));
        failedCount++;
        const errorMsg = JSON.stringify(errorData);
        results.push({ contactId: contact.id, phone: contact.phone, status: 'failed', error: errorMsg });

        await supabase
          .from('bulk_campaign_recipients')
          .update({ status: 'failed', error: errorMsg })
          .eq('campaign_id', campaign.id)
          .eq('contact_id', contact.id);
      }
    } catch (err) {
      failedCount++;
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      results.push({ contactId: contact.id, phone: contact.phone, status: 'failed', error: errorMsg });

      await supabase
        .from('bulk_campaign_recipients')
        .update({ status: 'failed', error: errorMsg })
        .eq('campaign_id', campaign.id)
        .eq('contact_id', contact.id);
    }

    // Rate limit: wait 100ms between messages (conservative)
    await delay(100);
  }

  // Update campaign final status
  await supabase
    .from('bulk_campaigns')
    .update({
      status: failedCount === contacts.length ? 'failed' : 'completed',
      sent_count: sentCount,
      failed_count: failedCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  return NextResponse.json({
    success: true,
    campaignId: campaign.id,
    total: contacts.length,
    sent: sentCount,
    failed: failedCount,
    results,
  });
}
