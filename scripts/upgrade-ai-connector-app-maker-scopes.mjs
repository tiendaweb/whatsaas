import 'dotenv/config';
import postgres from 'postgres';

const TARGET_EMAIL = 'noelia@whatspro.uno';
const origin = (process.env.BASE_URL || 'https://whatspro.uno').replace(/\/$/, '');
const resources = ['grok-connector', 'chatgpt-connector', 'claude-code-connector'].map((id) => `${origin}/api/plugins/${id}/mcp`);
const requiredScopes = ['whatspro:read', 'whatspro:write', 'appmaker:read', 'appmaker:write', 'appmaker:publish', 'appmaker:media'];
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  const targets = await sql`
    select u.id as user_id, tm.team_id
    from users u join team_members tm on tm.user_id = u.id
    where lower(u.email) = ${TARGET_EMAIL}
    order by tm.team_id
  `;
  if (!targets.length) throw new Error(`No existe una membresía para ${TARGET_EMAIL}.`);

  const updated = [];
  await sql.begin(async (tx) => {
    for (const target of targets) {
      const rows = await tx`
        update grok_connector_credentials credential
        set scopes = (
          select jsonb_agg(scope order by scope)
          from (
            select distinct jsonb_array_elements_text(coalesce(credential.scopes, '[]'::jsonb)) as scope
            union
            select unnest(${requiredScopes}::text[]) as scope
          ) merged
        ), updated_at = now()
        where credential.team_id = ${target.team_id}
          and credential.user_id = ${target.user_id}
          and credential.resource = any(${resources})
          and credential.kind in ('authorization_code', 'access_token', 'refresh_token')
          and credential.revoked_at is null
          and credential.expires_at > now()
        returning id, kind, resource, scopes
      `;
      updated.push(...rows);
      await tx`
        insert into activity_logs (team_id, user_id, action, ip_address)
        values (${target.team_id}, ${target.user_id}, 'ai_connectors.app_maker_scopes.upgraded', ${String(rows.length)})
      `;
    }
  });

  const incomplete = updated.filter((row) => requiredScopes.some((scope) => !row.scopes.includes(scope)));
  if (incomplete.length) throw new Error('La verificación encontró credenciales con alcances incompletos.');
  const summary = resources.map((resource) => ({
    connector: resource.split('/').at(-2),
    credentialsUpdated: updated.filter((row) => row.resource === resource).length,
    kinds: [...new Set(updated.filter((row) => row.resource === resource).map((row) => row.kind))].sort(),
  }));
  console.log(JSON.stringify({ targetEmail: TARGET_EMAIL, requiredScopes, summary }, null, 2));
} finally {
  await sql.end();
}
