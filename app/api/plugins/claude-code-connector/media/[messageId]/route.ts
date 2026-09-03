import { NextRequest } from 'next/server';
import {
  GET as sharedGet,
  OPTIONS as sharedOptions,
} from '@/app/api/plugins/grok-connector/media/[messageId]/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ messageId: string }> }) {
  return sharedGet(request, context);
}

export async function OPTIONS() {
  return sharedOptions();
}
