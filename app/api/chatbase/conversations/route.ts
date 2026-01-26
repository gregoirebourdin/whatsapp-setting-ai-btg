import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/chatbase/conversations
 * Fetch conversations directly from Chatbase API (no local storage needed)
 * This is fast and always up-to-date
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') || '1';
  const size = searchParams.get('size') || '50';
  const filteredSources = searchParams.get('sources'); // Optional: "WhatsApp,API"
  
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
    // Build URL for Chatbase API
    const params = new URLSearchParams({ chatbotId, page, size });
    if (filteredSources) params.append('filteredSources', filteredSources);
    
    const url = `https://www.chatbase.co/api/v1/get-conversations?${params.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      // Cache for 30 seconds to improve performance
      next: { revalidate: 30 },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Chatbase API] Error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to fetch conversations from Chatbase' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    // Return data in format expected by ConversationsPanel
    // Chatbase returns: { data: [{ id, chatbot_id, created_at, updated_at, source, messages }] }
    return NextResponse.json({
      success: true,
      data: data.data || [],
    });
  } catch (error) {
    console.error('[Chatbase API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
