import 'dotenv/config';
import postgres from 'postgres';

const email = (process.argv[2] ?? 'noelia@whatspro.uno').trim().toLowerCase();
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  const [user] = await sql`
    SELECT id, email
    FROM users
    WHERE lower(email) = ${email}
    LIMIT 1
  `;
  if (!user) throw new Error(`No existe un usuario con email ${email}.`);

  const memberships = await sql`
    SELECT id, team_id, role, permissions
    FROM team_members
    WHERE user_id = ${user.id}
  `;
  if (!memberships.length) throw new Error(`El usuario ${email} no pertenece a ningún equipo.`);

  for (const membership of memberships) {
    await sql`
      INSERT INTO team_plugins (
        team_id,
        plugin_id,
        installed,
        enabled,
        settings,
        installed_by,
        installed_at,
        updated_at
      )
      VALUES (
        ${membership.team_id},
        'sites',
        true,
        true,
        '{"baseDomain":"whatspro.uno"}'::jsonb,
        ${user.id},
        now(),
        now()
      )
      ON CONFLICT (team_id, plugin_id)
      DO UPDATE SET installed = true, enabled = true, updated_at = now()
    `;

    await sql`
      INSERT INTO team_member_plugins (team_id, user_id, plugin_id, enabled, updated_by, updated_at)
      VALUES (${membership.team_id}, ${user.id}, 'sites', true, ${user.id}, now())
      ON CONFLICT (team_id, user_id, plugin_id)
      DO UPDATE SET enabled = true, updated_by = EXCLUDED.updated_by, updated_at = now()
    `;

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      await sql`
        UPDATE team_members
        SET permissions = coalesce(permissions, '{}'::jsonb)
          || '{"sitesRead":true,"sitesWrite":true}'::jsonb
        WHERE id = ${membership.id}
      `;
    }
  }

  const verification = await sql`
    SELECT
      tm.team_id,
      tm.role,
      coalesce((tm.permissions ->> 'sitesRead')::boolean, tm.role IN ('owner', 'admin')) AS sites_read,
      coalesce((tm.permissions ->> 'sitesWrite')::boolean, tm.role IN ('owner', 'admin')) AS sites_write,
      tmp.enabled AS user_enabled,
      tp.installed AS team_installed,
      tp.enabled AS team_enabled
    FROM team_members tm
    LEFT JOIN team_member_plugins tmp
      ON tmp.team_id = tm.team_id
      AND tmp.user_id = tm.user_id
      AND tmp.plugin_id = 'sites'
    LEFT JOIN team_plugins tp
      ON tp.team_id = tm.team_id
      AND tp.plugin_id = 'sites'
    WHERE tm.user_id = ${user.id}
    ORDER BY tm.team_id
  `;

  console.log(JSON.stringify({
    email: user.email,
    plugin: 'sites',
    teams: verification,
  }, null, 2));
} finally {
  await sql.end();
}
