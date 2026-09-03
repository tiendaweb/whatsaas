import 'dotenv/config';
import postgres from 'postgres';
const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
try {
  const [user] = await sql`SELECT id, email, name FROM users WHERE lower(email) LIKE '%noelia%' LIMIT 1`;
  console.log('user:', user);
  const members = await sql`SELECT team_id, role FROM team_members WHERE user_id = ${user.id}`;
  console.log('teams:', members);
  const teamId = members[0].team_id;
  console.log('team_plugins:', await sql`SELECT plugin_id, enabled FROM team_plugins WHERE team_id = ${teamId} ORDER BY plugin_id`);
  console.log('member_plugins:', await sql`SELECT plugin_id, enabled FROM team_member_plugins WHERE team_id = ${teamId} AND user_id = ${user.id} ORDER BY plugin_id`);
  console.log('system_defaults:', await sql`SELECT plugin_id, enabled_by_default FROM plugin_system_states WHERE plugin_id IN ('sales','articles','finance','memberships','customers','tasks','deals')`);
  console.log('fin_entries:', await sql`SELECT type, currency, status, count(*)::int AS n, sum(amount)::bigint AS cents FROM team_financial_entries WHERE team_id = ${teamId} GROUP BY 1,2,3 ORDER BY 1,2,3`);
  console.log('fin_accounts:', await sql`SELECT id, name, currency FROM team_financial_accounts WHERE team_id = ${teamId}`);
  console.log('memb_companies:', await sql`SELECT id, name FROM team_membership_companies WHERE team_id = ${teamId}`);
  console.log('memb_plans:', await sql`SELECT count(*)::int AS n FROM team_membership_plans WHERE team_id = ${teamId}`);
  console.log('memb_subs:', await sql`SELECT status, payment_status, currency, count(*)::int AS n, sum(price)::bigint AS cents FROM team_membership_subscriptions WHERE team_id = ${teamId} GROUP BY 1,2,3 ORDER BY 1,2,3`);
  console.log('customers:', await sql`SELECT count(*)::int AS n FROM team_customers WHERE team_id = ${teamId}`);
  console.log('sales:', await sql`SELECT status, currency, count(*)::int AS n, sum(total)::bigint AS cents FROM team_sales WHERE team_id = ${teamId} GROUP BY 1,2,3`);
  console.log('entry_payments:', await sql`SELECT count(*)::int AS n FROM team_financial_entry_payments p JOIN team_financial_entries e ON e.id = p.entry_id WHERE e.team_id = ${teamId}`);
  console.log('cost_centers:', await sql`SELECT count(*)::int AS n FROM team_cost_centers WHERE team_id = ${teamId}`.catch(() => 'no table'));
} finally { await sql.end(); }
