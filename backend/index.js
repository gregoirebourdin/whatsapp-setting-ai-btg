require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ============================================
// CONFIGURATION
// ============================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_INTERVAL_MS = 3000; // Check for jobs every 3 seconds
const MAX_ATTEMPTS = 3;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================
// CONFIG HELPERS
// ============================================
async function getConfig(key) {
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', key)
    .single();
  return data?.value || null;
}

async function logEvent(eventType, waId, jobId, payload, error) {
  await supabase.from('event_logs').insert({
    event_type: eventType,
    wa_id: waId,
    job_id: jobId,
    payload,
    error,
  });
}

// ============================================
// CHATBASE API
// ============================================
async function queryChatbase(message, conversationId) {
  const chatbotId = await getConfig('chatbase_chatbot_id');
  const apiKey = await getConfig('chatbase_api_key');
  
  if (!chatbotId || !apiKey) {
    throw new Error('Chatbase credentials not configured');
  }
  
  const body = {
    chatbotId,
    messages: [{ role: 'user', content: message }],
    stream: false,
  };
  
  if (conversationId) {
    body.conversationId = conversationId;
  }
  
  console.log(`[Worker] Calling Chatbase API...`);
  
  const response = await fetch('https://www.chatbase.co/api/v1/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    console.error('[Worker] Chatbase error:', errorData);
    throw new Error(`Chatbase API error: ${response.status}`);
  }
  
  const data = await response.json();
  console.log(`[Worker] Chatbase response received, conversationId: ${data.conversationId || 'none'}`);
  
  return {
    text: data.text || data.message || data.answer || 'No response',
    conversationId: data.conversationId || conversationId || '',
  };
}

// ============================================
// WHATSAPP API
// ============================================
async function sendWhatsAppMessage(to, message) {
  const token = await getConfig('whatsapp_access_token');
  const phoneNumberId = await getConfig('whatsapp_phone_number_id');
  const sendMode = await getConfig('send_mode') || 'text';
  
  if (!token || !phoneNumberId) {
    throw new Error('WhatsApp credentials not configured');
  }
  
  console.log(`[Worker] Sending WhatsApp message to ${to}...`);
  
  let body;
  if (sendMode === 'template') {
    const templateName = await getConfig('template_name');
    const templateLanguage = await getConfig('template_language') || 'en';
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: message }],
          },
        ],
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
  
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  
  if (!response.ok) {
    const errorData = await response.json();
    console.error('[Worker] WhatsApp error:', errorData);
    throw new Error(`WhatsApp API error: ${response.status}`);
  }
  
  console.log(`[Worker] WhatsApp message sent successfully`);
  return await response.json();
}

// ============================================
// WA_ID MAPPING
// ============================================
async function getMapping(waId) {
  const { data } = await supabase
    .from('wa_id_mappings')
    .select('*')
    .eq('wa_id', waId)
    .single();
  return data;
}

async function updateMapping(waId, updates) {
  await supabase
    .from('wa_id_mappings')
    .upsert({
      wa_id: waId,
      ...updates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wa_id' });
}

// ============================================
// JOB PROCESSING
// ============================================
async function processJob(job) {
  console.log(`[Worker] Processing job ${job.id} for wa_id ${job.wa_id}`);
  
  // Mark as processing
  await supabase
    .from('scheduled_jobs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', job.id);
  
  try {
    const waId = job.wa_id;
    const content = job.content;
    
    if (!content) {
      throw new Error('No message content in job');
    }
    
    // Get existing mapping for this user
    const mapping = await getMapping(waId);
    const existingConversationId = mapping?.chatbase_conversation_id || null;
    
    console.log(`[Worker] Existing conversationId: ${existingConversationId || 'none (new conversation)'}`);
    
    // Query Chatbase
    const chatbaseResponse = await queryChatbase(content, existingConversationId);
    
    // Update mapping with new conversationId
    if (chatbaseResponse.conversationId) {
      await updateMapping(waId, {
        chatbase_conversation_id: chatbaseResponse.conversationId,
      });
      console.log(`[Worker] Updated mapping with conversationId: ${chatbaseResponse.conversationId}`);
    }
    
    // Send response via WhatsApp
    await sendWhatsAppMessage(waId, chatbaseResponse.text);
    
    // Mark job as completed
    await supabase
      .from('scheduled_jobs')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', job.id);
    
    // Log success
    await logEvent('job_completed', waId, job.id, {
      conversationId: chatbaseResponse.conversationId,
      responseLength: chatbaseResponse.text.length,
    }, null);
    
    console.log(`[Worker] Job ${job.id} completed successfully`);
    
  } catch (error) {
    const errorMessage = error.message || String(error);
    console.error(`[Worker] Job ${job.id} failed:`, errorMessage);
    
    const attempts = (job.attempts || 0) + 1;
    
    if (attempts >= MAX_ATTEMPTS) {
      // Mark as failed
      await supabase
        .from('scheduled_jobs')
        .update({
          status: 'failed',
          attempts,
          last_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      
      await logEvent('job_failed', job.wa_id, job.id, { attempts }, errorMessage);
    } else {
      // Retry later
      await supabase
        .from('scheduled_jobs')
        .update({
          status: 'pending',
          attempts,
          last_error: errorMessage,
          scheduled_for: new Date(Date.now() + 5000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      
      await logEvent('job_retry', job.wa_id, job.id, { attempts }, errorMessage);
    }
  }
}

// ============================================
// MAIN POLLING LOOP
// ============================================
async function pollForJobs() {
  try {
    const now = new Date().toISOString();
    
    // Get ready jobs
    const { data: jobs, error } = await supabase
      .from('scheduled_jobs')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(10);
    
    if (error) {
      console.error('[Worker] Error fetching jobs:', error);
      return;
    }
    
    if (jobs && jobs.length > 0) {
      console.log(`[Worker] Found ${jobs.length} ready job(s)`);
      
      for (const job of jobs) {
        await processJob(job);
      }
    }
  } catch (error) {
    console.error('[Worker] Poll error:', error);
  }
}

// ============================================
// START WORKER
// ============================================
console.log('==========================================');
console.log('  WhatsApp-Chatbase Worker Started');
console.log('==========================================');
console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log('');

// Initial poll
pollForJobs();

// Continuous polling
setInterval(pollForJobs, POLL_INTERVAL_MS);

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n[Worker] Shutting down...');
  process.exit(0);
});
