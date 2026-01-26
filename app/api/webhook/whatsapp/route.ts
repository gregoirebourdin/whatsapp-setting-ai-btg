import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { markMessageAsRead, verifyWebhookSignature } from '@/lib/whatsapp';
import { scheduleOrDebounceJob } from '@/lib/job-queue';
import type { WhatsAppWebhookEntry } from '@/lib/types';

// GET: Webhook verification
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  
  let verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  
  if (!verifyToken) {
    try {
      const supabase = createAdminClient();
      const { data: config } = await supabase
        .from('config')
        .select('value')
        .eq('key', 'whatsapp_verify_token')
        .single();
      verifyToken = config?.value;
    } catch (e) {
      console.log('[Webhook] Could not fetch token from DB:', e);
    }
  }
  
  if (mode === 'subscribe' && token && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }
  
  return new NextResponse('Forbidden', { status: 403 });
}

// POST: Receive messages
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  
  const signature = request.headers.get('x-hub-signature-256') || '';
  const body = await request.text();
  
  if (!verifyWebhookSignature(signature, body)) {
    await logEvent(supabase, 'webhook_signature_invalid', null, null, 'Invalid signature');
    return new NextResponse('Unauthorized', { status: 401 });
  }
  
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  
  await logEvent(supabase, 'webhook_received', null, payload, null);
  
  const entries: WhatsAppWebhookEntry[] = payload.object === 'whatsapp_business_account' 
    ? payload.entry || []
    : [];
  
  for (const entry of entries) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      
      const value = change.value;
      
      if (value.statuses) {
        for (const status of value.statuses) {
          await logEvent(supabase, 'status_update', null, {
            wa_message_id: status.id,
            status: status.status,
            recipient_id: status.recipient_id,
          }, null);
        }
      }
      
      if (value.messages && value.contacts) {
        for (let i = 0; i < value.messages.length; i++) {
          const message = value.messages[i];
          const contact = value.contacts[i] || value.contacts[0];
          
          await handleIncomingMessage(supabase, message, contact);
        }
      }
    }
  }
  
  return new NextResponse('OK', { status: 200 });
}

async function handleIncomingMessage(
  supabase: ReturnType<typeof createAdminClient>,
  message: NonNullable<WhatsAppWebhookEntry['changes'][0]['value']['messages']>[0],
  contact: NonNullable<WhatsAppWebhookEntry['changes'][0]['value']['contacts']>[0]
) {
  const waId = message.from;
  const name = contact?.profile?.name || null;
  
  // Get or create mapping for this WhatsApp user
  let { data: mapping } = await supabase
    .from('wa_id_mappings')
    .select('*')
    .eq('wa_id', waId)
    .single();
  
  if (!mapping) {
    const { data: newMapping, error } = await supabase
      .from('wa_id_mappings')
      .insert({
        wa_id: waId,
        name: name,
      })
      .select()
      .single();
    
    if (error) {
      console.error('[Webhook] Failed to create mapping:', error);
      await logEvent(supabase, 'mapping_create_error', waId, { wa_id: waId }, error.message);
      return;
    }
    mapping = newMapping;
  } else if (name && mapping.name !== name) {
    // Update name if changed
    await supabase
      .from('wa_id_mappings')
      .update({ name: name, updated_at: new Date().toISOString() })
      .eq('id', mapping.id);
  }
  
  // Extract message content
  let content = '';
  const messageType = message.type;
  
  switch (message.type) {
    case 'text':
      content = message.text?.body || '';
      break;
    case 'image':
      content = message.image?.caption || '[Image received]';
      break;
    case 'audio':
      content = '[Audio message received]';
      break;
    case 'video':
      content = '[Video received]';
      break;
    case 'document':
      content = `[Document: ${message.document?.filename || 'unknown'}]`;
      break;
    case 'location':
      content = `[Location: ${message.location?.name || `${message.location?.latitude}, ${message.location?.longitude}`}]`;
      break;
    case 'interactive':
      content = message.interactive?.button_reply?.title || 
                message.interactive?.list_reply?.title || 
                '[Interactive response]';
      break;
    default:
      content = `[${message.type} message]`;
  }
  
  // Mark as read
  await markMessageAsRead(message.id);
  
  // Log message received
  await logEvent(supabase, 'message_received', waId, {
    type: messageType,
    content: content.substring(0, 100),
    wa_message_id: message.id,
  }, null);
  
  // Schedule Chatbase response (with debounce) - pass wa_id and content
  await scheduleOrDebounceJob(waId, content);
  
  console.log(`[Webhook] Processed message from ${waId}: ${content.substring(0, 50)}...`);
}

async function logEvent(
  supabase: ReturnType<typeof createAdminClient>,
  eventType: string,
  waId: string | null,
  payload: Record<string, unknown> | null,
  error: string | null
) {
  await supabase.from('event_logs').insert({
    event_type: eventType,
    wa_id: waId,
    payload,
    error,
  });
}
