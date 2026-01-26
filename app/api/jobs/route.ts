import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const searchParams = request.nextUrl.searchParams;
  
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const offset = parseInt(searchParams.get('offset') || '0');
  const status = searchParams.get('status');
  
  let query = supabase
    .from('scheduled_jobs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data: jobs, count, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // Enrich with wa_id_mappings data
  const waIds = [...new Set((jobs || []).map(j => j.wa_id))];
  const { data: mappings } = await supabase
    .from('wa_id_mappings')
    .select('wa_id, name')
    .in('wa_id', waIds);
  
  const mappingMap = new Map((mappings || []).map(m => [m.wa_id, m]));
  
  const enrichedJobs = (jobs || []).map(job => ({
    ...job,
    contact_name: mappingMap.get(job.wa_id)?.name || null,
  }));
  
  return NextResponse.json({
    jobs: enrichedJobs,
    total: count,
    limit,
    offset,
  });
}
