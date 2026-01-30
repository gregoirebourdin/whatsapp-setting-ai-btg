import { createAdminClient } from './supabase/server';
import { queryChatbaseWithConversation, getOrCreateMapping, updateMapping } from './chatbase';
import { sendWhatsAppMessage } from './whatsapp';

const MAX_ATTEMPTS = 3;

async function getConfig(key: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', key)
    .single();
  return data?.value || null;
}

export async function scheduleOrDebounceJob(waId: string, content: string): Promise<void> {
  const supabase = createAdminClient();
  
  // Check for existing pending job
  const { data: existingJob } = await supabase
    .from('scheduled_jobs')
    .select('*')
    .eq('wa_id', waId)
    .eq('status', 'pending')
    .single();
  
  const debounceMs = parseInt(await getConfig('debounce_ms') || '3000');
  const scheduledFor = new Date(Date.now() + debounceMs).toISOString();
  
  if (existingJob) {
    // Debounce: update the scheduled time AND append new content
    const existingContent = existingJob.content || '';
    const newContent = existingContent ? `${existingContent}\n${content}` : content;
    
    await supabase
      .from('scheduled_jobs')
      .update({ 
        scheduled_for: scheduledFor,
        content: newContent,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingJob.id);
    
    console.log(`[JobQueue] Debounced job ${existingJob.id} to ${scheduledFor}`);
  } else {
    // Create new job with content stored in DB
    const { data: newJob, error } = await supabase
      .from('scheduled_jobs')
      .insert({
        wa_id: waId,
        status: 'pending',
        scheduled_for: scheduledFor,
        content: content,
        attempts: 0,
      })
      .select()
      .single();
    
    if (error) {
      console.error('[JobQueue] Failed to create job:', error);
    } else {
      console.log(`[JobQueue] Created job ${newJob.id} for ${scheduledFor}`);
    }
  }
}

export async function processReadyJobs(): Promise<{ processed: number; errors: number }> {
  const supabase = createAdminClient();
  let processed = 0;
  let errors = 0;
  
  const now = new Date().toISOString();
  const { data: jobs, error } = await supabase
    .from('scheduled_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(10);
  
  if (error) {
    console.error('[JobQueue] Failed to fetch jobs:', error);
    return { processed: 0, errors: 1 };
  }
  
  for (const job of jobs || []) {
    try {
      await processJob(job);
      processed++;
    } catch (err) {
      console.error(`[JobQueue] Job ${job.id} failed:`, err);
      errors++;
    }
  }
  
  return { processed, errors };
}

interface Job {
  id: string;
  wa_id: string;
  status: string;
  scheduled_for: string;
  attempts: number;
  last_error: string | null;
  content: string | null;
}

async function processJob(job: Job): Promise<void> {
  const supabase = createAdminClient();
  
  // Mark as processing
  await supabase
    .from('scheduled_jobs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', job.id);
  
  try {
    const waId = job.wa_id;
    
    // Get the message content from the job (stored in DB, not memory)
    const content = job.content;
    if (!content) {
      throw new Error('No message content found in job');
    }
    
    // Get mapping for Chatbase conversation ID
    const mapping = await getOrCreateMapping(waId);
    
    // Query Chatbase WITH full conversation history
    const chatbaseResponse = await queryChatbaseWithConversation(
      content,
      mapping.chatbase_conversation_id || undefined,
      waId // Pass waId to fetch and store conversation history
    );
    
    // Update mapping with the conversation ID from Chatbase
    if (chatbaseResponse.conversationId && chatbaseResponse.conversationId !== mapping.chatbase_conversation_id) {
      await updateMapping(waId, { chatbase_conversation_id: chatbaseResponse.conversationId });
    }
    
    // Determine send mode
    const sendMode = await getConfig('send_mode') || 'text';
    const templateName = await getConfig('template_name');
    const templateLanguage = await getConfig('template_language') || 'en';
    
    let sendResult;
    
    if (sendMode === 'template' && templateName) {
      sendResult = await sendWhatsAppMessage({
        to: waId,
        message: chatbaseResponse.text,
        useTemplate: true,
        templateName,
        templateLanguage,
        templateComponents: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: chatbaseResponse.text }],
          },
        ],
      });
    } else {
      sendResult = await sendWhatsAppMessage({
        to: waId,
        message: chatbaseResponse.text,
      });
    }
    
    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Failed to send message');
    }
    
    // Log success
    await supabase.from('event_logs').insert({
      event_type: 'chatbase_response_sent',
      wa_id: waId,
      job_id: job.id,
      payload: {
        response_length: chatbaseResponse.text.length,
        send_mode: sendMode,
        chatbase_conversation_id: chatbaseResponse.conversationId,
      },
    });
    
    // Mark job as completed
    await supabase
      .from('scheduled_jobs')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', job.id);
    
    console.log(`[JobQueue] Job ${job.id} completed successfully`);
  } catch (error) {
    const attempts = job.attempts + 1;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (attempts >= MAX_ATTEMPTS) {
      await supabase
        .from('scheduled_jobs')
        .update({
          status: 'failed',
          attempts,
          last_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      
      await supabase.from('event_logs').insert({
        event_type: 'job_failed',
        wa_id: job.wa_id,
        job_id: job.id,
        payload: { attempts },
        error: errorMessage,
      });
    } else {
      const retryDelay = Math.pow(2, attempts) * 5;
      const retryAt = new Date(Date.now() + retryDelay * 1000).toISOString();
      
      await supabase
        .from('scheduled_jobs')
        .update({
          status: 'pending',
          scheduled_for: retryAt,
          attempts,
          last_error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      
      console.log(`[JobQueue] Job ${job.id} will retry at ${retryAt}`);
    }
    
    throw error;
  }
}
