import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';
import { buildNoeliaMembershipPlan, renderNoeliaMembershipReport } from './lib/noelia-membership-funnel.mjs';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is required');
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));

try {
  const plan = await buildNoeliaMembershipPlan(sql);
  const report = renderNoeliaMembershipReport(plan);
  if (outputArg) {
    const outputPath = resolve(outputArg.slice('--output='.length));
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, report, { mode: 0o600 });
    console.log(JSON.stringify({ dryRun: true, outputPath, fingerprint: plan.fingerprint, counts: {
      task1: plan.task1.length, task2Moves: plan.moves.length, task3Critical: plan.task3.length,
      task4Missing: plan.task4.length, task5Cleanup: plan.task5.length,
    } }, null, 2));
  } else {
    process.stdout.write(report);
  }
} finally {
  await sql.end();
}

