// Pure helpers for course share links, external guests, free lessons and the
// course page promo video. Browser storage is always wrapped in try/catch.

export const SCOPE_OPTIONS = [
  { value: 'all', label: 'Todo el curso', description: 'Todas las lecciones, excepto tareas.' },
  { value: 'preview', label: 'Solo lecciones marcadas como vista previa', description: 'Lecciones marcadas como vista previa y las de secciones gratis.' },
]

const GUEST_KEY = (shareToken) => `runly.lms.guest.${shareToken}`
const HERO_THEATER_KEY = 'runly.lms.heroTheater'

export function readGuestToken(shareToken, storage = globalThis.localStorage) {
  if (!shareToken) return null
  try { return storage?.getItem(GUEST_KEY(shareToken)) || null } catch { return null }
}

export function writeGuestToken(shareToken, guestToken, storage = globalThis.localStorage) {
  if (!shareToken) return
  try {
    if (guestToken) storage?.setItem(GUEST_KEY(shareToken), guestToken)
    else storage?.removeItem(GUEST_KEY(shareToken))
  } catch { /* storage unavailable: the guest joins again next visit */ }
}

export function readHeroTheater(storage = globalThis.localStorage) {
  try { return storage?.getItem(HERO_THEATER_KEY) === '1' } catch { return false }
}

export function writeHeroTheater(value, storage = globalThis.localStorage) {
  try { storage?.setItem(HERO_THEATER_KEY, value ? '1' : '0') } catch { /* not remembered */ }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Join form -> { values, errors }. Mirrors the API rules (name 2-80, optional email).
export function validateJoinForm({ name = '', email = '' } = {}) {
  const cleanName = String(name).replace(/\s+/g, ' ').trim()
  const cleanEmail = String(email).trim().toLowerCase()
  const errors = {}
  if (cleanName.length < 2) errors.name = 'Escribe tu nombre (al menos 2 caracteres).'
  else if (cleanName.length > 80) errors.name = 'Máximo 80 caracteres.'
  if (cleanEmail && !EMAIL_RE.test(cleanEmail)) errors.email = 'El correo no es válido.'
  return { values: { name: cleanName, ...(cleanEmail ? { email: cleanEmail } : {}) }, errors }
}

// Absolute link: the API sends an absolute url when the app URL is configured,
// otherwise a path the viewer's origin completes.
export function absoluteShareUrl(share, origin = globalThis.location?.origin ?? '') {
  const url = share?.url || share?.path
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : `${origin}${url}`
}

export const NO_PROMO = 'none'

// Video/embed lessons that may be the promo video: free section or preview.
export function promoLessonOptions(sections) {
  const options = [{ value: NO_PROMO, label: 'Sin video' }]
  for (const section of sections ?? []) {
    for (const lesson of section.lessons ?? []) {
      if ((lesson.kind === 'video' || lesson.kind === 'embed') && (section.free || lesson.preview)) {
        options.push({ value: lesson.id, label: `${section.title} · ${lesson.title}` })
      }
    }
  }
  return options
}

// Promo payload -> the lesson shape LessonStage / VideoLesson play.
export function promoAsLesson(promo) {
  if (!promo) return null
  return { id: promo.lessonId, title: promo.title, kind: promo.kind, media: promo.media, mediaUrl: promo.mediaUrl ?? null, poster: promo.poster, embedUrl: promo.embedUrl }
}

// Guest outline key in the lms query cache: lets the shared quiz components
// patch the guest outline like an internal one.
export const guestCourseKey = (shareToken) => `guest:${shareToken}`
