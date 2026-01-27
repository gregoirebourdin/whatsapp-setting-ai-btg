import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

// Toggle block status for a user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ waId: string }> }
) {
  try {
    const { waId } = await params;
    const supabase = createAdminClient();
    
    // Get current status
    const { data: mapping } = await supabase
      .from('wa_id_mappings')
      .select('blocked')
      .eq('wa_id', waId)
      .single();
    
    const newStatus = !(mapping?.blocked ?? false);
    
    // Update block status
    const { error } = await supabase
      .from('wa_id_mappings')
      .update({ blocked: newStatus, updated_at: new Date().toISOString() })
      .eq('wa_id', waId);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Log the action
    await supabase.from('event_logs').insert({
      event_type: newStatus ? 'user_blocked' : 'user_unblocked',
      wa_id: waId,
      payload: { blocked: newStatus },
    });
    
    return NextResponse.json({ blocked: newStatus });
  } catch (error) {
    console.error('Error toggling block status:', error);
    return NextResponse.json({ error: 'Failed to toggle block status' }, { status: 500 });
  }
}

// Get block status for a user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ waId: string }> }
) {
  try {
    const { waId } = await params;
    const supabase = createAdminClient();
    
    const { data: mapping } = await supabase
      .from('wa_id_mappings')
      .select('blocked')
      .eq('wa_id', waId)
      .single();
    
    return NextResponse.json({ blocked: mapping?.blocked ?? false });
  } catch (error) {
    console.error('Error getting block status:', error);
    return NextResponse.json({ error: 'Failed to get block status' }, { status: 500 });
  }
}
