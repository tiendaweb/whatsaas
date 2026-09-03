import 'dotenv/config';
import postgres from 'postgres';
import { hash } from 'bcryptjs';

// Uso: node scripts/create-carlos-team-member.mjs
// Crea (si no existe) la cuenta de Carlos y lo suma como dueño al equipo de Noelia
// (team_id 2), donde viven los proyectos RADAR · Noelia/Martín/Carlos.
const EMAIL = 'carlos@whatspro.uno';
const PASSWORD = 'carlosvegayque';
const NAME = 'Carlos';
const TEAM_ID = 2;
const SALT_ROUNDS = 10; // mismo valor que lib/auth/session.ts

const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  let [user] = await sql`SELECT id, email FROM users WHERE lower(email) = ${EMAIL} LIMIT 1`;

  if (!user) {
    const passwordHash = await hash(PASSWORD, SALT_ROUNDS);
    [user] = await sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (${NAME}, ${EMAIL}, ${passwordHash}, 'member')
      RETURNING id, email
    `;
    console.log(`Usuario creado: ${user.email} (id ${user.id}).`);
  } else {
    console.log(`El usuario ${user.email} (id ${user.id}) ya existía; no se toca la contraseña.`);
  }

  const [existingMembership] = await sql`
    SELECT id, role FROM team_members WHERE team_id = ${TEAM_ID} AND user_id = ${user.id}
  `;

  if (existingMembership) {
    if (existingMembership.role !== 'owner') {
      await sql`UPDATE team_members SET role = 'owner' WHERE id = ${existingMembership.id}`;
      console.log(`Membresía existente actualizada a role=owner (team ${TEAM_ID}).`);
    } else {
      console.log(`Ya era miembro (owner) del equipo ${TEAM_ID}.`);
    }
  } else {
    await sql`
      INSERT INTO team_members (user_id, team_id, role, joined_at)
      VALUES (${user.id}, ${TEAM_ID}, 'owner', now())
    `;
    console.log(`Sumado al equipo ${TEAM_ID} como owner.`);
  }
} finally {
  await sql.end();
}
