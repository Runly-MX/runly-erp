// Display state derived from fields the backend already returns (S2/S3).
// Nothing here is authoritative: `hasPending` compares revisions and is an
// approximation until the backend ships `hasUnpublishedChanges` (contract C-2).

export const LIFECYCLE_LABEL = {
  draft: 'Borrador (sin publicar)',
  published: 'Publicado',
  unpublished: 'Retirado',
  maintenance: 'En mantenimiento',
  archived: 'Archivado',
}

// activeRelease may be null/undefined while it loads or when nothing is published.
export function deriveSiteState(site, activeRelease) {
  if (!site) return { key: 'unknown', label: 'Cargando…', tone: 'neutral', hasPending: null, approximate: true }
  const lifecycle = site.lifecycle ?? 'draft'
  const legacyPublished = site.releaseManaged === false && site.status === 'published'
  if (lifecycle === 'archived') return { key: 'archived', label: LIFECYCLE_LABEL.archived, tone: 'neutral', hasPending: false, approximate: false }
  if (lifecycle === 'maintenance') return { key: 'maintenance', label: LIFECYCLE_LABEL.maintenance, tone: 'brand', hasPending: null, approximate: true }
  if (lifecycle === 'unpublished') return { key: 'unpublished', label: LIFECYCLE_LABEL.unpublished, tone: 'neutral', hasPending: null, approximate: true }
  if (site.activeReleaseId) {
    if (!activeRelease) return { key: 'published', label: LIFECYCLE_LABEL.published, tone: 'success', hasPending: null, approximate: true }
    const pending = Number(site.draftRevision ?? 0) > Number(activeRelease.draftRevision ?? 0)
    return pending
      ? { key: 'published_pending', label: 'Publicado · cambios sin publicar', tone: 'warning', hasPending: true, approximate: true }
      : { key: 'published', label: LIFECYCLE_LABEL.published, tone: 'success', hasPending: false, approximate: true }
  }
  if (legacyPublished) return { key: 'legacy_published', label: 'Publicado (versión histórica)', tone: 'success', hasPending: null, approximate: true }
  return { key: 'draft', label: LIFECYCLE_LABEL.draft, tone: 'neutral', hasPending: null, approximate: false }
}

// Three levels shown in the editor bar. `local` (unsaved edits) cannot be
// reported: atlas-web-builder 0.2.4 exposes no onChange/onDirtyChange/markSaved,
// so we never claim it. The bar therefore shows save status + the other two.
export function deriveEditorStatus({ saveState, savedAt, siteState }) {
  const draftLevel = siteState?.hasPending === true
    ? { label: 'Guardado · pendiente de publicar', tone: 'warning' }
    : siteState?.hasPending === false
      ? { label: 'Guardado · al día con lo publicado', tone: 'success' }
      : { label: 'Borrador', tone: 'neutral' }
  const publishedLevel = ['published', 'published_pending', 'legacy_published'].includes(siteState?.key)
    ? { label: 'Publicado', tone: 'success' }
    : siteState?.key === 'unpublished'
      ? { label: 'Retirado', tone: 'neutral' }
      : { label: 'Sin publicar', tone: 'neutral' }
  const save = {
    idle: { label: 'Sin cambios guardados en esta sesión', tone: 'neutral' },
    saving: { label: 'Guardando…', tone: 'brand' },
    saved: { label: 'Guardado', tone: 'success' },
    error: { label: 'No se pudo guardar', tone: 'danger' },
    conflict: { label: 'Conflicto al guardar', tone: 'warning' },
    offline: { label: 'Sin conexión', tone: 'warning' },
  }[saveState] ?? { label: '', tone: 'neutral' }
  return { save: { ...save, at: savedAt ?? null }, draft: draftLevel, published: publishedLevel }
}
