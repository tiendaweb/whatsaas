import assert from 'node:assert/strict';
import postgres from 'postgres';
import { build } from 'esbuild';

assert.ok(process.env.POSTGRES_URL, 'POSTGRES_URL is required');
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  const contractBundle = await build({ entryPoints: ['lib/plugins/app-maker/shared/contract.ts'], absWorkingDir: process.cwd(), bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22' });
  const contract = await import(`data:text/javascript;base64,${Buffer.from(contractBundle.outputFiles[0].text).toString('base64')}`);
  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('team_app_maker_records', 'team_app_maker_record_links', 'team_app_maker_attachments')
    order by table_name
  `;
  assert.deepEqual(tables.map((row) => row.table_name), [
    'team_app_maker_attachments',
    'team_app_maker_record_links',
    'team_app_maker_records',
  ]);

  const constraints = await sql`
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name in ('team_app_maker_records', 'team_app_maker_record_links', 'team_app_maker_attachments')
  `;
  const names = new Set(constraints.map((row) => row.constraint_name));
  for (const required of [
    'team_app_maker_records_scope_id_uidx',
    'team_app_maker_record_links_edge_uidx',
    'team_app_maker_record_links_source_scope_fk',
    'team_app_maker_attachments_record_scope_fk',
  ]) assert.ok(names.has(required), `Missing constraint: ${required}`);

  const definitions = await sql`select slug, definition, published_definition from team_radar_apps where slug like 'app-maker--%'`;
  for (const row of definitions) {
    assert.equal(contract.applicationDefinitionSchema.safeParse(row.definition).success, true, `Invalid draft definition: ${row.slug}`);
    if (row.published_definition) assert.equal(contract.applicationDefinitionSchema.safeParse(row.published_definition).success, true, `Invalid published definition: ${row.slug}`);
  }

  const [app] = await sql`select id, team_id from team_radar_apps order by id limit 1`;
  if (app) {
    const rollback = new Error('expected_rollback');
    await sql.begin(async (tx) => {
      const [record] = await tx`
        insert into team_app_maker_records (team_id, app_id, entity_key, data)
        values (${app.team_id}, ${app.id}, 'schema-smoke', ${tx.json({ name: 'smoke' })})
        returning id
      `;
      await tx`
        insert into team_app_maker_record_links (team_id, app_id, relation_key, source_record_id, target_kind, target_key, target_record_id)
        values (${app.team_id}, ${app.id}, 'self', ${record.id}, 'entity', 'schema-smoke', ${String(record.id)})
      `;
      await tx`
        insert into team_app_maker_attachments (team_id, app_id, record_id, field_key, file_name, mime_type, size_bytes, storage_path)
        values (${app.team_id}, ${app.id}, ${record.id}, 'file', 'smoke.txt', 'text/plain', 1, 'smoke')
      `;
      throw rollback;
    }).catch((error) => {
      if (error !== rollback) throw error;
    });
  }

  console.log('APP MAKER schema verification passed.');
} finally {
  await sql.end();
}
