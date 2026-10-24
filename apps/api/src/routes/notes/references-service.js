import { EXTERNAL_RELATION_TARGETS } from '@runly/module-compiler'

export const ALLOWED_TYPES = Object.keys(EXTERNAL_RELATION_TARGETS)
export const MAX_REFERENCES_PER_NOTE = 50

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SPAN_RE = /<span\b[^>]*>/gi

function attr(tag, name) {
  const match = tag.match(new RegExp(String.raw`\s${name}\s*=\s*"([^"]*)"`, 'i'))
  return match ? match[1] : null
}

// Pulls unique { entityType, recordId } pairs out of the editor HTML. The HTML
// is client-provided, so every pair is validated (known type, UUID) and capped.
export function extractEntityReferences(html) {
  if (typeof html !== 'string' || !html) return []
  const seen = new Set()
  const refs = []
  for (const tag of html.match(SPAN_RE) ?? []) {
    if (attr(tag, 'data-type') !== 'entity-reference') continue
    const entityType = attr(tag, 'data-entity-type')
    const recordId = attr(tag, 'data-record-id')?.toLowerCase()
    if (!entityType || !ALLOWED_TYPES.includes(entityType)) continue
    if (!recordId || !UUID_RE.test(recordId)) continue
    const key = `${entityType}:${recordId}`
    if (seen.has(key)) continue
    seen.add(key)
    refs.push({ entityType, recordId })
    if (refs.length >= MAX_REFERENCES_PER_NOTE) break
  }
  return refs
}

export function createNoteReferencesService({ prisma }) {
  // Replaces the note's reference rows with the ones present in `html`.
  async function syncReferences({ noteId, companyId, html }) {
    const refs = extractEntityReferences(html)
    const types = refs.map((r) => r.entityType)
    const ids = refs.map((r) => r.recordId)
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM note_references nr
        WHERE nr.note_id = ${noteId}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM unnest(${types}::text[], ${ids}::uuid[]) AS keep(entity_type, record_id)
            WHERE keep.entity_type = nr.entity_type AND keep.record_id = nr.record_id
          )
      `
      if (refs.length) {
        await tx.$executeRaw`
          INSERT INTO note_references (note_id, company_id, entity_type, record_id)
          SELECT ${noteId}::uuid, ${companyId ?? null}::uuid, r.entity_type, r.record_id
          FROM unnest(${types}::text[], ${ids}::uuid[]) AS r(entity_type, record_id)
          ON CONFLICT DO NOTHING
        `
      }
    })
    return refs.length
  }

  // Notes referencing a record that the user can open. Same access guard as
  // listNotes: company scope, not trashed/deleted, runly_note_user_access, and
  // owner-or-share.
  async function listNotesByRecord({ userId, companyId, entityType, recordId }) {
    return prisma.$queryRaw`
      SELECT n.id, n.title, n.icon, n.note_type, n.updated_at
      FROM note_references nr
      JOIN notes n ON n.id = nr.note_id
      LEFT JOIN note_shares ns_mine
        ON ns_mine.note_id = n.id
        AND ns_mine.shared_with_user_id = ${userId}::uuid
      WHERE nr.entity_type = ${entityType}
        AND nr.record_id = ${recordId}::uuid
        AND nr.company_id IS NOT DISTINCT FROM ${companyId ?? null}::uuid
        AND (n.company_id = ${companyId ?? null}::uuid OR n.company_id IS NULL OR ns_mine.external_access)
        AND n.deleted_at IS NULL
        AND n.is_trashed = FALSE
        AND public.runly_note_user_access(n.id, ${userId}::uuid, false)
        AND (n.owner_user_id = ${userId}::uuid OR ns_mine.id IS NOT NULL)
      ORDER BY n.updated_at DESC
      LIMIT 50
    `
  }

  return { syncReferences, listNotesByRecord }
}
