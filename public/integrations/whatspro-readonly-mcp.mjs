#!/usr/bin/env node

const token = process.env.WHATSPRO_API_TOKEN;
const origin = (process.env.WHATSPRO_API_BASE_URL || 'https://whatspro.uno').replace(/\/$/, '');
const apiBase = `${origin}/api/readonly/v1`;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: '2.0', id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function api(path, params = {}) {
  if (!token?.startsWith('ro_live_')) throw new Error('Set WHATSPRO_API_TOKEN to a read-only API token.');
  const normalized = String(path || '').replace(/^\/+/, '');
  if (normalized.includes('..')) throw new Error('Invalid API path.');
  const url = new URL(`${apiBase}/${normalized}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json, text/markdown' },
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(typeof body === 'string' ? body : JSON.stringify(body));
  return body;
}

const tools = [
  {
    name: 'whatspro_list_resources',
    description: 'List every WhatsPro resource available through the team-isolated read-only API, including fields and filters.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_list_records',
    description: 'Read a paginated list from one WhatsPro resource. This tool can never modify data.',
    inputSchema: {
      type: 'object',
      required: ['resource'],
      properties: {
        resource: { type: 'string', description: 'Resource key returned by whatspro_list_resources.' },
        page: { type: 'integer', minimum: 1, default: 1 },
        per_page: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        q: { type: 'string', description: 'Full-text query when the resource declares searchable=true.' },
        filters: { type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_get_record',
    description: 'Read one record by resource key and identifier. This tool can never modify data.',
    inputSchema: {
      type: 'object',
      required: ['resource', 'id'],
      properties: { resource: { type: 'string' }, id: { type: ['string', 'number'] } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_ai_context',
    description: 'Load the complete WhatsPro API guide and investigation recipes optimized for an AI assistant.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

async function callTool(name, args = {}) {
  if (name === 'whatspro_list_resources') return api('resources');
  if (name === 'whatspro_ai_context') return api('ai-context.md');
  if (name === 'whatspro_get_record') {
    if (!args.resource || args.id === undefined) throw new Error('resource and id are required.');
    return api(`${encodeURIComponent(args.resource)}/${encodeURIComponent(String(args.id))}`);
  }
  if (name === 'whatspro_list_records') {
    if (!args.resource) throw new Error('resource is required.');
    return api(encodeURIComponent(args.resource), {
      page: args.page || 1,
      per_page: args.per_page || 50,
      q: args.q,
      ...(args.filters || {}),
    });
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(message) {
  const { id, method, params } = message;
  if (method === 'notifications/initialized') return;
  if (method === 'initialize') {
    result(id, {
      protocolVersion: params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'whatspro-readonly', version: '1.0.0' },
      instructions: 'Use these tools only to read WhatsPro data. Follow pagination and never expose the API token.',
    });
    return;
  }
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools });
  if (method === 'tools/call') {
    try {
      const value = await callTool(params?.name, params?.arguments || {});
      result(id, { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
    } catch (toolError) {
      result(id, { isError: true, content: [{ type: 'text', text: toolError instanceof Error ? toolError.message : String(toolError) }] });
    }
    return;
  }
  if (id !== undefined) error(id, -32601, `Method not found: ${method}`);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      void handle(JSON.parse(line));
    } catch {
      error(null, -32700, 'Parse error');
    }
  }
});
