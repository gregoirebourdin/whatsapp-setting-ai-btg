import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const WHATSAPP_API_VERSION = 'v18.0';

async function getConfig(key: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', key)
    .single();
  return data?.value || null;
}

// POST: Create an upload session for resumable upload
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName, fileSize, fileType } = body;

    if (!fileName || !fileSize || !fileType) {
      return NextResponse.json(
        { error: 'fileName, fileSize, and fileType are required' },
        { status: 400 }
      );
    }

    const accessToken = await getConfig('whatsapp_access_token');
    const phoneNumberId = await getConfig('whatsapp_phone_number_id');

    if (!accessToken || !phoneNumberId) {
      return NextResponse.json(
        { error: 'WhatsApp credentials not configured' },
        { status: 400 }
      );
    }

    // Get the App ID from the access token (it's embedded in system user tokens)
    // For WhatsApp Cloud API, we use the phone number ID's parent app
    // Actually, for WhatsApp we need to use a different approach - upload directly to phone number
    
    // Create upload session with Meta Graph API
    // Note: For WhatsApp, large files need the Resumable Upload API
    const appId = await getConfig('meta_app_id');
    
    if (!appId) {
      return NextResponse.json(
        { error: 'Meta App ID not configured. Add "meta_app_id" in Configuration.' },
        { status: 400 }
      );
    }

    const sessionRes = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${appId}/uploads?` +
      `file_name=${encodeURIComponent(fileName)}&` +
      `file_length=${fileSize}&` +
      `file_type=${encodeURIComponent(fileType)}&` +
      `access_token=${accessToken}`,
      { method: 'POST' }
    );

    const sessionData = await sessionRes.json();

    if (!sessionRes.ok || !sessionData.id) {
      console.error('[MediaSession] Failed to create session:', sessionData);
      return NextResponse.json(
        { error: sessionData.error?.message || 'Failed to create upload session' },
        { status: 400 }
      );
    }

    // Return session info - client will use this to upload chunks
    return NextResponse.json({
      success: true,
      sessionId: sessionData.id,
      uploadUrl: `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${sessionData.id}`,
    });

  } catch (error) {
    console.error('[MediaSession] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
