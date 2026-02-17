import { NextResponse } from 'next/server';
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

// GET: Fetch all approved message templates from WhatsApp Business API
export async function GET() {
  const accessToken = await getConfig('whatsapp_access_token');
  const phoneNumberId = await getConfig('whatsapp_phone_number_id');

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json(
      { error: 'WhatsApp credentials not configured. Go to Configuration tab to set them up.' },
      { status: 400 }
    );
  }

  try {
    // First, get the WABA ID from the phone number
    const phoneRes = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}?fields=wabaId,verified_name`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    let wabaId: string | null = null;

    if (phoneRes.ok) {
      const phoneData = await phoneRes.json();
      // Try to get WABA ID from phone number endpoint
      if (phoneData.wabaId) {
        wabaId = phoneData.wabaId;
      }
    }

    // If we couldn't get WABA ID directly, try the business account endpoint
    if (!wabaId) {
      const businessRes = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/owner?fields=id`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (businessRes.ok) {
        const businessData = await businessRes.json();
        wabaId = businessData.id;
      }
    }

    // Try fetching templates using the WABA ID if we have it
    if (wabaId) {
      const templatesRes = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=100`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (templatesRes.ok) {
        const templatesData = await templatesRes.json();
        return NextResponse.json({
          templates: (templatesData.data || []).map((t: Record<string, unknown>) => ({
            name: t.name,
            status: t.status,
            language: t.language,
            category: t.category,
            components: t.components,
          })),
          wabaId,
        });
      }
    }

    // Fallback: try fetching with phone_number_id directly (some setups)
    const directRes = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/message_templates?fields=name,status,language,category,components&limit=100`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (directRes.ok) {
      const directData = await directRes.json();
      return NextResponse.json({
        templates: (directData.data || []).map((t: Record<string, unknown>) => ({
          name: t.name,
          status: t.status,
          language: t.language,
          category: t.category,
          components: t.components,
        })),
      });
    }

    // If nothing works, return error with debug info
    const errorData = await directRes.json().catch(() => ({}));
    return NextResponse.json(
      {
        error: 'Could not fetch templates. Please check your WhatsApp Business Account ID.',
        debug: { wabaId, phoneNumberId, errorData },
        templates: [],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Templates] Fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error', templates: [] },
      { status: 500 }
    );
  }
}
