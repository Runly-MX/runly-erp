const DEPENDENCY = { turnstile: 'la verificación Turnstile', assignee: 'el responsable del formulario' }

// Plain-language copy for the C-4 publishability states. Nothing here decides
// publishability: the server does; this only explains the answer.
export function describePublishability(publishability) {
  const state = publishability?.state
  const reason = publishability?.reason ?? {}
  if (state === 'publishable') return { tone: 'success', title: 'Se puede publicar', text: 'El propietario está confirmado y el formulario está habilitado.' }
  if (state === 'owner_unresolved') return { tone: 'warning', title: 'Falta confirmar el propietario', text: 'Este formulario es anterior a la propiedad por sitio. Hasta confirmarla no se publica; sus respuestas y datos se conservan.' }
  if (state === 'owner_ambiguous') return { tone: 'danger', title: 'Propietario ambiguo', text: 'Más de un sitio o propiedad podría ser el dueño. No se elige uno automáticamente; hay que resolverlo de forma explícita.' }
  if (state === 'disabled') return { tone: 'neutral', title: 'Formulario deshabilitado', text: 'No recibe envíos ni se publica. Sus respuestas siguen disponibles para consulta autorizada.' }
  if (state === 'dependency_unavailable' || reason.code === 'dependency_unavailable') {
    const what = DEPENDENCY[reason.dependency] ?? 'una dependencia'
    return { tone: 'warning', title: 'Falta una dependencia', text: `No se puede publicar mientras ${what} no esté configurada${reason.dependency === 'assignee' ? ' con un miembro activo de la empresa' : ''}.` }
  }
  if (state === 'not_found') return { tone: 'danger', title: 'Formulario no encontrado', text: 'La referencia ya no existe en esta empresa.' }
  return { tone: 'neutral', title: 'Estado desconocido', text: 'El servidor no informó el estado de publicación.' }
}
