// Element library for the Studio "Elementos" panel. Basic shapes and lines are
// canonical document primitives; "figures" are real Tabler icons (MIT) imported
// through the creative catalog, so they keep their source and license.

export const ELEMENT_COLORS = ['#d946ef', '#7c3aed', '#2563eb', '#0ea5e9', '#14b8a6', '#22c55e', '#facc15', '#f97316', '#ef4444', '#ec4899', '#0f172a', '#ffffff']

export const BASIC_SHAPES = [
  { key: 'square', label: 'Cuadrado', type: 'rectangle', width: 260, height: 260 },
  { key: 'rectangle', label: 'Rectángulo', type: 'rectangle', width: 380, height: 240 },
  { key: 'circle', label: 'Círculo', type: 'ellipse', width: 260, height: 260 },
  { key: 'oval', label: 'Óvalo', type: 'ellipse', width: 380, height: 240 },
  { key: 'oval-tall', label: 'Óvalo vertical', type: 'ellipse', width: 220, height: 340 },
  { key: 'stripe', label: 'Franja', type: 'rectangle', width: 480, height: 8 },
  { key: 'band', label: 'Banda', type: 'rectangle', width: 640, height: 120 },
  { key: 'column', label: 'Columna', type: 'rectangle', width: 120, height: 480 },
]

const figure = (id, label, group) => ({ id: `tabler:${id}`, label, group })
export const FIGURE_GROUPS = [
  { key: 'geometric', label: 'Geométricas' },
  { key: 'symbols', label: 'Símbolos' },
  { key: 'nature', label: 'Naturaleza' },
  { key: 'arrows', label: 'Flechas' },
  { key: 'bubbles', label: 'Globos y etiquetas' },
]
export const FIGURES = [
  figure('triangle-filled', 'Triángulo', 'geometric'), figure('triangle-inverted-filled', 'Triángulo invertido', 'geometric'),
  figure('square-rounded-filled', 'Cuadrado redondeado', 'geometric'), figure('diamond-filled', 'Rombo', 'geometric'),
  figure('pentagon-filled', 'Pentágono', 'geometric'), figure('hexagon-filled', 'Hexágono', 'geometric'),
  figure('octagon-filled', 'Octágono', 'geometric'), figure('spiral', 'Espiral', 'geometric'),
  figure('star-filled', 'Estrella', 'symbols'), figure('heart-filled', 'Corazón', 'symbols'), figure('rosette-filled', 'Roseta', 'symbols'),
  figure('bolt-filled', 'Rayo', 'symbols'), figure('crown-filled', 'Corona', 'symbols'), figure('shield-filled', 'Escudo', 'symbols'),
  figure('puzzle-filled', 'Pieza', 'symbols'), figure('badge-filled', 'Distintivo', 'symbols'),
  figure('cloud-filled', 'Nube', 'nature'), figure('droplet-filled', 'Gota', 'nature'), figure('sun-filled', 'Sol', 'nature'),
  figure('moon-filled', 'Luna', 'nature'), figure('flower-filled', 'Flor', 'nature'), figure('leaf-filled', 'Hoja', 'nature'),
  figure('arrow-big-right-filled', 'Flecha', 'arrows'), figure('arrow-big-up-filled', 'Flecha arriba', 'arrows'),
  figure('arrow-big-right-lines-filled', 'Flecha veloz', 'arrows'), figure('flag-filled', 'Bandera', 'arrows'),
  figure('message-filled', 'Globo', 'bubbles'), figure('message-2-filled', 'Globo de texto', 'bubbles'),
  figure('bookmark-filled', 'Marcador', 'bubbles'), figure('rosette-discount-filled', 'Oferta', 'bubbles'),
]

// Line bodies as normalized points (0…1) inside the line's box.
const range = (count, map) => Array.from({ length: count }, (_, index) => map(index / (count - 1)))
const round = point => point.map(value => Math.round(value * 10000) / 10000)
export const LINE_BODIES = [
  { key: 'straight', label: 'Recta', width: 420, height: 24, points: [[0, 0.5], [1, 0.5]] },
  { key: 'wave', label: 'Ondulada', width: 420, height: 60, points: range(48, t => [t, 0.5 + 0.42 * Math.sin(t * Math.PI * 4)]).map(round) },
  { key: 'zigzag', label: 'Zigzag', width: 420, height: 60, points: range(9, t => [t, Math.round(t * 8) % 2 ? 0.08 : 0.92]) },
  { key: 'curve', label: 'Curva', width: 420, height: 120, points: range(32, t => [t, 0.95 - 0.9 * Math.sin(t * Math.PI)]).map(round) },
  { key: 's-curve', label: 'Curva en S', width: 420, height: 120, points: range(40, t => [t, 0.5 - 0.45 * Math.sin(t * Math.PI * 2)]).map(round) },
  { key: 'steps', label: 'Escalones', width: 360, height: 180, points: [[0, 1], [0.25, 1], [0.25, 0.66], [0.5, 0.66], [0.5, 0.33], [0.75, 0.33], [0.75, 0], [1, 0]] },
  { key: 'spiral', label: 'Espiral', width: 260, height: 260, points: range(180, t => { const angle = t * Math.PI * 7, radius = 0.5 * t; return [0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle)] }).map(round) },
]
export const LINE_DASHES = [{ value: 'solid', label: 'Sólido' }, { value: 'dashed', label: 'Discontinuo' }, { value: 'dotted', label: 'Punteado' }]
// Library presets; each end can then be changed independently on the canvas.
export const LINE_ENDS = [
  { value: 'none', label: 'Sin extremos', startCap: 'none', endCap: 'none' },
  { value: 'arrow', label: 'Flecha', startCap: 'none', endCap: 'arrow' },
  { value: 'double', label: 'Doble flecha', startCap: 'arrow', endCap: 'arrow' },
]
// The seven v5 line caps (shared LINE_CAPS order).
export const LINE_CAP_OPTIONS = [
  { value: 'none', label: 'Ninguno' }, { value: 'arrow', label: 'Flecha' }, { value: 'open-arrow', label: 'Flecha abierta' },
  { value: 'circle', label: 'Círculo' }, { value: 'square', label: 'Cuadrado' }, { value: 'bar', label: 'Barra' }, { value: 'diamond', label: 'Rombo' },
]
export const LINE_WEIGHTS = [{ value: 4, label: 'Fino' }, { value: 8, label: 'Medio' }, { value: 16, label: 'Grueso' }]

// Combined blocks: several primitives grouped as one element. Coordinates are
// relative to the block's top-left; `accent` is the chosen color.
const text = (x, y, width, fontSize, value, extra = {}) => ({ type: 'text', props: { x, y, width, height: Math.ceil(value.split('\n').length * fontSize * 1.2), fontSize, text: value, textAlign: 'center', ...extra } })
export const BLOCKS = [
  { key: 'button', label: 'Botón', width: 360, height: 96, parts: accent => [
    { type: 'rectangle', props: { x: 0, y: 0, width: 360, height: 96, fill: accent } },
    text(0, 26, 360, 36, 'Compra ahora', { fill: '#ffffff', fontFamily: 'Lato' })] },
  { key: 'tag', label: 'Etiqueta', width: 220, height: 64, parts: accent => [
    { type: 'rectangle', props: { x: 0, y: 0, width: 220, height: 64, fill: accent } },
    text(0, 14, 220, 30, 'NUEVO', { fill: '#ffffff', fontFamily: 'Bebas Neue' })] },
  { key: 'badge', label: 'Insignia', width: 280, height: 280, parts: accent => [
    { type: 'ellipse', props: { x: 0, y: 0, width: 280, height: 280, fill: accent } },
    text(0, 62, 280, 110, '-30%', { fill: '#ffffff', fontFamily: 'Bebas Neue' }),
    text(0, 178, 280, 32, 'SOLO HOY', { fill: '#ffffff', fontFamily: 'Lato' })] },
  { key: 'price', label: 'Precio', width: 240, height: 240, parts: accent => [
    { type: 'ellipse', props: { x: 0, y: 0, width: 240, height: 240, fill: accent } },
    text(0, 32, 240, 30, 'DESDE', { fill: '#ffffff', fontFamily: 'Lato' }),
    text(0, 74, 240, 110, '$99', { fill: '#ffffff', fontFamily: 'Bebas Neue' })] },
  { key: 'quote', label: 'Cita', width: 560, height: 300, parts: accent => [
    text(0, 0, 560, 160, '“', { fill: accent, fontFamily: 'Playfair Display' }),
    text(0, 150, 560, 40, 'Una frase que inspira\na tu audiencia.', { fill: '#0f172a', fontFamily: 'Playfair Display' }),
    { type: 'rectangle', props: { x: 250, y: 266, width: 60, height: 4, fill: accent } }] },
  { key: 'headline', label: 'Título subrayado', width: 560, height: 150, parts: accent => [
    text(0, 0, 560, 96, 'TU TÍTULO', { fill: '#0f172a', fontFamily: 'Bebas Neue' }),
    { type: 'rectangle', props: { x: 180, y: 126, width: 200, height: 10, fill: accent } }] },
  { key: 'stat', label: 'Dato destacado', width: 360, height: 230, parts: accent => [
    text(0, 0, 360, 150, '98%', { fill: accent, fontFamily: 'Bebas Neue' }),
    text(0, 176, 360, 32, 'clientes satisfechos', { fill: '#475569', fontFamily: 'Lato' })] },
  { key: 'ribbon', label: 'Banda con texto', width: 640, height: 120, parts: accent => [
    { type: 'rectangle', props: { x: 0, y: 0, width: 640, height: 120, fill: accent } },
    text(0, 30, 640, 52, 'GRAN APERTURA', { fill: '#ffffff', fontFamily: 'Oswald' })] },
]

export function matches(label, query) {
  return !query || label.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '').includes(query)
}
export function normalizeQuery(value) {
  return value.trim().toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '')
}
