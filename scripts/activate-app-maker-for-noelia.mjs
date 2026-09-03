import 'dotenv/config';
import postgres from 'postgres';

const TARGET_EMAIL = 'noelia@whatspro.uno';
const PLUGIN_ID = 'app-maker';
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  const [user] = await sql`select id, email from users where lower(email) = ${TARGET_EMAIL} limit 1`;
  if (!user) throw new Error(`No existe el usuario ${TARGET_EMAIL}.`);
  const memberships = await sql`select id, team_id, role from team_members where user_id = ${user.id} order by team_id`;
  if (!memberships.length) throw new Error(`${TARGET_EMAIL} no pertenece a ningún equipo.`);

  await sql.begin(async (tx) => {
    for (const membership of memberships) {
      await tx`
        insert into team_plugins (team_id, plugin_id, installed, enabled, settings, installed_by, installed_at, updated_at)
        values (${membership.team_id}, ${PLUGIN_ID}, true, true, '{}'::jsonb, ${user.id}, now(), now())
        on conflict (team_id, plugin_id)
        do update set installed = true, enabled = true, updated_at = now()
      `;
      await tx`
        insert into team_member_plugins (team_id, user_id, plugin_id, enabled, updated_by, updated_at)
        values (${membership.team_id}, ${user.id}, ${PLUGIN_ID}, true, ${user.id}, now())
        on conflict (team_id, user_id, plugin_id)
        do update set enabled = true, updated_by = excluded.updated_by, updated_at = now()
      `;
      if (!['owner', 'admin'].includes(membership.role)) {
        await tx`
          update team_members
          set permissions = coalesce(permissions, '{}'::jsonb) || '{"miniAppsRead":true,"miniAppsWrite":true}'::jsonb
          where id = ${membership.id}
        `;
      }
      await tx`
        insert into activity_logs (team_id, user_id, action, ip_address)
        values (${membership.team_id}, ${user.id}, 'app_maker.connector_access.enabled', 'system')
      `;
    }
  });

  const access = await sql`
    select tm.team_id, tm.role,
      coalesce((tm.permissions ->> 'miniAppsRead')::boolean, tm.role in ('owner', 'admin')) as mini_apps_read,
      coalesce((tm.permissions ->> 'miniAppsWrite')::boolean, tm.role in ('owner', 'admin')) as mini_apps_write,
      tp.installed as team_installed, tp.enabled as team_enabled, tmp.enabled as user_enabled
    from team_members tm
    left join team_plugins tp on tp.team_id = tm.team_id and tp.plugin_id = ${PLUGIN_ID}
    left join team_member_plugins tmp on tmp.team_id = tm.team_id and tmp.user_id = tm.user_id and tmp.plugin_id = ${PLUGIN_ID}
    where tm.user_id = ${user.id}
    order by tm.team_id
  `;
  if (access.some((row) => !row.mini_apps_read || !row.mini_apps_write || !row.team_installed || !row.team_enabled || !row.user_enabled)) {
    throw new Error('La verificación de acceso a App Maker falló.');
  }
  console.log(JSON.stringify({ email: user.email, plugin: PLUGIN_ID, teams: access }, null, 2));
} finally {
  await sql.end();
}
