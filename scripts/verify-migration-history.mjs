// Replays the two historical variants only inside a newly created local container.
// Never reads .env, DATABASE_URL, or deployment credentials.
import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import pg from 'pg'

const name = `runly-migration-history-${randomBytes(6).toString('hex')}`
const password = randomBytes(24).toString('hex')
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) throw Error(`${command} failed: ${result.stderr}`)
  return result.stdout.trim()
}
const migration = name => `prisma/migrations/${name}/migration.sql`
const chatName = '20260902000000_chat_message_search'
const notesName = '20260911120000_notes_realtime_authorization'
const original = (revision, name) => run('git', ['show', `${revision}:${migration(name)}`]) + '\n'
const chatOld = original('89613ccc', chatName), notesOld = original('9e53c73d', notesName)
const chatNew = await readFile(migration(chatName), 'utf8'), notesNew = await readFile(migration(notesName), 'utf8')
const checks = []
// Proposed repair only, deliberately outside prisma/migrations. The extension
// namespace comes from the catalog and identifiers/literals are quoted by PG.
const candidateRepair = `DO $repair$
DECLARE extension_schema text;
BEGIN
  SELECT n.nspname INTO STRICT extension_schema FROM pg_extension e
    JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='unaccent';
  EXECUTE pg_catalog.format(
    'CREATE OR REPLACE FUNCTION public.atlas_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path=pg_catalog AS %L',
    pg_catalog.format('SELECT %I.unaccent(%L::regdictionary, $1)', extension_schema,
      pg_catalog.format('%I.unaccent', extension_schema)));
END $repair$;`
let client, started = false
try {
  run('docker', ['run', '--pull=never', '--rm', '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', `POSTGRES_PASSWORD=${password}`, 'postgres:18'])
  started = true
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], { stdio: 'ignore' }).status === 0) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  const port = run('docker', ['port', name, '5432/tcp']).match(/:(\d+)$/)[1]
  client = new pg.Client({ connectionString: `postgresql://postgres:${password}@127.0.0.1:${port}/postgres` })
  await client.connect()
  // Both histories converge after the already existing forward search_path fix.
  await client.query('CREATE EXTENSION pg_trgm; CREATE EXTENSION unaccent; CREATE SCHEMA extensions')
  let previous
  for (const [variant, sql] of [['original', chatOld], ['current', chatNew]]) {
    await client.query('CREATE TABLE chat_messages(body text); CREATE TABLE user_profile(display_name text); CREATE TABLE chat_attachments(file_name text)')
    if (variant === 'original') {
      // PG18 evaluates index expressions under a restricted search_path. The
      // original wrapper can fail even with unaccent installed in public.
      await assert.rejects(client.query(sql), { code: '42704' })
      checks.push('chat original full replay fails 42704 during index creation on PG18; current SET search_path repairs fresh replay')
      await client.query(sql.slice(0, sql.indexOf('CREATE INDEX')))
    } else await client.query(sql)
    await client.query("ALTER FUNCTION public.atlas_unaccent(text) SET search_path = public, pg_catalog")
    if (variant === 'original') await client.query(sql.slice(sql.indexOf('CREATE INDEX')))
    await client.query('INSERT INTO chat_messages(body) VALUES ($1)', ['\u00c1rbol \u00d1and\u00fa'])
    const state = (await client.query("SELECT body_norm, (SELECT proconfig FROM pg_proc WHERE oid='public.atlas_unaccent(text)'::regprocedure) AS config FROM chat_messages")).rows[0]
    assert.equal(state.body_norm, 'arbol nandu')
    if (previous) assert.deepEqual(state, previous)
    previous = state
    checks.push(`chat ${variant}: generated normalization and indexes work; forward state converges`)
    await client.query(candidateRepair)
    await client.query(candidateRepair)
    assert.equal((await client.query('SELECT public.atlas_unaccent($1) AS value', ['\u00c1rbol'])).rows[0].value, 'Arbol')
    await client.query('DROP TABLE chat_messages, user_profile, chat_attachments; DROP FUNCTION public.atlas_unaccent(text)')
  }
  // Reproduce the separate portability limitation without changing tracked SQL.
  await client.query('ALTER EXTENSION unaccent SET SCHEMA extensions; SET search_path=public,extensions')
  await client.query('CREATE TABLE chat_messages(body text); CREATE TABLE user_profile(display_name text); CREATE TABLE chat_attachments(file_name text)')
  await client.query(chatNew)
  await client.query('ALTER FUNCTION public.atlas_unaccent(text) SET search_path = public, pg_catalog')
  await assert.rejects(client.query('SELECT public.atlas_unaccent($1)', ['\u00c1rbol']), { code: '42704' })
  // Candidate repair: qualify extension objects from pg_extension, never assume a namespace.
  const { rows: [{ schema }] } = await client.query("SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE extname='unaccent'")
  assert.equal(schema, 'extensions')
  await client.query(candidateRepair)
  await client.query(candidateRepair)
  assert.equal((await client.query('SELECT public.atlas_unaccent($1) AS value', ['\u00c1rbol'])).rows[0].value, 'Arbol')
  checks.push('unaccent in extensions: existing forward fix fails 42704; catalog-qualified candidate works in public/extensions and is repeatable (not a production migration)')
  await client.query('DROP TABLE chat_messages, user_profile, chat_attachments; DROP FUNCTION public.atlas_unaccent(text); RESET search_path')
  await client.query(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE realtime_owner; CREATE ROLE migration_user;
    CREATE SCHEMA auth; CREATE SCHEMA realtime;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('fixture.uid',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('fixture.role',true) $$;
    CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('fixture.topic',true) $$;
    CREATE TABLE realtime.messages(id int); ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE realtime.messages OWNER TO realtime_owner;
    GRANT USAGE ON SCHEMA realtime TO migration_user;
    CREATE TABLE public.user_profile(id uuid,auth_user_id uuid);
    CREATE TABLE public.notes(id uuid,owner_user_id uuid,is_public boolean);
    CREATE TABLE public.note_shares(note_id uuid,shared_with_user_id uuid,permission text);`)
  await client.query('SET ROLE migration_user')
  await assert.rejects(client.query('ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY'), { code: '42501' })
  await client.query('RESET ROLE')
  checks.push('nonowner ALTER TABLE fails 42501 even when RLS is already enabled; policy ownership exception belongs to Supabase supautils')
  let policies
  for (const [variant, sql] of [['original', notesOld], ['current', notesNew]]) {
    await client.query(sql)
    await client.query(await readFile(migration('20260911130000_notes_realtime_authorization_fix'), 'utf8'))
    const state = (await client.query("SELECT policyname,cmd,roles,qual,with_check FROM pg_policies WHERE schemaname='realtime' ORDER BY policyname")).rows
    assert.equal(state.length, 4)
    assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid='realtime.messages'::regclass")).rows[0].relrowsecurity, true)
    if (policies) assert.deepEqual(state, policies)
    policies = state
    checks.push(`notes ${variant}: RLS enabled and four policies converge after existing forward migration`)
    for (const policy of state) await client.query(`DROP POLICY "${policy.policyname}" ON realtime.messages`)
  }
  const evidence = { passed: true, postgres: (await client.query('SHOW server_version')).rows[0].server_version,
    originalChecksums: Object.fromEntries([[chatName, chatOld], [notesName, notesOld]].map(([name, sql]) => [name, createHash('sha256').update(sql).digest('hex')])), checks }
  await mkdir('.artifacts/studio', { recursive: true })
  await writeFile('.artifacts/studio/migration-history-result.json', JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  await client?.end()
  if (started) run('docker', ['stop', name])
}
