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
    SELECT team_id
    FROM team_members
    WHERE user_id = ${user.id}
  `;

  if (!memberships.length) throw new Error(`El usuario ${email} no pertenece a ningún equipo.`);

  for (const membership of memberships) {
    await sql`
      INSERT INTO team_member_plugins (team_id, user_id, plugin_id, enabled, updated_by, updated_at)
      VALUES (${membership.team_id}, ${user.id}, 'files', true, ${user.id}, now())
      ON CONFLICT (team_id, user_id, plugin_id)
      DO UPDATE SET enabled = true, updated_by = EXCLUDED.updated_by, updated_at = now()
    `;
  }

  console.log(`App Archivos activada para ${user.email} en ${memberships.length} equipo(s).`);
} finally {
  await sql.end();
}
