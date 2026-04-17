import { NextResponse } from 'next/server';

// Next.js is strictly a render/proxy tier for SPW — it holds no persistent
// state and its upstream is the NestJS API. A successful response here just
// proves the Node server is serving. Consumers who care about API health
// should probe the API's /api/health/ready directly.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
  });
}
