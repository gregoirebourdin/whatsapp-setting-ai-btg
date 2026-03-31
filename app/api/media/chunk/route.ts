import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

async function getConfig(key: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('config')
    .select('value')
    .eq('key', key)
    .single();
  return data?.value || null;
}

// POST: Upload a chunk to an existing session
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sessionId = formData.get('sessionId') as string;
    const fileOffset = formData.get('fileOffset') as string;
    const chunk = formData.get('chunk') as Blob;

    if (!sessionId || fileOffset === null || !chunk) {
      return NextResponse.json(
        { error: 'sessionId, fileOffset, and chunk are required' },
        { status: 400 }
      );
    }

    const accessToken = await getConfig('whatsapp_access_token');

    if (!accessToken) {
      return NextResponse.json(
        { error: 'WhatsApp credentials not configured' },
        { status: 400 }
      );
    }

    // Convert Blob to ArrayBuffer
    const arrayBuffer = await chunk.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload chunk to Meta
    const uploadRes = await fetch(
      `https://graph.facebook.com/v18.0/${sessionId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `OAuth ${accessToken}`,
          'file_offset': fileOffset,
          'Content-Type': 'application/octet-stream',
        },
        body: buffer,
      }
    );

    const uploadData = await uploadRes.json();

    if (!uploadRes.ok) {
      console.error('[MediaChunk] Upload failed:', uploadData);
      return NextResponse.json(
        { error: uploadData.error?.message || 'Chunk upload failed' },
        { status: 400 }
      );
    }

    // If we get a file handle back, upload is complete
    if (uploadData.h) {
      return NextResponse.json({
        success: true,
        complete: true,
        fileHandle: uploadData.h,
      });
    }

    // Otherwise, more chunks needed
    return NextResponse.json({
      success: true,
      complete: false,
      fileOffset: uploadData.file_offset,
    });

  } catch (error) {
    console.error('[MediaChunk] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
