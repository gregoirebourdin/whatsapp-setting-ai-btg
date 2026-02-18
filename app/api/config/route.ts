import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createAdminClient();
  
  const { data: configs, error } = await supabase
    .from('config')
    .select('key, value, updated_at')
    .order('key');
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // Convert to object format, masking sensitive values
  const configObject: Record<string, { value: string; masked: boolean; updated_at: string }> = {};
  const sensitiveKeys = ['whatsapp_access_token', 'chatbase_api_key'];
  
  for (const config of configs || []) {
    const isSensitive = sensitiveKeys.includes(config.key);
    configObject[config.key] = {
      value: isSensitive && config.value ? '••••••••' + config.value.slice(-4) : config.value,
      masked: isSensitive,
      updated_at: config.updated_at,
    };
  }
  
  return NextResponse.json(configObject);
}

export async function PUT(request: NextRequest) {
  const supabase = createAdminClient();
  
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  
  const { key, value } = body;
  
  if (!key || typeof value !== 'string') {
    return NextResponse.json({ error: 'Invalid key or value' }, { status: 400 });
  }
  
  const validKeys = [
    'whatsapp_phone_number_id',
    'whatsapp_access_token',
    'whatsapp_verify_token',
    'whatsapp_business_account_id',
    'chatbase_chatbot_id',
    'chatbase_api_key',
    'send_mode',
    'template_name',
    'template_language',
  ];
  
  if (!validKeys.includes(key)) {
    return NextResponse.json({ error: 'Invalid config key' }, { status: 400 });
  }
  
  const { error } = await supabase
    .from('config')
    .upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'key',
    });
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ success: true, key });
}
