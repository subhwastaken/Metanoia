import { NextResponse } from 'next/server';
import { JobIntelligenceAgent } from '../../../../services/agent';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const { intent, jobs, company_jobs, board_jobs, logs } = await JobIntelligenceAgent.searchJobs(prompt);

    return NextResponse.json({
      success: true,
      logs,
      intent,
      jobs,
      company_jobs,
      board_jobs,
    });
  } catch (e: any) {
    console.error('Agent search error:', e);
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
