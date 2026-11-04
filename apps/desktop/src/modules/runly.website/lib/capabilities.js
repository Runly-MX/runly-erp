// UI hints derived from the session permissions. They only decide whether a
// control is enabled and why it is not. The server re-checks every command
// (S1) and will replace this source with per-site capabilities (contract C-1);
// consumers only read `can.<name>.allowed` / `.reason`, so swapping the source
// does not change any screen.

export const CAPABILITY_SOURCE = 'derived'

const need = (hasPermission, keys, anyOf = false) => {
  const missing = keys.filter((key) => !hasPermission(key))
  const allowed = anyOf ? missing.length < keys.length : missing.length === 0
  return allowed ? { allowed: true } : { allowed: false, reason: { code: 'permission_denied', requiredPermission: anyOf ? keys[0] : missing[0] } }
}

const UNAVAILABLE = (code) => ({ allowed: false, reason: { code } })

export function buildCapabilities(hasPermission) {
  return {
    siteRead: need(hasPermission, ['website.site.read']),
    siteEdit: need(hasPermission, ['website.site.update']),
    pagesRead: need(hasPermission, ['website.pages.read']),
    pagesCreate: need(hasPermission, ['website.pages.create']),
    pagesUpdate: need(hasPermission, ['website.pages.update']),
    pagesDelete: need(hasPermission, ['website.pages.delete']),
    publish: need(hasPermission, ['website.pages.publish']),
    // Archiving needs update + publish (contracts §2.8).
    archive: need(hasPermission, ['website.site.update', 'website.pages.publish']),
    reserveHostname: need(hasPermission, ['website.domains.manage', 'website.site.update']),
    importZip: need(hasPermission, ['website.dist.upload', 'website.site.update', 'website.pages.publish']),
    previewSite: need(hasPermission, ['website.pages.read', 'website.site.read']),
    previewDraft: need(hasPermission, ['website.pages.read', 'website.site.read', 'website.pages.update']),
    formsRead: need(hasPermission, ['website.forms.read', 'website.pages.read'], true),
    // Backend closed these for new publications until FormScope exists (S3/S4).
    formsPublish: UNAVAILABLE('form_scope_unresolved'),
    calendarPublish: UNAVAILABLE('dynamic_binding_unavailable'),
    customDomain: UNAVAILABLE('feature_unavailable'),
  }
}

export function reasonText(reason) {
  if (!reason) return ''
  if (reason.code === 'permission_denied') return 'Tu rol no incluye este permiso.'
  if (reason.code === 'form_scope_unresolved') return 'Los formularios todavía no se pueden publicar en el sitio.'
  if (reason.code === 'dynamic_binding_unavailable') return 'Calendar todavía no se puede publicar en el sitio.'
  if (reason.code === 'feature_unavailable') return 'Esta función todavía no está disponible.'
  if (reason.code === 'isolation_required') return 'Esta instalación todavía no tiene configurado el dominio aislado de vistas previas. Pide al administrador que lo active.'
  if (reason.code === 'namespace_unavailable') return 'Esta instalación todavía no tiene configurada la dirección base de los sitios.'
  if (reason.code === 'lifecycle_state') return 'El sitio está archivado. Restáuralo para usar esta función.'
  if (reason.code === 'loading') return 'Cargando…'
  return 'No disponible por ahora.'
}
