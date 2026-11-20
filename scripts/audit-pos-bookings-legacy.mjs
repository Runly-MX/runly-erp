// Read-only audit of legacy POS reservations and appointments before moving an outlet onto
// the Booking Engine (runly.bookings phase 5). Prints counts only (no names, phones or ids).
// Uses DATABASE_URL / DIRECT_URL from the environment (or AUDIT_DATABASE_URL for another
// environment); runs in a READ ONLY transaction and never writes.
//   node scripts/audit-pos-bookings-legacy.mjs            # summary + blockers per outlet
//   AUDIT_DATABASE_URL=... node scripts/audit-pos-bookings-legacy.mjs > audit-<env>.json
// The per-outlet answer that decides an activation is POST /pos/bookings/links/preview.
import { config } from 'dotenv'
import { createRequire } from 'node:module'
config({ path: ['.env.local', '.env'], quiet: true })
const pg = createRequire(new URL('../apps/worker/package.json', import.meta.url))('pg')
const url = process.env.AUDIT_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL o DIRECT_URL es requerido.')
const client = new pg.Client({ connectionString: url })
await client.connect()
const q = async (sql) => (await client.query(sql)).rows
try {
  await client.query('BEGIN READ ONLY')
  const hasLink = (await q(`SELECT to_regclass('public.pos_booking_link') IS NOT NULL AS ok`))[0].ok
  const hasZone = (await q(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'pos_outlet' AND column_name = 'timezone'`))[0].n > 0
  const hasHold = (await q(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'booking_allocation' AND column_name = 'pos_order_id'`))[0].n > 0
  // Per outlet (ids only): what an activation would carry or refuse. Blockers must be fixed in POS first.
  const outlets = await q(`
    SELECT o.id, o.mode::text AS mode, o.enabled,
           ${hasZone ? 'o.timezone' : 'NULL::text AS timezone'},
           (SELECT count(*)::int FROM pos_reservation r WHERE r.outlet_id = o.id AND r.status = 'CONFIRMED' AND r.scheduled_at + make_interval(mins => r.duration_minutes) > now()) AS live_reservations,
           (SELECT count(*)::int FROM pos_reservation a JOIN pos_reservation b ON a.table_id = b.table_id AND a.id < b.id
             WHERE a.outlet_id = o.id AND a.status = 'CONFIRMED' AND b.status = 'CONFIRMED'
               AND tstzrange(a.scheduled_at, a.scheduled_at + make_interval(mins => a.duration_minutes)) && tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins => b.duration_minutes))
               AND greatest(a.scheduled_at + make_interval(mins => a.duration_minutes), b.scheduled_at + make_interval(mins => b.duration_minutes)) > now()) AS overlapping_pairs,
           (SELECT count(*)::int FROM pos_reservation r JOIN pos_table t ON t.id = r.table_id WHERE r.outlet_id = o.id AND r.status = 'CONFIRMED' AND r.party_size > t.capacity AND r.scheduled_at + make_interval(mins => r.duration_minutes) > now()) AS party_over_capacity,
           (SELECT count(*)::int FROM pos_appointment p WHERE p.outlet_id = o.id AND p.status IN ('SCHEDULED', 'ARRIVED') AND p.starts_at + make_interval(mins => p.duration_minutes) > now()) AS live_appointments,
           (SELECT count(*)::int FROM pos_order x WHERE x.outlet_id = o.id AND x.table_id IS NOT NULL AND x.status::text NOT IN ('PAID', 'CANCELLED', 'REFUNDED')) AS open_table_accounts
      FROM pos_outlet o ORDER BY o.created_at`)
  const blockers = []
  if (!hasLink || !hasZone || !hasHold) blockers.push('Migraciones de Reservaciones pendientes (20270108400000_bookings_pos_integration, 20270108500000_bookings_pos_hardening).')
  for (const o of outlets.filter((x) => x.enabled)) {
    if (!o.timezone) blockers.push(`Sucursal ${o.id}: sin zona horaria (Administración > General > editar sucursal).`)
    if (o.overlapping_pairs) blockers.push(`Sucursal ${o.id}: ${o.overlapping_pairs} par(es) de reservas encimadas en la misma mesa.`)
    if (o.party_over_capacity) blockers.push(`Sucursal ${o.id}: ${o.party_over_capacity} reserva(s) con más personas que la mesa.`)
  }
  const report = {
    reservationsByStatus: await q(`SELECT status::text, count(*)::int AS n, count(*) FILTER (WHERE scheduled_at + make_interval(mins => duration_minutes) > now())::int AS open_or_future FROM pos_reservation GROUP BY 1 ORDER BY 1`),
    // Two live legacy reservations on the same table whose times overlap: the engine accepts only one.
    overlappingReservationPairs: (await q(`
      SELECT count(*)::int AS n FROM pos_reservation a JOIN pos_reservation b ON a.table_id = b.table_id AND a.id < b.id
       WHERE a.status = 'CONFIRMED' AND b.status = 'CONFIRMED' AND a.table_id IS NOT NULL
         AND tstzrange(a.scheduled_at, a.scheduled_at + make_interval(mins => a.duration_minutes)) && tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins => b.duration_minutes))
         AND greatest(a.scheduled_at + make_interval(mins => a.duration_minutes), b.scheduled_at + make_interval(mins => b.duration_minutes)) > now()`))[0].n,
    // Party larger than its table: the engine refuses it (NO_CAPACITY) until it is moved.
    partyLargerThanTable: (await q(`SELECT count(*)::int AS n FROM pos_reservation r JOIN pos_table t ON t.id = r.table_id WHERE r.status = 'CONFIRMED' AND r.party_size > t.capacity AND r.scheduled_at + make_interval(mins => r.duration_minutes) > now()`))[0].n,
    // Started but never seated: carried with their remaining time.
    startedNotSeated: (await q(`SELECT count(*)::int AS n FROM pos_reservation WHERE status = 'CONFIRMED' AND scheduled_at <= now() AND scheduled_at + make_interval(mins => duration_minutes) > now()`))[0].n,
    tablesMarkedReserved: (await q(`SELECT count(*)::int AS n FROM pos_table WHERE status = 'RESERVED'`))[0].n,
    tablesReservedWithoutLiveReservation: (await q(`SELECT count(*)::int AS n FROM pos_table t WHERE t.status = 'RESERVED' AND NOT EXISTS (SELECT 1 FROM pos_reservation r WHERE r.table_id = t.id AND r.status = 'CONFIRMED' AND r.scheduled_at + make_interval(mins => r.duration_minutes) > now())`))[0].n,
    appointmentsByStatus: await q(`SELECT status::text, count(*)::int AS n, count(*) FILTER (WHERE starts_at + make_interval(mins => duration_minutes) > now())::int AS open_or_future FROM pos_appointment GROUP BY 1 ORDER BY 1`),
    // Overlapping open appointments in one outlet: each needs its own professional after activation.
    maxSimultaneousAppointmentsPerOutlet: (await q(`
      SELECT coalesce(max(n), 0)::int AS n FROM (SELECT a.id, count(*) AS n FROM pos_appointment a JOIN pos_appointment b ON a.outlet_id = b.outlet_id
        AND tstzrange(a.starts_at, a.starts_at + make_interval(mins => a.duration_minutes)) && tstzrange(b.starts_at, b.starts_at + make_interval(mins => b.duration_minutes))
       WHERE a.status IN ('SCHEDULED', 'ARRIVED') AND b.status IN ('SCHEDULED', 'ARRIVED') AND a.starts_at + make_interval(mins => a.duration_minutes) > now() GROUP BY a.id) x`))[0].n,
    outletsWithLegacyData: (await q(`SELECT count(DISTINCT outlet_id)::int AS n FROM (SELECT outlet_id FROM pos_reservation UNION ALL SELECT outlet_id FROM pos_appointment) x`))[0].n,
    outlets, blockers,
    linksByMode: hasLink ? await q(`SELECT kind, mode, count(*)::int AS n FROM pos_booking_link GROUP BY 1, 2 ORDER BY 1, 2`) : 'pos_booking_link no existe (migración pendiente)',
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  await client.query('ROLLBACK').catch(() => {})
  await client.end()
}
