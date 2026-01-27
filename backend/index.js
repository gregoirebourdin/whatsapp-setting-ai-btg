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

/**
 * Find or create a contact in Chatbase by phone number
 * Returns the Chatbase contactId
 */
async function findOrCreateChatbaseContact(waId, name) {
  const chatbotId = await getConfig('chatbase_chatbot_id');
  const apiKey = await getConfig('chatbase_api_key');
  
  if (!chatbotId || !apiKey) {
    throw new Error('Chatbase credentials not configured');
  }
  
  // Format phone number with + prefix for Chatbase
  const phoneNumber = waId.startsWith('+') ? waId : `+${waId}`;
  
  try {
    // STEP 1: Search for existing contact by phone number
    console.log(`[Worker] Searching for contact with phone: ${phoneNumber}`);
    
    const searchResponse = await fetch(
      `https://www.chatbase.co/api/v1/chatbots/${chatbotId}/contacts?per_page=1000`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const contacts = searchData.data || [];
      
      console.log(`[Worker] Found ${contacts.length} total contacts in Chatbase`);
      
      // Find contact matching our phone number
      const existingContact = contacts.find(c => {
        const contactPhone = c.phonenumber || '';
        // Compare normalized phone numbers (remove + and spaces)
        const normalizedContact = contactPhone.replace(/[\s+]/g, '');
        const normalizedSearch = phoneNumber.replace(/[\s+]/g, '');
        return normalizedContact === normalizedSearch || 
               normalizedContact.endsWith(normalizedSearch) || 
               normalizedSearch.endsWith(normalizedContact);
      });
      
      if (existingContact) {
        console.log(`[Worker] Found existing contact: ${existingContact.id} (${existingContact.name || 'no name'})`);
        return existingContact.id;
      }
    }
    
    // STEP 2: No existing contact - create one
    console.log(`[Worker] No existing contact found, creating new contact...`);
    
    const createResponse = await fetch(
      `https://www.chatbase.co/api/v1/chatbots/${chatbotId}/contacts`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contacts: [{
            external_id: waId,
            name: name || `WhatsApp ${waId}`,
            phonenumber: phoneNumber,
          }],
        }),
      }
    );
    
    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      console.error('[Worker] Failed to create contact:', errorData);
      // Continue without contact - conversation will still work
      return null;
    }
    
    const createData = await createResponse.json();
    const newContactId = createData.data?.[0]?.id;
    
    console.log(`[Worker] Created new contact: ${newContactId}`);
    return newContactId;
    
  } catch (error) {
    console.error(`[Worker] Error with contact:`, error.message);
    // Continue without contact - conversation will still work
    return null;
  }
}

async function queryChatbase(message, conversationId, contactId) {
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
  
  // IMPORTANT: We MUST provide conversationId for the conversation to be saved in Chatbase
  if (conversationId) {
    body.conversationId = conversationId;
  }
  
  // Optional: link to a contact in Chatbase
  if (contactId) {
    body.contactId = contactId;
  }
  
  console.log(`[Worker] Calling Chatbase API with conversationId: ${conversationId}`);
  
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
// BREVO API
// ============================================
async function updateBrevoContact(phoneNumber) {
  const apiKey = await getConfig('brevo_api_key');
  
  if (!apiKey) {
    console.log('[Worker] Brevo API key not configured - skipping Brevo update');
    return;
  }
  
  // Format phone number with + prefix for Brevo (E.164 format)
  const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  
  console.log(`[Worker] Updating Brevo contact ${formattedPhone} - setting ANSWERED to yes`);
  
  try {
    // Use Option 2: identifier as phone number in URL with identifierType=phone_id
    const response = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(formattedPhone)}?identifierType=phone_id`,
      {
        method: 'PUT',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          attributes: {
            ANSWERED: "yes",
          },
        }),
      }
    );
    
    if (response.status === 204) {
      console.log(`[Worker] Brevo contact updated successfully`);
      return true;
    } else if (response.status === 404) {
      console.log(`[Worker] Brevo contact not found for ${formattedPhone}`);
      return false;
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[Worker] Brevo API error ${response.status}:`, errorData);
      return false;
    }
  } catch (error) {
    console.error(`[Worker] Brevo update failed:`, error.message);
    return false;
  }
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
  
  // Check if user is blocked BEFORE processing
  const mapping = await getMapping(job.wa_id);
  if (mapping?.blocked) {
    console.log(`[Worker] User ${job.wa_id} is BLOCKED - skipping job ${job.id}`);
    
    // Mark job as skipped (not failed, just blocked)
    await supabase
      .from('scheduled_jobs')
      .update({ 
        status: 'skipped', 
        last_error: 'User is blocked',
        updated_at: new Date().toISOString() 
      })
      .eq('id', job.id);
    
    await logEvent('job_skipped_blocked', job.wa_id, job.id, { blocked: true }, null);
    return;
  }
  
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
    
    // Use the mapping we already fetched for block check
    let chatbaseContactId = mapping?.chatbase_contact_id;
    let conversationId = mapping?.chatbase_conversation_id;
    
    // STEP 1: Find or create contact in Chatbase (this is how we link conversations!)
    if (!chatbaseContactId) {
      console.log(`[Worker] No Chatbase contactId in local mapping, searching/creating...`);
      chatbaseContactId = await findOrCreateChatbaseContact(waId, mapping?.name);
      
      if (chatbaseContactId) {
        // Save contactId to local mapping
        await updateMapping(waId, { chatbase_contact_id: chatbaseContactId });
      }
    } else {
      console.log(`[Worker] Using existing Chatbase contactId: ${chatbaseContactId}`);
    }
    
    // STEP 2: Use conversationId if we have one, or create a new conversation
    // By passing contactId, Chatbase will link this conversation to the contact
    // and we can see all conversations for this contact in Chatbase dashboard
    const isFirstMessage = !conversationId;
    
    if (!conversationId) {
      // Generate a unique conversationId - Chatbase requires this to save the conversation
      conversationId = `wa_${waId}_${Date.now()}`;
      console.log(`[Worker] Generated new conversationId: ${conversationId}`);
      await updateMapping(waId, { chatbase_conversation_id: conversationId });
      
      // STEP 2.5: First message - Update Brevo contact to mark as ANSWERED
      await updateBrevoContact(waId);
    } else {
      console.log(`[Worker] Using existing conversationId: ${conversationId}`);
    }
    
    // Query Chatbase with both conversationId AND contactId
    // - conversationId: ensures conversation is saved
    // - contactId: links conversation to the contact (for unified history)
    const chatbaseResponse = await queryChatbase(content, conversationId, chatbaseContactId);
    
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
