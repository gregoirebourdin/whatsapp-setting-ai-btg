import { createAdminClient } from './supabase/server';

const WHATSAPP_API_VERSION = 'v18.0';

interface SendMessageOptions {
  to: string;
  message: string;
  useTemplate?: boolean;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: Array<{
    type: string;
    parameters: Array<{ type: string; text?: string }>;
  }>;
}

interface WhatsAppApiResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

async function getConfig(key: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', key)
    .single();
  return data?.value || null;
}

export async function sendWhatsAppMessage(options: SendMessageOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { to, message, useTemplate, templateName, templateLanguage, templateComponents } = options;
  
  const phoneNumberId = await getConfig('whatsapp_phone_number_id');
  const accessToken = await getConfig('whatsapp_access_token');
  
  if (!phoneNumberId || !accessToken) {
    return { success: false, error: 'WhatsApp credentials not configured' };
  }
  
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
  
  let body: Record<string, unknown>;
  
  if (useTemplate && templateName) {
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage || 'en' },
        components: templateComponents || [],
      },
    };
  } else {
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    };
  }
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[WhatsApp] API error:', errorData);
      return { success: false, error: JSON.stringify(errorData) };
    }
    
    const data: WhatsAppApiResponse = await response.json();
    return { success: true, messageId: data.messages[0]?.id };
  } catch (error) {
    console.error('[WhatsApp] Send error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  const phoneNumberId = await getConfig('whatsapp_phone_number_id');
  const accessToken = await getConfig('whatsapp_access_token');
  
  if (!phoneNumberId || !accessToken) return;
  
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch (error) {
    console.error('[WhatsApp] Mark read error:', error);
  }
}

export function verifyWebhookSignature(signature: string, body: string): boolean {
  // In production, implement HMAC-SHA256 verification with app secret
  // For now, we'll trust the webhook if it has a signature
  return !!signature;
}
