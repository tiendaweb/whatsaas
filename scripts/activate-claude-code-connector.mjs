import 'dotenv/config';
import postgres from 'postgres';

const TARGET_EMAIL = 'noelia@whatspro.uno';
const PLUGIN_ID = 'claude-code-connector';
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  const [user] = await sql`
    SELECT id, email
    FROM users
    WHERE lower(email) = ${TARGET_EMAIL}
    LIMIT 1
  `;
  if (!user) throw new Error(`No existe el usuario ${TARGET_EMAIL}.`);

  const memberships = await sql`
    SELECT team_id
    FROM team_members
    WHERE user_id = ${user.id}
    ORDER BY team_id
  `;
  if (!memberships.length) throw new Error(`${TARGET_EMAIL} no pertenece a ningún equipo.`);

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO plugin_system_states (plugin_id, enabled_by_default, updated_by, updated_at)
      VALUES (${PLUGIN_ID}, false, ${user.id}, now())
      ON CONFLICT (plugin_id)
      DO UPDATE SET enabled_by_default = false, updated_by = EXCLUDED.updated_by, updated_at = now()
    `;

    await tx`
      UPDATE team_member_plugins
      SET enabled = false, updated_by = ${user.id}, updated_at = now()
      WHERE plugin_id = ${PLUGIN_ID}
        AND user_id <> ${user.id}
    `;

    for (const membership of memberships) {
      await tx`
        INSERT INTO team_member_plugins (team_id, user_id, plugin_id, enabled, updated_by, updated_at)
        VALUES (${membership.team_id}, ${user.id}, ${PLUGIN_ID}, true, ${user.id}, now())
        ON CONFLICT (team_id, user_id, plugin_id)
        DO UPDATE SET enabled = true, updated_by = EXCLUDED.updated_by, updated_at = now()
      `;
    }
  });

  const access = await sql`
    SELECT u.email, tmp.team_id, tmp.enabled
    FROM team_member_plugins tmp
    INNER JOIN users u ON u.id = tmp.user_id
    WHERE tmp.plugin_id = ${PLUGIN_ID}
    ORDER BY lower(u.email), tmp.team_id
  `;

  const unauthorized = access.filter((row) => row.enabled && row.email.toLowerCase() !== TARGET_EMAIL);
  if (unauthorized.length) throw new Error('La verificación encontró accesos habilitados fuera de la cuenta autorizada.');

  console.log(JSON.stringify({ plugin: PLUGIN_ID, targetEmail: TARGET_EMAIL, access }, null, 2));
} finally {
  await sql.end();
}
