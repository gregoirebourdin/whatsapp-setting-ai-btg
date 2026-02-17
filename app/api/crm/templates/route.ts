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

// Helper: Try multiple strategies to discover the WABA ID
async function discoverWabaId(
  phoneNumberId: string,
  accessToken: string
): Promise<string | null> {
  // Strategy 1: Check if stored in config
  const storedWabaId = await getConfig('whatsapp_business_account_id');
  if (storedWabaId) return storedWabaId;

  // Strategy 2: Get WABA ID from phone number's owner field
  try {
    const res = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}?fields=id,verified_name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      // The phone number endpoint doesn't return WABA ID directly,
      // but we can get it from the business endpoint
    }
  } catch {
    // Ignore, try next strategy
  }

  // Strategy 3: Search via the app's shared WABA accounts
  try {
    const res = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/?fields=id`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      // Try to get the owner
      const ownerRes = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/owner`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (ownerRes.ok) {
        const ownerData = await ownerRes.json();
        if (ownerData.id) {
          // Save discovered WABA ID for future use
          const supabase = createAdminClient();
          await supabase.from('config').upsert(
            { key: 'whatsapp_business_account_id', value: ownerData.id },
            { onConflict: 'key' }
          );
          return ownerData.id;
        }
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

// GET: Fetch all message templates from WhatsApp Business API
export async function GET() {
  const accessToken = await getConfig('whatsapp_access_token');
  const phoneNumberId = await getConfig('whatsapp_phone_number_id');

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json(
      {
        error: 'Identifiants WhatsApp non configures. Allez dans l\'onglet Configuration pour les renseigner.',
        templates: [],
      },
      { status: 200 }
    );
  }

  try {
    const wabaId = await discoverWabaId(phoneNumberId, accessToken);

    // Try fetching templates using WABA ID first (most reliable)
    if (wabaId) {
      const templatesRes = await fetch(
        `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=250`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (templatesRes.ok) {
        const templatesData = await templatesRes.json();
        const templates = (templatesData.data || []).map((t: Record<string, unknown>) => ({
          name: t.name,
          status: t.status,
          language: t.language,
          category: t.category,
          components: t.components || [],
        }));

        return NextResponse.json({ templates, wabaId });
      }

      // If WABA ID fetch failed, log the error for debugging
      const errorBody = await templatesRes.json().catch(() => ({}));
      console.error('[Templates] WABA ID fetch failed:', templatesRes.status, errorBody);
    }

    // Fallback: try fetching with phone_number_id directly (some API setups)
    const directRes = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/message_templates?fields=name,status,language,category,components&limit=250`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (directRes.ok) {
      const directData = await directRes.json();
      const templates = (directData.data || []).map((t: Record<string, unknown>) => ({
        name: t.name,
        status: t.status,
        language: t.language,
        category: t.category,
        components: t.components || [],
      }));

      return NextResponse.json({ templates });
    }

    // Nothing worked - provide a helpful error
    const errorData = await directRes.json().catch(() => ({}));
    const metaError = (errorData as Record<string, Record<string, string>>)?.error?.message || '';

    return NextResponse.json(
      {
        error: wabaId
          ? `Impossible de recuperer les templates (WABA ID: ${wabaId}). ${metaError}`
          : `Impossible de determiner votre WhatsApp Business Account ID. Ajoutez la cle "whatsapp_business_account_id" dans la configuration. ${metaError}`,
        templates: [],
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Templates] Fetch error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        templates: [],
      },
      { status: 500 }
    );
  }
}
