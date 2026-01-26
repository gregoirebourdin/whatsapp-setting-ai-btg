import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/chatbase/conversations/[id]
 * Fetch a single conversation with all messages from Chatbase API
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  
  // Get Chatbase credentials from config
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
    return NextResponse.json(
      { error: 'Chatbase credentials not configured' },
      { status: 400 }
    );
  }
  
  try {
    // Fetch conversations and find the one we need
    // Note: Chatbase doesn't have a single conversation endpoint, so we fetch the list
    const url = `https://www.chatbase.co/api/v1/get-conversations?chatbotId=${chatbotId}&size=100`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch conversation from Chatbase' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    // Find the conversation by ID
    const conversation = (data.data || []).find((conv: { id: string }) => conv.id === conversationId);
    
    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }
    
    // Also try to get contact details if we have a mapping
    let contactDetails = null;
    const { data: mapping } = await supabase
      .from('wa_id_mappings')
      .select('*')
      .eq('chatbase_conversation_id', conversationId)
      .maybeSingle();
    
    if (mapping) {
      // Try to get contact from Chatbase Contacts API
      const contactUrl = `https://www.chatbase.co/api/v1/chatbots/${chatbotId}/contacts?per_page=100`;
      const contactResponse = await fetch(contactUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      
      if (contactResponse.ok) {
        const contactData = await contactResponse.json();
        contactDetails = (contactData.data || []).find(
          (c: { external_id: string }) => c.external_id === mapping.wa_id
        );
      }
    }
    
    return NextResponse.json({
      success: true,
      conversation: {
        id: conversation.id,
        chatbot_id: conversation.chatbot_id,
        source: conversation.source,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        messages: conversation.messages || [],
        customer: conversation.customer || null,
      },
      contact: contactDetails ? {
        name: contactDetails.name || null,
        email: contactDetails.email || null,
        phonenumber: contactDetails.phonenumber || null,
      } : null,
    });
  } catch (error) {
    console.error('[Chatbase API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}
