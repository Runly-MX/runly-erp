import { collectNoteImageReferences, parseNoteImageReference } from './image-references.js'
import { noteImageBytes } from './image-bytes.js'
import { createHash } from 'node:crypto'

export function createNoteImageService({ prisma, supabaseAdmin }) {
  function deny(status = 404) { throw Object.assign(new Error('Imagen no disponible.'), { status }) }

  async function load(noteId, { userId = null, slug = null } = {}) {
    const [note] = await prisma.$queryRaw`
      SELECT n.*, y.state, s.files,
        CASE WHEN ${userId}::uuid IS NULL THEN false
          ELSE public.runly_note_user_access(n.id, ${userId}::uuid, true) END AS can_edit
      FROM notes n LEFT JOIN note_ydoc_state y ON y.note_id=n.id
      LEFT JOIN note_canvas_scene s ON s.note_id=n.id
      WHERE (${noteId}::uuid IS NULL OR n.id=${noteId}::uuid)
        AND n.deleted_at IS NULL AND NOT n.is_trashed
        AND ((${slug}::text IS NOT NULL AND n.public_slug=${slug} AND n.is_public
              AND public.notes_realtime_is_public(n.id))
          OR (${slug}::text IS NULL AND ${userId}::uuid IS NOT NULL
              AND public.runly_note_user_access(n.id,${userId}::uuid,false)))
      LIMIT 1`
    if (!note) deny()
    return note
  }

  async function bindUploaded(noteId, bucket, key) {
    await prisma.$executeRaw`INSERT INTO note_image_binding(note_id,bucket,object_key)
      VALUES(${noteId}::uuid,${bucket},${key}) ON CONFLICT DO NOTHING`
  }

  async function bindManyUploaded(noteId, refs) {
    if (!refs.length) return
    await prisma.$executeRaw`INSERT INTO note_image_binding(note_id,bucket,object_key)
      SELECT ${noteId}::uuid,ref.bucket,ref.key FROM jsonb_to_recordset(${JSON.stringify(refs)}::jsonb) AS ref(bucket text,key text)
      ON CONFLICT DO NOTHING`
  }

  function matchesCompany(note, key) {
    const company = key.match(/^companies\/([^/]+)\/notes\//)?.[1]
    return company ? company === note.company_id : key.startsWith('notes/')
  }

  async function bindReference(note, ref, userId, persist = true) {
    if (!matchesCompany(note, ref.key)) deny()
    const ownPrefix = note.company_id ? `companies/${note.company_id}/notes/${note.id}/` : `notes/${note.owner_user_id}/${note.id}/`
    const ownDraft = note.company_id ? `companies/${note.company_id}/notes/draft/${userId}/` : `notes/${userId}/draft/`
    let allowed = ref.key.startsWith(ownPrefix) || ref.key.startsWith(ownDraft)
    if (!allowed) {
      const [source] = await prisma.$queryRaw`
        SELECT 1 FROM note_image_binding b JOIN notes n ON n.id=b.note_id
        WHERE b.bucket=${ref.bucket} AND b.object_key=${ref.key}
          AND n.company_id IS NOT DISTINCT FROM ${note.company_id}::uuid
          AND public.runly_note_user_access(n.id,${userId}::uuid,false) LIMIT 1`
      allowed = Boolean(source)
    }
    if (!allowed) deny()
    if (persist) await bindUploaded(note.id, ref.bucket, ref.key)
  }

  async function validateNewReferences({ companyId, userId, content }) {
    const refs = collectNoteImageReferences({ content })
    for (const ref of refs) await bindReference({ id: null, company_id: companyId ?? null, owner_user_id: userId }, ref, userId, false)
    return refs
  }

  async function resolve(raw, context) {
    const ref = parseNoteImageReference(raw)
    if (!ref) deny()
    const note = await load(context.noteId ?? null, context)
    const references = collectNoteImageReferences(note)
    const referenced = references.some(r => r.bucket === ref.bucket && r.key === ref.key)
    if (context.slug && !referenced) deny()
    const [binding] = await prisma.$queryRaw`SELECT 1 FROM note_image_binding
      WHERE note_id=${note.id}::uuid AND bucket=${ref.bucket} AND object_key=${ref.key}`
    // Reading/publishing a collaborator's document must never grant access to
    // another note on behalf of its owner. Only explicit authored attachment
    // operations establish new bindings.
    if (!binding) deny()
    const { data, error } = await supabaseAdmin.storage.from(ref.bucket).download(ref.key)
    if (error || !data) deny(503)
    if (data.size > 20 * 1024 * 1024) deny(413)
    const bytes = Buffer.from(await data.arrayBuffer())
    return noteImageBytes(bytes)
  }

  async function bindForPublication(noteId, userId) {
    const note = await load(noteId, { userId })
    if (note.owner_user_id !== userId) deny()
    for (const ref of collectNoteImageReferences(note)) {
      const [bound] = await prisma.$queryRaw`SELECT 1 FROM note_image_binding
        WHERE note_id=${noteId}::uuid AND bucket=${ref.bucket} AND object_key=${ref.key}`
      if (!bound) deny(409)
    }
  }

  async function attachReferences(noteId, userId, sources) {
    if (!Array.isArray(sources) || sources.length > 50) deny(400)
    const note = await load(noteId, { userId })
    if (!note.can_edit) deny(403)
    const refs = []
    for (const source of sources) {
      const ref = parseNoteImageReference(source)
      if (!ref) deny(400)
      await bindReference(note, ref, userId, false)
      refs.push(ref)
    }
    await prisma.$transaction(async tx => {
      const scoped = createNoteImageService({ prisma: tx, supabaseAdmin })
      await scoped.bindManyUploaded(noteId, refs)
    })
  }

  async function readForCopy(raw, userId, companyId) {
    const ref = parseNoteImageReference(raw)
    if (!ref) deny()
    const [source] = await prisma.$queryRaw`SELECT n.id FROM note_image_binding b JOIN notes n ON n.id=b.note_id
      WHERE b.bucket=${ref.bucket} AND b.object_key=${ref.key}
        AND n.company_id IS NOT DISTINCT FROM ${companyId ?? null}::uuid
        AND public.runly_note_user_access(n.id,${userId}::uuid,false) LIMIT 1`
    if (!source) deny()
    return resolve(raw, { noteId: source.id, userId })
  }

  // Runs once against the existing persisted references, before closing buckets.
  // No document, CRDT byte, object, name or derivative is changed.
  async function inventoryLegacy({ dryRun = false } = {}) {
    const notes = await prisma.$queryRaw`SELECT n.*,y.state,s.files FROM notes n
      LEFT JOIN note_ydoc_state y ON y.note_id=n.id LEFT JOIN note_canvas_scene s ON s.note_id=n.id`
    const bindings = [], problems = []
    for (const note of notes) for (const ref of collectNoteImageReferences(note)) {
      if (!matchesCompany(note, ref.key)) problems.push({ noteId: note.id, reason: 'ASSET_COMPANY_MISMATCH' })
      else if (ref.key.startsWith('notes/') && !ref.key.startsWith(`notes/${note.owner_user_id}/`)) problems.push({ noteId: note.id, reason: 'LEGACY_PERSONAL_SOURCE_REQUIRES_REVIEW' })
      else bindings.push({ note, ref })
    }
    // A draft has no historical owner in its company path. Shared references
    // across owners require explicit review instead of guessing ownership.
    const owners = new Map()
    for (const { note, ref } of bindings) {
      const key = `${ref.bucket}/${ref.key}`
      if (!owners.has(key)) owners.set(key, new Set())
      owners.get(key).add(note.owner_user_id)
    }
    for (const { note, ref } of bindings) {
      if (ref.key.includes('/draft/') && owners.get(`${ref.bucket}/${ref.key}`).size > 1)
        problems.push({ noteId: note.id, reason: 'AMBIGUOUS_LEGACY_DRAFT' })
      const origin = ref.key.match(/\/notes\/([0-9a-f-]{36})\//i)?.[1]
        ?? ref.key.match(/^notes\/[^/]+\/([0-9a-f-]{36})\//i)?.[1]
      if (origin && origin !== note.id) {
        const source = notes.find(n => n.id === origin)
        if (!source || source.owner_user_id !== note.owner_user_id || source.company_id !== note.company_id)
          problems.push({ noteId: note.id, reason: 'LEGACY_SOURCE_REQUIRES_REVIEW' })
      }
    }
    const report = { notes: notes.length, references: bindings.length, problems,
      ...(dryRun ? { entries: bindings.map(({ note, ref }) => ({ noteId: note.id, bucket: ref.bucket, key: ref.key })) } : {}) }
    const objects = await prisma.$queryRaw`SELECT bucket_id,name FROM storage.objects WHERE bucket_id IN ('runly-notes','atlas-notes')`
    const available = new Set(objects.map(o => `${o.bucket_id}/${o.name}`))
    const verified = new Map()
    for (const { note, ref } of bindings) if (!available.has(`${ref.bucket}/${ref.key}`))
      problems.push({ noteId: note.id, reason: 'REFERENCED_OBJECT_MISSING' })
    for (const { note, ref } of bindings) {
      const id = `${ref.bucket}/${ref.key}`
      if (!available.has(id) || verified.has(id)) continue
      try {
        const { data, error } = await supabaseAdmin.storage.from(ref.bucket).download(ref.key)
        if (error || !data || data.size > 20 * 1024 * 1024) throw Error('Object unavailable')
        const bytes = Buffer.from(await data.arrayBuffer())
        const rendered = await noteImageBytes(bytes)
        verified.set(id, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), renderedMime: rendered.mime })
      } catch { problems.push({ noteId: note.id, reason: 'OBJECT_BYTES_UNAVAILABLE_OR_UNSUPPORTED' }) }
    }
    if (dryRun) report.objects = [...verified].map(([object, info]) => ({ object, ...info }))
    if (problems.length || dryRun) return report
    await prisma.$transaction(async tx => {
      for (const { note, ref } of bindings) await tx.$executeRaw`
        INSERT INTO note_image_binding(note_id,bucket,object_key) VALUES(${note.id}::uuid,${ref.bucket},${ref.key}) ON CONFLICT DO NOTHING`
      await tx.$executeRaw`INSERT INTO note_image_storage_state(id,inventory) VALUES(true,${JSON.stringify(report)}::jsonb) ON CONFLICT DO NOTHING`
    }, { timeout: 30000 })
    return report
  }

  return { resolve, load, bindUploaded, bindManyUploaded, bindForPublication, inventoryLegacy, validateNewReferences, attachReferences, readForCopy }
}
