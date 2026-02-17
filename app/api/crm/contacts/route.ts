import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// GET: List all contacts with optional search
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('crm_contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`firstname.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    contacts: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

// POST: Add a single contact
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { firstname, phone, tags, notes } = body;

  if (!firstname || !phone) {
    return NextResponse.json({ error: 'firstname and phone are required' }, { status: 400 });
  }

  // Normalize phone number: remove spaces, dashes, ensure + prefix
  const normalizedPhone = phone.replace(/[\s\-()]/g, '');

  const { data, error } = await supabase
    .from('crm_contacts')
    .upsert(
      {
        firstname,
        phone: normalizedPhone,
        tags: tags || [],
        notes: notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'phone' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contact: data });
}

// DELETE: Delete contacts by IDs
export async function DELETE(request: NextRequest) {
  const supabase = createAdminClient();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { ids } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('crm_contacts')
    .delete()
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: ids.length });
}
