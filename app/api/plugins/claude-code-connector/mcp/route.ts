import { NextRequest } from 'next/server';
import {
  DELETE as sharedDelete,
  GET as sharedGet,
  OPTIONS as sharedOptions,
  POST as sharedPost,
} from '@/app/api/plugins/grok-connector/mcp/route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return sharedPost(request);
}

export async function GET() {
  return sharedGet();
}

export async function DELETE() {
  return sharedDelete();
}

export async function OPTIONS() {
  return sharedOptions();
}
