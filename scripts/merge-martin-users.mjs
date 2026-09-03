/**
 * Fusiona `martinproduccion@aapp.space` (user 12) en `martin@whatspro.uno`
 * (user 23), dentro del equipo 2.
 *
 * Por qué: conviven dos cuentas de la misma persona. La UI de Tareas tuvo que
 * escribir una heurística de puntajes (`data/miembros.ts`) sólo para adivinar
 * cuál de las dos era "Martín" al armar la columna del tablero, y las tareas
 * asignadas a la cuenta equivocada caían en "Sin asignar".
 *
 * Qué hace: reasigna toda referencia de la cuenta vieja a la nueva y le saca
 * la membresía del equipo. NO borra la fila de `users`: borrarla es
 * irreversible y se llevaría puesto el historial. La cuenta queda sin equipo,
 * o sea sin acceso a nada.
 *
 * Uso: node scripts/merge-martin-users.mjs [--apply]
 * Sin --apply sólo informa.
 */
import postgres from 'postgres';
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const VIEJO = 12;
const NUEVO = 23;
const TEAM = 2;

const url = fs.readFileSync('.env', 'utf8').match(/^POSTGRES_URL=(.*)$/m)[1].trim();
const sql = postgres(url);

const [viejo] = await sql`select id, email from users where id = ${VIEJO}`;
const [nuevo] = await sql`select id, email, name from users where id = ${NUEVO}`;
if (!viejo || !nuevo) {
  console.error('No están las dos cuentas; nada que fusionar.');
  await sql.end();
  process.exit(1);
}
console.log(`${APPLY ? 'APLICANDO' : 'SIMULACRO'} — ${viejo.email} (#${VIEJO}) → ${nuevo.email} (#${NUEVO})\n`);

// Todas las columnas que referencian users(id), para no depender de una lista
// escrita a mano que envejezca con el esquema.
const fks = await sql`
  select tc.table_name, kcu.column_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
  where tc.constraint_type = 'FOREIGN KEY'
    and ccu.table_name = 'users' and ccu.column_name = 'id'
  order by tc.table_name, kcu.column_name`;

// `team_members` y `department_members` no se reasignan: tienen unicidad por
// (equipo/depto, usuario) y el destino ya está adentro. Se resuelven aparte.
const APARTE = new Set(['team_members', 'department_members']);

const plan = [];
for (const fk of fks) {
  if (APARTE.has(fk.table_name)) continue;
  const [{ count }] = await sql.unsafe(
    `select count(*)::int as count from "${fk.table_name}" where "${fk.column_name}" = ${VIEJO}`,
  );
  if (count > 0) plan.push({ ...fk, count });
}

if (plan.length === 0) console.log('Sin referencias que reasignar.');
for (const row of plan) {
  console.log(`  ${row.table_name}.${row.column_name}: ${row.count} fila(s)`);
}

const [depto] = await sql`
  select count(*)::int as count from department_members where user_id = ${VIEJO}`;
const [miembro] = await sql`
  select count(*)::int as count from team_members where user_id = ${VIEJO} and team_id = ${TEAM}`;
console.log(`  department_members: ${depto.count} fila(s) → se mueven o se descartan si ya existe`);
console.log(`  team_members: ${miembro.count} fila(s) del equipo ${TEAM} → se elimina`);

if (!APPLY) {
  console.log('\nSimulacro. Volvé a correrlo con --apply para escribir.');
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  for (const row of plan) {
    await tx.unsafe(
      `update "${row.table_name}" set "${row.column_name}" = ${NUEVO} where "${row.column_name}" = ${VIEJO}`,
    );
  }

  // Departamentos: mover sólo si el destino no está ya en ese departamento.
  await tx`
    update department_members set user_id = ${NUEVO}
    where user_id = ${VIEJO}
      and department_id not in (select department_id from department_members where user_id = ${NUEVO})`;
  await tx`delete from department_members where user_id = ${VIEJO}`;

  await tx`delete from team_members where user_id = ${VIEJO} and team_id = ${TEAM}`;

  // Que la cuenta que queda tenga nombre: hasta ahora las dos lo tenían en
  // NULL y la UI caía al prefijo del correo.
  await tx`update users set name = 'Martín' where id = ${NUEVO} and (name is null or name = '')`;
});

console.log('\nFusión aplicada.');
const [restante] = await sql`
  select count(*)::int as count from team_members where user_id = ${VIEJO}`;
console.log(`La cuenta ${viejo.email} quedó en ${restante.count} equipo(s). La fila de users NO se borró.`);
await sql.end();
