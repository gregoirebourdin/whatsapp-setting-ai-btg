import { NextResponse } from 'next/server';
import { processReadyJobs } from '@/lib/job-queue';
import { NextRequest } from 'next/server'; // Import NextRequest

// This endpoint is called by the client-side polling hook

export async function POST() {
  console.log('[Jobs] Processing ready jobs...');
  
  const startTime = Date.now();
  const result = await processReadyJobs();
  const duration = Date.now() - startTime;
  
  console.log(`[Jobs] Processed ${result.processed} jobs with ${result.errors} errors in ${duration}ms`);
  
  return NextResponse.json({
    success: true,
    processed: result.processed,
    errors: result.errors,
    duration_ms: duration,
  });
}

// Also support GET for easy testing
export async function GET() {
  return POST();
}
