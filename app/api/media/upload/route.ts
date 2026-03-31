import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Increase body size limit for media uploads (100MB)
export const config = {
  api: {
    bodyParser: false,
  },
};

// For App Router, we need to export this
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout for large uploads

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    const phoneNumberId = await getConfig('whatsapp_phone_number_id');
    const accessToken = await getConfig('whatsapp_access_token');

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { error: 'Identifiants WhatsApp non configures. Allez dans Configuration.' },
        { status: 400 }
      );
    }

    // Validate file size (max 100MB for WhatsApp)
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Fichier trop volumineux. Maximum 100MB.' },
        { status: 400 }
      );
    }

    // Validate MIME type
    const supportedTypes: Record<string, string[]> = {
      image: ['image/jpeg', 'image/png', 'image/webp'],
      video: ['video/mp4', 'video/3gpp'],
      audio: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
      document: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
      ],
      sticker: ['image/webp'],
    };

    const allSupportedTypes = Object.values(supportedTypes).flat();
    if (!allSupportedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Type de fichier non supporte: ${file.type}. Types acceptes: images (JPEG, PNG, WebP), videos (MP4, 3GPP), audio (AAC, MP4, MP3, AMR, OGG), documents (PDF, Word, Excel, PowerPoint, TXT).`,
        },
        { status: 400 }
      );
    }

    // Determine media type category
    let mediaType = 'document';
    for (const [type, mimes] of Object.entries(supportedTypes)) {
      if (mimes.includes(file.type)) {
        mediaType = type;
        break;
      }
    }

    // Create form data for WhatsApp API
    const waFormData = new FormData();
    waFormData.append('messaging_product', 'whatsapp');
    waFormData.append('file', file);
    waFormData.append('type', file.type);

    const response = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/media`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: waFormData,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errorMsg =
        data?.error?.message ||
        data?.error?.error_user_msg ||
        JSON.stringify(data);
      return NextResponse.json(
        { error: `Erreur WhatsApp: ${errorMsg}` },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      mediaId: data.id,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      mediaType,
      expiresIn: '30 jours',
    });
  } catch (error) {
    console.error('[Media Upload] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 }
    );
  }
}
