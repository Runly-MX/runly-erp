import pg from 'pg';

// Read-only, explicitly configured local target. Never fall back to application env.
const connectionString = process.env.RUNLY_COMMERCE_PREFLIGHT_DATABASE_URL;
if (!connectionString) throw new Error('Configura RUNLY_COMMERCE_PREFLIGHT_DATABASE_URL para una base local.');
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(connectionString).hostname)) throw new Error('Este preflight sólo admite PostgreSQL local.');
const db = new pg.Client({ connectionString });
try {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  const { rows: [counts] } = await db.query(`SELECT
    (SELECT count(*) FROM (SELECT 1 FROM pos_session WHERE status='OPEN' GROUP BY company_id,terminal_id HAVING count(*)>1) s)::int AS duplicate_open_sessions,
    (SELECT count(*) FROM (SELECT 1 FROM pos_waiter_shift WHERE status='OPEN' GROUP BY company_id,outlet_id,waiter_id HAVING count(*)>1) s)::int AS duplicate_open_shifts,
    (SELECT count(*) FROM pos_payment WHERE num_nonnulls(session_id,waiter_shift_id)<>1)::int AS historic_unknown_container,
    (SELECT count(*) FROM pos_order WHERE paid_amount<0 OR paid_amount>total_amount)::int AS order_totals_requiring_review,
    (SELECT count(*) FROM pos_payment p JOIN pos_order o ON o.id=p.order_id JOIN pos_session s ON s.id=p.session_id
       WHERE p.company_id<>o.company_id OR s.company_id<>o.company_id OR s.outlet_id<>o.outlet_id OR (o.terminal_id IS NOT NULL AND o.terminal_id<>s.terminal_id))::int AS inconsistent_payment_scope`);
  console.log(JSON.stringify(counts));
  await db.query('ROLLBACK');
  if(counts.duplicate_open_sessions || counts.duplicate_open_shifts)process.exitCode=1;
} finally { await db.end(); }
