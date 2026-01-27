import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Debug endpoint to see exactly what Chatbase returns
 * GET /api/debug/chatbase?type=conversations|contacts
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'all';
  
  const supabase = createAdminClient();
  
  const { data: chatbotIdConfig } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'chatbase_chatbot_id')
    .single();
  
  const { data: apiKeyConfig } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'chatbase_api_key')
    .single();
  
  const chatbotId = chatbotIdConfig?.value;
  const apiKey = apiKeyConfig?.value;
  
  if (!chatbotId || !apiKey) {
    return NextResponse.json({ error: 'Chatbase credentials not configured' }, { status: 400 });
  }
  
  const results: Record<string, unknown> = {};
  
  // Fetch contacts
  if (type === 'contacts' || type === 'all') {
    try {
      const contactsRes = await fetch(
        `https://www.chatbase.co/api/v1/chatbots/${chatbotId}/contacts?per_page=100`,
        {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        }
      );
      const contactsData = await contactsRes.json();
      results.contacts = {
        status: contactsRes.status,
        data: contactsData,
      };
    } catch (e) {
      results.contacts = { error: String(e) };
    }
  }
  
  // Fetch conversations
  if (type === 'conversations' || type === 'all') {
    try {
      const convsRes = await fetch(
        `https://www.chatbase.co/api/v1/get-conversations?chatbotId=${chatbotId}&size=50`,
        {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        }
      );
      const convsData = await convsRes.json();
      results.conversations = {
        status: convsRes.status,
        data: convsData,
      };
    } catch (e) {
      results.conversations = { error: String(e) };
    }
  }
  
  return NextResponse.json(results, { status: 200 });
}
