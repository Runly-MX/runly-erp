// Representative "source" installation for the backup/restore rehearsal: the certified schema on a disposable Supabase,
// two companies with users/roles/memberships/permissions, Storage objects of several kinds in public and private buckets,
// notes and file records that reference them, an installed custom module (files and a table), an installation-specific
// database role, and integration data that a restore must not be allowed to use (URLs, webhooks, push, FCM, OAuth,
// SMTP, automations, queued deliveries, clear-text credentials). Every secret in here is generated for this run.
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { command } from '../../fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from '../../fixtures/studio/supabase-data.mjs'

const require = createRequire(resolve('apps/api/package.json'))
const sharp = require('sharp')
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export async function seedRepresentativeSource(stack, { apiImage, directory, jwtSecret }) {
  const { users, companies, admin } = await seedStudioScenario(stack)
  const [company] = companies, owner = users[0]
  const query = (sql, params) => stack.pool.query(sql, params)
  await query("UPDATE public.runly_module SET enabled = true, status = 'INSTALLED' WHERE key IN ('runly.notes', 'runly.files', 'runly.studio')")
  await query("INSERT INTO public.role_permission(id, role_id, permission_id) SELECT uuidv7(), $1, id FROM public.permission WHERE key LIKE 'notes.%' ON CONFLICT DO NOTHING", [company.roleId])
  const witness = `REHEARSAL-WITNESS-${randomBytes(12).toString('hex')}`

  // Notes and the objects they reference. Notes buckets stay PUBLIC here: this is the state of an instance that has not
  // been through the Storage hardening yet (no restrictive policy, no guard), which is the instance we must be able to restore.
  const notes = []
  for (const title of [`Nota con imagen ${witness.slice(-6)}`, 'Nota sin adjuntos']) {
    notes.push((await query('INSERT INTO public.notes(company_id, owner_user_id, title, content) VALUES ($1, $2, $3, $4::jsonb) RETURNING id', [company.id, owner.id, title, JSON.stringify(`<p>${witness}</p>`)])).rows[0])
  }
  const png = await sharp({ create: { width: 48, height: 48, channels: 4, background: '#0ea5e9' } }).png().toBuffer()
  const jpg = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#f97316' } }).jpeg().toBuffer()
  const prefix = `companies/${company.id}`
  const objects = [
    { bucket: 'runly-notes', public: true, name: `${prefix}/notes/${notes[0].id}/foto.png`, bytes: png, type: 'image/png' },
    { bucket: 'runly-notes', public: true, name: `${prefix}/notes/${notes[0].id}/Plano tecnico (v2) + indice.pdf`, bytes: Buffer.concat([Buffer.from(`%PDF-1.4 ${witness}\n`), randomBytes(200_000)]), type: 'application/pdf' },
    { bucket: 'atlas-notes', public: true, name: `legacy/${notes[0].id}/old.png`, bytes: png, type: 'image/png' },
    { bucket: 'runly-files', public: false, name: `${prefix}/files/reporte-anual.bin`, bytes: randomBytes(3_000_000), type: 'application/octet-stream' },
    { bucket: 'runly-files', public: false, name: `${prefix}/files/vacio.txt`, bytes: Buffer.alloc(0), type: 'text/plain' },
    { bucket: 'runly-files', public: false, name: `${prefix}/files/testigo.txt`, bytes: Buffer.from(`${witness}\n`), type: 'text/plain' },
    { bucket: 'runly-avatars', public: true, name: `avatars/${owner.id}.jpg`, bytes: jpg, type: 'image/jpeg' },
  ]
  for (const bucket of new Set(objects.map(o => o.bucket))) {
    const created = await admin.storage.createBucket(bucket, { public: objects.find(o => o.bucket === bucket).public })
    if (created.error) throw Error(`bucket ${bucket}: ${created.error.message}`)
  }
  for (const object of objects) {
    const uploaded = await admin.storage.from(object.bucket).upload(object.name, object.bytes, { contentType: object.type, upsert: false })
    if (uploaded.error) throw Error(`upload ${object.bucket}: ${uploaded.error.message}`)
    object.sha256 = sha256(object.bytes)
  }
  for (const object of objects.filter(o => o.bucket.endsWith('-notes') && o.type.startsWith('image/') || o.name.endsWith('.pdf'))) {
    await query('INSERT INTO public.note_image_binding(note_id, bucket, object_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [notes[0].id, object.bucket, object.name])
  }
  for (const object of objects.filter(o => o.bucket === 'runly-files')) {
    await query(`INSERT INTO public.file_asset(bucket, object_key, original_name, mime_type, size_bytes, checksum, module_key, entity_type, entity_id, uploaded_by_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'runly.files', 'company', $7, $8, now())`, [object.bucket, object.name, object.name.split('/').at(-1), object.type, object.bytes.length, object.sha256, company.id, owner.id])
  }

  // An installed custom module: sources on disk (with a transient folder that must not be backed up) and tables in the database.
  const modulesDirectory = join(directory, 'custom-modules')
  const moduleRoot = join(modulesDirectory, 'custom.rehearsal')
  await mkdir(join(moduleRoot, 'api'), { recursive: true }); await mkdir(join(moduleRoot, 'data'), { recursive: true }); await mkdir(join(modulesDirectory, '.staging'), { recursive: true })
  await writeFile(join(moduleRoot, 'module.manifest.js'), `export default { key: 'custom.rehearsal', name: 'Rehearsal', version: '1.0.0', witness: '${witness}' }\n`)
  await writeFile(join(moduleRoot, 'api', 'index.js'), 'export default () => {}\n')
  await writeFile(join(moduleRoot, 'data', 'catalogo.json'), JSON.stringify({ items: Array.from({ length: 20 }, (_, i) => ({ i, v: randomBytes(4).toString('hex') })) }))
  await writeFile(join(modulesDirectory, '.staging', 'transient.tmp'), 'must not be backed up')
  await query(`INSERT INTO public.runly_module SELECT (jsonb_populate_record(NULL::public.runly_module, to_jsonb(m) || jsonb_build_object('id', uuidv7()::text, 'key', 'custom.rehearsal', 'name', 'Rehearsal', 'status', 'INSTALLED'))).* FROM public.runly_module m WHERE m.key = 'runly.notes'`)
  await query('CREATE TABLE public.cm_rehearsal_item (id uuid PRIMARY KEY DEFAULT uuidv7(), name text, qty integer)')
  await query("INSERT INTO public.cm_rehearsal_item(name, qty) SELECT 'item ' || g, g FROM generate_series(1, 250) g")
  // An integration table that is NOT in Runly's own schema: the generic audit must catch what no list knows about.
  await query('CREATE TABLE public.cm_rehearsal_hook (id uuid PRIMARY KEY DEFAULT uuidv7(), name text, callback_url text, api_key text)')
  await query("INSERT INTO public.cm_rehearsal_hook(name, callback_url, api_key) VALUES ('crm', 'https://crm.example.test/hooks/in', $1)", [`sk_live_${randomBytes(16).toString('hex')}`])

  // An installation-specific role with a password, and a grant that depends on it (pg_dump keeps the GRANT, not the role).
  const rolePassword = randomBytes(12).toString('hex')
  await query(`CREATE ROLE runly_rehearsal_reader NOLOGIN`)
  await query(`CREATE ROLE runly_rehearsal_login LOGIN PASSWORD '${rolePassword}'`)
  await query('GRANT SELECT ON public.cm_rehearsal_item TO runly_rehearsal_reader')
  await query('GRANT runly_rehearsal_reader TO runly_rehearsal_login')

  // Integration data. Reserved test domains only; nothing here can resolve outside the machine.
  const encrypt = plaintext => command('docker', ['run', '--rm', '-e', 'JWT_SECRET', '-e', 'PLAINTEXT', '--entrypoint', 'node', apiImage, '--input-type=module', '-e',
    "import { encryptPassword } from '/app/apps/api/src/services/smtp-service.js'; process.stdout.write(encryptPassword(process.env.PLAINTEXT))"],
  { env: { ...process.env, JWT_SECRET: jwtSecret, PLAINTEXT: plaintext } })
  const smtpPassword = `smtp-${randomBytes(10).toString('hex')}`
  const smtpCiphertext = await encrypt(smtpPassword)
  for (const [key, value] of [['smtp.host', 'smtp.example.test'], ['smtp.port', '587'], ['smtp.user', 'mailer@example.test'], ['smtp.pass', smtpCiphertext], ['smtp.from_email', 'no-reply@example.test'], ['integration.crm.api_key', `sk_live_${randomBytes(16).toString('hex')}`]]) {
    await query('INSERT INTO public.instance_config(key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value])
  }
  await query(`INSERT INTO public.system_automation(company_id, key, label, enabled, definition, webhook_token) VALUES ($1, 'rehearsal.outbound', 'Aviso externo', true, $2::jsonb, $3)`,
    [company.id, JSON.stringify({ steps: [{ type: 'http', url: 'https://hooks.example.test/inbound/abc', headers: { Authorization: `Bearer ${randomBytes(16).toString('hex')}` } }] }), `wh_${randomBytes(12).toString('hex')}`])
  await query("INSERT INTO public.automation_schedule(company_id, module_key, automation_key, next_run_at) VALUES ($1, 'runly.notes', 'rehearsal.outbound', now() + interval '1 hour')", [company.id])
  await query("INSERT INTO public.automation_webhook_event(company_id, automation_key, payload, source_ip) VALUES ($1, 'rehearsal.outbound', '{\"hello\":\"world\"}'::jsonb, '203.0.113.7')", [company.id])
  const notification = (await query("INSERT INTO public.notification(user_id, company_id, title, updated_at) VALUES ($1, $2, 'Aviso en cola', now()) RETURNING id", [owner.id, company.id])).rows[0]
  await query("INSERT INTO public.notification_delivery(notification_id, channel, status, updated_at) VALUES ($1, 'email', 'queued', now())", [notification.id])
  await query("INSERT INTO public.push_subscription(user_id, company_id, endpoint, p256dh, auth, updated_at) VALUES ($1, $2, $3, $4, $5, now())",
    [owner.id, company.id, `https://push.example.test/send/${randomBytes(12).toString('hex')}`, randomBytes(32).toString('base64url'), randomBytes(16).toString('base64url')])
  await query('INSERT INTO public.fcm_device_token(user_id, company_id, token, updated_at) VALUES ($1, $2, $3, now())', [owner.id, company.id, `fcm-${randomBytes(40).toString('hex')}`])
  await query(`INSERT INTO public.google_calendar_connection(user_id, google_subject, google_email, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes, updated_at)
    VALUES ($1, 'sub-rehearsal', 'persona@example.test', $2, $3, now() + interval '1 hour', '[]'::jsonb, now())`, [owner.id, randomBytes(48).toString('base64'), randomBytes(48).toString('base64')])

  return { users, companies, admin, notes, objects, witness, modulesDirectory, smtp: { plaintext: smtpPassword, ciphertext: smtpCiphertext }, rolePassword }
}
