import { createAdminClient } from './supabase/server';
import type { 
  ChatbaseResponse, 
  ChatbaseConversationsResponse,
} from './types';

async function getConfig(key: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', key)
    .single();
  return data?.value || null;
}

// ============================================
// CONVERSATION HISTORY FUNCTIONS
// Store and retrieve full conversation history locally
// ============================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Get full conversation history for a WhatsApp user
 */
async function getConversationHistory(waId: string): Promise<ChatMessage[]> {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('role, content')
    .eq('wa_id', waId)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error('[Chatbase] Error fetching conversation history:', error);
    return [];
  }
  
  return (data || []).map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));
}

/**
 * Save a message to conversation history
 */
async function saveMessage(waId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  const supabase = createAdminClient();
  
  const { error } = await supabase
    .from('conversation_messages')
    .insert({
      wa_id: waId,
      role,
      content,
    });
  
  if (error) {
    console.error('[Chatbase] Error saving message:', error);
  }
}

/**
 * Chat with Chatbase - sends FULL conversation history for proper context
 * According to Chatbase docs: https://www.chatbase.co/docs/api-reference/chat/chat-with-a-chatbot
 * The messages array should contain the full conversation history
 */
export async function queryChatbaseWithConversation(
  userMessage: string,
  conversationId?: string,
  waId?: string
): Promise<ChatbaseResponse & { conversationId: string }> {
  const chatbotId = await getConfig('chatbase_chatbot_id');
  const apiKey = await getConfig('chatbase_api_key');
  
  if (!chatbotId || !apiKey) {
    throw new Error('Chatbase credentials not configured');
  }
  
  // Get full conversation history if we have a waId
  let messages: ChatMessage[] = [];
  
  if (waId) {
    // Get existing history
    messages = await getConversationHistory(waId);
    
    // Save the new user message to history
    await saveMessage(waId, 'user', userMessage);
  }
  
  // Add the current user message to the messages array
  messages.push({ role: 'user', content: userMessage });
  
  const url = `https://www.chatbase.co/api/v1/chat`;
  
  const body: Record<string, unknown> = {
    chatbotId,
    messages, // Send FULL conversation history
    stream: false,
  };
  
  // If we have a conversationId, include it for Chatbase's reference
  if (conversationId) {
    body.conversationId = conversationId;
  }
  
  console.log('[Chatbase] Sending request with', messages.length, 'messages in history');
  console.log('[Chatbase] Full messages:', JSON.stringify(messages, null, 2));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Chatbase] API error:', errorData);
      throw new Error(`Chatbase API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const assistantResponse = data.text || data.message || data.answer || 'No response from Chatbase';
    
    // Save the assistant response to history
    if (waId) {
      await saveMessage(waId, 'assistant', assistantResponse);
    }
    
    console.log('[Chatbase] Response received, history now has', messages.length + 1, 'messages');
    
    return {
      text: assistantResponse,
      sourceDocuments: data.sourceDocuments,
      conversationId: data.conversationId || conversationId || '',
    };
  } catch (error) {
    console.error('[Chatbase] Query error:', error);
    throw error;
  }
}

// ============================================
// WA_ID MAPPING FUNCTIONS
// Minimal local storage - just the mapping between WhatsApp ID and Chatbase IDs
// ============================================

export async function getOrCreateMapping(waId: string): Promise<{
  chatbase_conversation_id: string | null;
  chatbase_contact_id: string | null;
}> {
  const supabase = createAdminClient();
  
  const { data } = await supabase
    .from('wa_id_mappings')
    .select('chatbase_conversation_id, chatbase_contact_id')
    .eq('wa_id', waId)
    .maybeSingle();
  
  if (data) {
    return data;
  }
  
  // Create new mapping entry (conversation_id will be set after first chat)
  await supabase
    .from('wa_id_mappings')
    .insert({ wa_id: waId });
  
  return { chatbase_conversation_id: null, chatbase_contact_id: null };
}

export async function updateMapping(
  waId: string,
  updates: { chatbase_conversation_id?: string; chatbase_contact_id?: string }
): Promise<void> {
  const supabase = createAdminClient();
  
  await supabase
    .from('wa_id_mappings')
    .upsert({
      wa_id: waId,
      ...updates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wa_id' });
}

// ============================================
// CHATBASE API - Direct access (no local storage)
// ============================================

/**
 * Get conversations from Chatbase API
 * GET /get-conversations
 */
export async function getChatbaseConversations(
  options: {
    filteredSources?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
    size?: string;
  } = {}
): Promise<ChatbaseConversationsResponse | null> {
  const chatbotId = await getConfig('chatbase_chatbot_id');
  const apiKey = await getConfig('chatbase_api_key');
  
  if (!chatbotId || !apiKey) {
    console.error('[Chatbase] Credentials not configured');
    return null;
  }
  
  try {
    const params = new URLSearchParams({ chatbotId });
    if (options.filteredSources) params.append('filteredSources', options.filteredSources);
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    if (options.page) params.append('page', options.page);
    if (options.size) params.append('size', options.size);
    
    const url = `https://www.chatbase.co/api/v1/get-conversations?${params.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Chatbase] Get conversations error:', response.status, errorText);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Chatbase] Get conversations error:', error);
    return null;
  }
}
