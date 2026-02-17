import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// GET: List all campaigns with stats
export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('bulk_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data || [] });
}
