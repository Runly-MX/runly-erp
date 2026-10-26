import { useAuth } from '../../../../auth/AuthProvider.jsx'

// Effective permissions for creating templates (no template row yet). Per-template
// actions always use the row flags canEdit / canDelete / canPublish from the API.
export function useTemplatePermissions() {
  const { userProfile } = useAuth()
  const permissions = userProfile?.permissions ?? []
  const has = key => Boolean(userProfile?.isAdmin || permissions.includes(key))
  return { canSavePersonal: has('studio.templates.manage'), canSaveCompany: has('studio.templates.publish'), canUse: has('studio.create') }
}

export const SCOPE_LABELS = { runly: 'Runly', personal: 'Mía', company: 'Empresa' }

// Readable message for the template API errors the UI can act on.
export function templateErrorMessage(error) {
  if (error?.status === 409) return 'Alguien actualizó esta plantilla mientras la editabas. Tus cambios siguen aquí: carga la versión actual y vuelve a guardar.'
  if (error?.status === 403) return 'No tienes permiso para esta acción con la plantilla.'
  if (error?.status === 404) return 'La plantilla ya no está disponible o fue retirada.'
  if (/file|archivo|imagen/i.test(error?.message ?? '')) return `${error.message} Revisa que las imágenes del diseño sigan disponibles en Files.`
  return error?.message || 'No se pudo completar la operación.'
}
