// Studio Next acceptance project (phases 4 and 5): three pages of different proportions
// and durations with a private photo, texts, shapes, enter/exit effects, position, scale,
// opacity and rotation keyframes, a fade and a slide transition.
import { validateDocument } from '../../../apps/shared/studio/document.js'

export function acceptanceDocument(photoId) {
  return validateDocument({ schemaVersion: 8, unit: 'px',
    page: { id: 'page-1', width: 1920, height: 1080, background: '#0f172a', slide: { duration: 3000 } },
    objects: [
      { id: 'foto-1', type: 'image', fileAssetId: photoId, x: 1300, y: 600, width: 480, height: 360, rotation: 0, fill: '#000000' },
      { id: 'titulo-1', type: 'text', x: 120, y: 80, width: 1300, height: 140, rotation: 0, fill: '#ffffff', text: 'Studio Next', fontSize: 120,
        enter: { preset: 'fade', duration: 600, delay: 0, easing: 'linear' }, exit: { preset: 'fade', duration: 500, delay: 2400, easing: 'linear' } },
      { id: 'caja-1', type: 'rectangle', x: 120, y: 420, width: 400, height: 300, rotation: 0, fill: '#ef4444',
        keyframes: [{ at: 0, x: 120, scale: 1, opacity: 1 }, { at: 2500, x: 700, scale: 1.5, opacity: 0.4 }] },
    ],
    additionalPages: [
      { page: { id: 'page-2', width: 1080, height: 1080, background: '#fde68a', slide: { duration: 2000, transition: { type: 'fade', duration: 500, easing: 'linear' } } },
        objects: [
          { id: 'circulo-2', type: 'ellipse', x: 290, y: 290, width: 500, height: 500, rotation: 0, fill: '#7c3aed', enter: { preset: 'zoom-in', duration: 800, delay: 0, easing: 'linear' } },
          { id: 'texto-2', type: 'text', x: 140, y: 860, width: 800, height: 100, rotation: 0, fill: '#111827', text: 'Página cuadrada', fontSize: 72 },
        ] },
      { page: { id: 'page-3', width: 1920, height: 1080, background: '#ffffff', slide: { duration: 2500, transition: { type: 'slide-left', duration: 600, easing: 'linear' } } },
        objects: [
          { id: 'foto-3', type: 'image', fileAssetId: photoId, x: 160, y: 240, width: 800, height: 600, rotation: 0, fill: '#000000', enter: { preset: 'slide-up', duration: 700, delay: 200, easing: 'ease-out' } },
          { id: 'barra-3', type: 'rectangle', x: 1200, y: 300, width: 500, height: 120, rotation: 0, fill: '#2563eb', keyframes: [{ at: 0, rotation: 0 }, { at: 2000, rotation: 90 }] },
        ] },
    ] })
}
