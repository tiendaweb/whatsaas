import 'server-only';

import { readOnlyPluginCatalogMetadata, readOnlyResourceMetadata, readOnlyResources } from './catalog';

const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
};

export function buildReadOnlyOpenApi(origin: string) {
  const paths: Record<string, unknown> = {
    '/api/readonly/v1': {
      get: { operationId: 'getApiIndex', summary: 'API index', tags: ['Discovery'], responses: { '200': { description: 'API capabilities and links' } } },
    },
    '/api/readonly/v1/health': {
      get: { operationId: 'getApiHealth', summary: 'Validate token and API availability', tags: ['Discovery'], responses: { '200': { description: 'Healthy' } } },
    },
    '/api/readonly/v1/resources': {
      get: { operationId: 'listResources', summary: 'List every readable resource', tags: ['Discovery'], responses: { '200': { description: 'Resource catalog' } } },
    },
    '/api/readonly/v1/openapi.json': {
      get: { operationId: 'getOpenApi', summary: 'Download this OpenAPI document', tags: ['Discovery'], responses: { '200': { description: 'OpenAPI 3.1 document' } } },
    },
    '/api/readonly/v1/ai-context.md': {
      get: { operationId: 'getAiContext', summary: 'Download an AI-oriented integration guide', tags: ['Discovery'], responses: { '200': { description: 'Markdown integration context' } } },
    },
  };

  paths['/api/readonly/v1/plugin-catalog'] = {
    get: {
      operationId: 'list_plugin_catalog',
      summary: readOnlyPluginCatalogMetadata.title,
      description: readOnlyPluginCatalogMetadata.description,
      tags: ['Plugins'],
      parameters: [
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search plugin identifier or display name' },
        { name: 'activationMode', in: 'query', schema: { type: 'string', enum: ['system', 'global', 'user', 'hybrid'] } },
        { name: 'installed', in: 'query', schema: { type: 'boolean' } },
        { name: 'enabled', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: {
        '200': { description: 'Registered plugin catalog', content: { 'application/json': { schema: { $ref: '#/components/schemas/ListResponse' } } } },
        '401': { description: 'Invalid token', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  };
  paths['/api/readonly/v1/plugin-catalog/{id}'] = {
    get: {
      operationId: 'get_registered_plugin',
      summary: 'Get one registered plugin',
      tags: ['Plugins'],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Registered plugin', content: { 'application/json': { schema: { $ref: '#/components/schemas/ItemResponse' } } } },
        '404': { description: 'Plugin not found', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  };

  for (const resource of readOnlyResources) {
    const meta = readOnlyResourceMetadata(resource);
    const tag = resource.category[0].toUpperCase() + resource.category.slice(1);
    paths[`/api/readonly/v1/${resource.key}`] = {
      get: {
        operationId: `list_${resource.key.replaceAll('-', '_')}`,
        summary: resource.title,
        description: resource.description,
        tags: [tag],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'per_page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
          ...(meta.searchable ? [{ name: 'q', in: 'query', schema: { type: 'string' }, description: `Searches: ${resource.search.join(', ')}` }] : []),
          ...meta.filters.map((name) => ({ name, in: 'query', schema: { type: 'string' }, description: `Exact match on ${name}` })),
        ],
        responses: {
          '200': {
            description: `Paginated ${resource.key} list`,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ListResponse' } } },
          },
          '401': { description: 'Invalid token', content: { 'application/json': { schema: errorSchema } } },
          '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    };
    if (resource.itemLookup) paths[`/api/readonly/v1/${resource.key}/{id}`] = {
      get: {
        operationId: `get_${resource.key.replaceAll('-', '_')}`,
        summary: `Get one ${resource.title.toLowerCase()} record`,
        tags: [tag],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Record', content: { 'application/json': { schema: { $ref: '#/components/schemas/ItemResponse' } } } },
          '404': { description: 'Record not found inside this team', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'WhatsPro Read-only Data API',
      version: '1.1.0',
      description: 'Team-isolated, read-only access to WhatsPro operational and plugin data. Every endpoint accepts only GET, HEAD, and OPTIONS.',
    },
    servers: [{ url: origin }],
    security: [{ bearerAuth: [] }],
    tags: ['Discovery', 'Core', 'Crm', 'Communication', 'Automation', 'Operations', 'Plugins', 'Commerce', 'Content'].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'ro_live_' } },
      schemas: {
        ListResponse: {
          type: 'object',
          required: ['object', 'resource', 'data', 'meta'],
          properties: {
            object: { const: 'list' },
            resource: { type: 'string' },
            data: { type: 'array', items: { type: 'object', additionalProperties: true } },
            meta: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                perPage: { type: 'integer' },
                hasMore: { type: 'boolean' },
                nextPage: { type: ['integer', 'null'] },
              },
            },
          },
        },
        ItemResponse: {
          type: 'object',
          required: ['object', 'resource', 'data'],
          properties: {
            object: { const: 'record' },
            resource: { type: 'string' },
            data: { type: 'object', additionalProperties: true },
          },
        },
        Error: errorSchema,
      },
    },
    'x-ai-instructions': {
      discovery: '/api/readonly/v1/resources',
      context: '/api/readonly/v1/ai-context.md',
      rule: 'Never attempt POST, PUT, PATCH, or DELETE. Follow pagination until meta.hasMore is false.',
    },
  };
}

export function buildAiContext(origin: string) {
  const resources = [readOnlyPluginCatalogMetadata, ...readOnlyResources.map(readOnlyResourceMetadata)]
    .map((resource) => {
      return `- \`${resource.key}\` — ${resource.description} Filters: ${resource.filters.join(', ') || 'none'}${resource.searchable ? '; supports q' : ''}.`;
    })
    .join('\n');

  return `# WhatsPro Read-only Data API

Base URL: \`${origin}/api/readonly/v1\`

## Non-negotiable rules

1. Authenticate every request with \`Authorization: Bearer ro_live_…\`.
2. Use only \`GET\`, \`HEAD\`, or \`OPTIONS\`. The API has no mutation handler.
3. Data is isolated to the team that owns the token.
4. Never log, paste into source code, or send the token to another host.
5. Paginate with \`page\` and \`per_page\` (maximum 100) until \`meta.hasMore\` is false.
6. Use exact filters exposed by the resource catalog. Use \`q\` only where \`searchable\` is true.

## Discovery

- \`GET /\` — API index.
- \`GET /health\` — validate the token.
- \`GET /resources\` — machine-readable catalog with fields and filters.
- \`GET /openapi.json\` — OpenAPI 3.1.
- \`GET /ai-context.md\` — this guide.

## Response contract

Lists return \`{ object, resource, data, meta: { page, perPage, hasMore, nextPage } }\`.
Items return \`{ object: "record", resource, data }\`.
Errors return \`{ error: { code, message } }\` with an appropriate HTTP status.

## Useful investigation recipes

### Review every interested contact and its conversation

1. Read \`/contacts?per_page=100\`.
2. For each contact, use its \`chatId\` with \`/messages?chatId=<id>&per_page=100\`.
3. Join \`funnelStageId\`, \`assignedDepartmentId\`, and \`assignedUserId\` with \`funnel-stages\`, \`departments\`, and \`users\`.
4. Read \`contact-tags?contactId=<id>\`, then resolve \`tagId\` through \`tags\`.
5. Interpret \`customData\` using definitions from \`custom-fields\`.

### Audit automations

Read \`automations\`, then \`automation-sessions?automationId=<id>\`. Definitions include \`nodes\` and \`edges\`; sessions include current node, variables, chat, contact, and status.

### Inspect plugin data

Start with \`plugin-catalog\` to discover every plugin registered in the running application. Compare it with \`installed-plugins\` and \`member-plugins\`, then query the resource family for the plugin. Connection secrets are deliberately omitted.

### Build a complete team export

1. Read \`/resources\` and keep the returned catalog as the source of truth.
2. For every resource, request \`per_page=100\` and follow \`meta.nextPage\` until \`meta.hasMore\` is false.
3. Store each resource separately before joining records. Identifiers may be strings or numbers; do not coerce opaque message IDs.
4. Preserve timestamps as ISO 8601 and JSON fields as structured values.
5. Record the extraction time and the API version from \`/\` so later analyses are reproducible.

### Review funnels, departments, and ownership

Read \`funnel-groups\`, \`funnel-stages\`, and \`funnel-group-members\`. Join contacts using \`funnelStageId\`, \`assignedDepartmentId\`, and \`assignedUserId\`. Resolve department membership through \`department-members\`. Keep contacts with null assignments as explicit unassigned groups.

### Review files and media

Message attachments are represented inside \`messages\` through \`mediaUrl\`, \`mediaMimetype\`, \`mediaCaption\`, and related fields. Plugin-owned assets are available through \`task-media\`, \`document-media\`, and \`site-files\`. URLs may expire or require the application session; treat the API record as metadata unless the URL is independently accessible.

### Review commerce and renewals

Join \`customers\`, \`customer-contacts\`, \`customer-stores\`, and \`customer-transactions\`. For memberships, connect \`membership-companies\`, \`membership-plans\`, \`membership-subscriptions\`, and \`membership-reminder-rules\`. AAPP synchronization state and candidates live under the \`aapp-*\` resources.

## Errors and retry behavior

- \`400 invalid_parameter\`: fix the parameter; do not retry unchanged.
- \`401 missing_token\` or \`invalid_token\`: provide a valid, non-expired token.
- \`404 not_found\` or \`record_not_found\`: the route or team-scoped record does not exist.
- \`429 rate_limit_exceeded\`: wait until \`X-RateLimit-Reset\` before retrying.
- \`500 internal_error\`: retry with bounded exponential backoff and report the resource if it persists.

## Safe AI behavior

- Begin with discovery instead of guessing resource names or fields.
- Do not send returned personal or operational data to another service unless the user explicitly authorizes it.
- Prefer targeted filters for interactive questions and exhaustive pagination for audits.
- Cite record identifiers and timestamps in conclusions so a human can verify them.
- Distinguish missing data from a null field and from an empty list.
- Never infer that an automation ran only because it is active; verify \`automation-sessions\` and messages.

## cURL

\`\`\`bash
curl -sS "${origin}/api/readonly/v1/chats?per_page=100" \\
  -H "Authorization: Bearer $WHATSPRO_API_TOKEN" \\
  -H "Accept: application/json"
\`\`\`

## JavaScript

\`\`\`js
const response = await fetch("${origin}/api/readonly/v1/messages?chatId=123&per_page=100", {
  headers: { Authorization: \`Bearer \${process.env.WHATSPRO_API_TOKEN}\` }
});
if (!response.ok) throw new Error(await response.text());
const result = await response.json();
\`\`\`

## Python

\`\`\`python
import os, requests
response = requests.get(
    "${origin}/api/readonly/v1/contacts",
    headers={"Authorization": f"Bearer {os.environ['WHATSPRO_API_TOKEN']}"},
    params={"per_page": 100},
    timeout=30,
)
response.raise_for_status()
data = response.json()
\`\`\`

## Codex desktop, CLI, or IDE extension (STDIO MCP)

Codex clients share MCP configuration in \`~/.codex/config.toml\`. Download \`${origin}/integrations/whatspro-readonly-mcp.mjs\`, use its absolute local path, and restart the client after adding:

\`\`\`toml
[mcp_servers.whatspro_readonly]
command = "node"
args = ["/absolute/path/whatspro-readonly-mcp.mjs"]
default_tools_approval_mode = "approve"

[mcp_servers.whatspro_readonly.env]
WHATSPRO_API_BASE_URL = "${origin}"
WHATSPRO_API_TOKEN = "ro_live_YOUR_TOKEN"
\`\`\`

## Claude Desktop (STDIO MCP)

\`\`\`json
{
  "mcpServers": {
    "whatspro-readonly": {
      "command": "node",
      "args": ["/absolute/path/whatspro-readonly-mcp.mjs"],
      "env": {
        "WHATSPRO_API_BASE_URL": "${origin}",
        "WHATSPRO_API_TOKEN": "ro_live_YOUR_TOKEN"
      }
    }
  }
}
\`\`\`

## Claude Code (STDIO MCP)

Download \`${origin}/integrations/whatspro-readonly-mcp.mjs\` and add it with user scope so the connector is available across projects:

\`\`\`bash
claude mcp add --transport stdio --scope user \\
  --env WHATSPRO_API_BASE_URL=${origin} \\
  --env WHATSPRO_API_TOKEN=ro_live_YOUR_TOKEN \\
  whatspro-readonly -- node /absolute/path/whatspro-readonly-mcp.mjs

claude mcp get whatspro-readonly
\`\`\`

## Resource catalog

${resources}
`;
}
