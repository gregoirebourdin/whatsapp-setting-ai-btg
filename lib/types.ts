// ============================================
// DATABASE TYPES (matching our clean schema)
// ============================================

export interface Config {
  id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface WaIdMapping {
  id: string;
  wa_id: string;
  chatbase_conversation_id: string | null;
  chatbase_contact_id: string | null;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledJob {
  id: string;
  wa_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduled_for: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventLog {
  id: string;
  event_type: string;
  wa_id: string | null;
  job_id: string | null;
  payload: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

// ============================================
// CHATBASE API TYPES
// ============================================

export interface ChatbaseContact {
  id: string;
  external_id: string;
  name: string;
  email: string;
  phonenumber: string;
  stripe_accounts: Array<{
    label: string;
    stripe_id: string;
    stripe_email: string;
  }>;
  custom_attributes: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ChatbaseConversation {
  id: string;
  chatbot_id: string;
  created_at: string;
  updated_at: string;
  source: string;
  messages: ChatbaseMessage[];
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface ChatbaseMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type: string;
}

export interface ChatbaseContactsResponse {
  message: string;
  data: ChatbaseContact[];
  total: number;
  pages: {
    page: number;
    per_page: number;
    total_pages: number;
  };
}

export interface ChatbaseConversationsResponse {
  data: ChatbaseConversation[];
}

export interface ChatbaseResponse {
  text: string;
  conversationId?: string;
  sourceDocuments?: Array<{
    pageContent: string;
    metadata: Record<string, unknown>;
  }>;
}

// ============================================
// WHATSAPP WEBHOOK TYPES
// ============================================

export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: { name: string };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        image?: { id: string; mime_type: string; sha256: string; caption?: string };
        audio?: { id: string; mime_type: string };
        document?: { id: string; mime_type: string; filename: string };
        video?: { id: string; mime_type: string };
        location?: { latitude: number; longitude: number; name?: string; address?: string };
        interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
      }>;
      statuses?: Array<{
        id: string;
        status: string;
        timestamp: string;
        recipient_id: string;
      }>;
    };
    field: string;
  }>;
}
