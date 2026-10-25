import { BadgeCheck, Clapperboard, CreditCard, FileImage, GalleryVerticalEnd, Image, Megaphone, MonitorPlay, PanelTop, Presentation, Sparkles, Smartphone } from 'lucide-react'

// Starting formats for the Studio home. Sizes are pixels (the document unit);
// they are screen presets, not print measures.
export const FORMAT_CATEGORIES = Object.freeze([
  { value: 'all', label: 'Para ti', icon: Sparkles },
  { value: 'social', label: 'Redes sociales', icon: Smartphone },
  { value: 'print', label: 'Flyers y pósters', icon: Megaphone },
  { value: 'slides', label: 'Presentaciones', icon: Presentation },
  { value: 'web', label: 'Web y video', icon: MonitorPlay },
  { value: 'brand', label: 'Marca', icon: BadgeCheck },
])

export const STUDIO_FORMATS = Object.freeze([
  { key: 'post', label: 'Publicación cuadrada', width: 1080, height: 1080, ratio: '1:1', category: 'social', icon: Image, tone: 'from-fuchsia-500 to-violet-600' },
  { key: 'portrait', label: 'Publicación vertical', width: 1080, height: 1350, ratio: '4:5', category: 'social', icon: GalleryVerticalEnd, tone: 'from-pink-500 to-orange-400' },
  { key: 'story', label: 'Historia o reel', width: 1080, height: 1920, ratio: '9:16', category: 'social', icon: Smartphone, tone: 'from-violet-500 to-sky-500' },
  { key: 'flyer', label: 'Flyer', width: 1240, height: 1754, ratio: 'Vertical', category: 'print', icon: Megaphone, tone: 'from-indigo-500 to-fuchsia-500' },
  { key: 'poster', label: 'Póster', width: 1200, height: 1800, ratio: '2:3', category: 'print', icon: FileImage, tone: 'from-rose-500 to-amber-400' },
  { key: 'slides', label: 'Presentación', width: 1920, height: 1080, ratio: '16:9', category: 'slides', icon: Presentation, tone: 'from-sky-500 to-indigo-600' },
  { key: 'banner', label: 'Banner web', width: 1200, height: 630, ratio: 'Horizontal', category: 'web', icon: PanelTop, tone: 'from-teal-500 to-sky-500' },
  { key: 'thumbnail', label: 'Portada de video', width: 1280, height: 720, ratio: '16:9', category: 'web', icon: Clapperboard, tone: 'from-orange-500 to-pink-500' },
  { key: 'logo', label: 'Logotipo', width: 800, height: 800, ratio: '1:1', category: 'brand', icon: BadgeCheck, tone: 'from-emerald-500 to-teal-500' },
  { key: 'card', label: 'Tarjeta de presentación', width: 1050, height: 600, ratio: 'Horizontal', category: 'brand', icon: CreditCard, tone: 'from-slate-600 to-slate-900' },
])

export function formatsFor(category) {
  return category === 'all' ? STUDIO_FORMATS : STUDIO_FORMATS.filter(format => format.category === category)
}

export function sizeLabel(page) {
  return page ? `${page.width} × ${page.height} px` : ''
}

const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
const UNITS = [['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3600], ['minute', 60]]

export function editedAgo(value, now = Date.now()) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  const seconds = Math.round((time - now) / 1000)
  for (const [unit, size] of UNITS) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  return 'hace un momento'
}
