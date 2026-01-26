import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const searchParams = request.nextUrl.searchParams;
  
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');
  
  // Verify conversation exists
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', id)
    .single();
  
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  
  const { data: messages, count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact' })
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({
    messages,
    total: count,
    limit,
    offset,
  });
}
