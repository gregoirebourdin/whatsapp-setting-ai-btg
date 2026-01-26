import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const searchParams = request.nextUrl.searchParams;
  
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');
  const eventType = searchParams.get('event_type');
  const waId = searchParams.get('wa_id');
  
  let query = supabase
    .from('event_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (eventType) {
    query = query.eq('event_type', eventType);
  }
  
  if (waId) {
    query = query.eq('wa_id', waId);
  }
  
  const { data: logs, count, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({
    logs,
    total: count,
    limit,
    offset,
  });
}
