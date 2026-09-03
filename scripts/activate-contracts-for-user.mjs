import 'dotenv/config';
import postgres from 'postgres';

const email = (process.argv[2] ?? 'noelia@whatspro.uno').trim().toLowerCase();
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  const [user] = await sql`SELECT id, email FROM users WHERE lower(email) = ${email} LIMIT 1`;
  if (!user) throw new Error(`No existe un usuario con email ${email}.`);

  const memberships = await sql`SELECT id, team_id, role, permissions FROM team_members WHERE user_id = ${user.id}`;
  if (!memberships.length) throw new Error(`El usuario ${email} no pertenece a ningún equipo.`);

  for (const membership of memberships) {
    await sql`
      INSERT INTO team_member_plugins (team_id, user_id, plugin_id, enabled, updated_by, updated_at)
      VALUES (${membership.team_id}, ${user.id}, 'contracts', true, ${user.id}, now())
      ON CONFLICT (team_id, user_id, plugin_id)
      DO UPDATE SET enabled = true, updated_by = EXCLUDED.updated_by, updated_at = now()
    `;

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      await sql`
        UPDATE team_members
        SET permissions = coalesce(permissions, '{}'::jsonb) || '{"contractsRead":true,"contractsWrite":true}'::jsonb
        WHERE id = ${membership.id}
      `;
    }
  }

  console.log(`Contratos activado para ${user.email} en ${memberships.length} equipo(s).`);
} finally {
  await sql.end();
}
