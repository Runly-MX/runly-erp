// Illustrated starting points: complete scenes drawn only with editable v5
// primitives (rounded/outlined shapes, ellipses, polylines with caps and dash
// patterns, bundled fonts and Lucide vectors). No raster images and no
// unlicensed SVG: every piece of the illustration can be recolored or moved.
import { icon } from './templates-premium.js'

const opt = opacity => (opacity === undefined ? {} : { opacity })
// Shape style only when it differs from the plain default (keeps v5 JSON small).
const styled = ({ radius = 0, stroke, strokeWidth = 0, dash = 'solid', noFill = false }, fill) =>
  radius || strokeWidth || noFill ? { shape: { fillEnabled: !noFill, strokeWidth, strokeColor: stroke ?? fill, dash, radius } } : {}
const box = (x, y, width, height, fill, { rotation = 0, opacity, ...style } = {}) =>
  ({ type: 'rectangle', x, y, width, height, fill, rotation, ...styled(style, fill), ...opt(opacity) })
const oval = (x, y, width, height, fill, { rotation = 0, opacity, ...style } = {}) =>
  ({ type: 'ellipse', x, y, width, height, fill, rotation, ...styled({ ...style, radius: 0 }, fill), ...opt(opacity) })
const circle = (x, y, size, fill, options) => oval(x, y, size, size, fill, options)
const text = (x, y, width, fontSize, fill, value, { font = 'Poppins', variant = 'regular', align = 'left', lineHeight = 1.16, spacing = 0, opacity } = {}) =>
  ({ type: 'text', x, y, width, fontSize, fill, text: value, fontFamily: font, fontVariant: variant, textAlign: align, lineHeight, charSpacing: spacing,
    height: Math.ceil(value.split('\n').length * fontSize * lineHeight * 1.13), ...opt(opacity) })
const line = (x, y, width, height, points, fill, { weight = 4, dash = 'solid', start = 'none', end = 'none', rotation = 0, opacity } = {}) =>
  ({ type: 'line', x, y, width, height, points, fill, rotation, strokeWidth: weight, dash, startCap: start, endCap: end, ...opt(opacity) })
// Mountain: a square turned 45° around its top-left corner, so (x, y) is the peak.
const peak = (x, y, size, fill) => box(x, y, size, size, fill, { rotation: 45 })
// Normalized polyline helpers (points inside the line box, 0…1).
const round = value => Math.round(value * 10000) / 10000
const samples = (count, map) => Array.from({ length: count }, (_, index) => map(index / (count - 1)).map(round))
const steam = cycles => samples(24, t => [0.5 + 0.4 * Math.sin(t * Math.PI * 2 * cycles), t])
// Coffee bean: oval plus a crease with the same origin and rotation.
const bean = (x, y, rotation) => [oval(x, y, 64, 42, '#4a2a1c', { rotation }),
  line(x, y, 64, 42, [[0.1, 0.56], [0.3, 0.42], [0.5, 0.5], [0.7, 0.6], [0.9, 0.46]], '#8a5a3c', { weight: 4, rotation })]
// Snow cap: three diamonds whose top vertices sit on the mountain's edges.
const snow = (x, y, size) => [peak(x, y, size, '#fff6ec'), peak(x - size / 2, y + size / 2, size * 0.55, '#fff6ec'), peak(x + size / 2, y + size / 2, size * 0.55, '#fff6ec')]
// Card with a large value and a small label (event details).
const stat = (x, y, value, label) => [box(x, y, 290, 150, '#3a2848', { radius: 24, stroke: '#5b3f6b', strokeWidth: 2 }),
  text(x + 28, y + 26, 240, 64, '#ffcf5c', value, { font: 'Bebas Neue', lineHeight: 1 }),
  text(x + 30, y + 104, 240, 18, '#fff6ec', label, { font: 'Space Mono', spacing: 80, opacity: 0.8 })]
// Menu row: name, origin note, dotted leader and right-aligned price.
const dish = (y, name, note, price) => [
  text(70, y, 380, 34, '#3b2418', name, { variant: 'medium' }),
  text(70, y + 46, 520, 22, '#8a6a55', note, { font: 'Lora', variant: 'italic' }),
  line(452, y + 26, 418, 8, [[0, 0.5], [1, 0.5]], '#c8a27e', { weight: 4, dash: 'dotted' }),
  text(880, y, 130, 34, '#b5532f', price, { variant: 'semibold', align: 'right' })]

export const ILLUSTRATED_TEMPLATES = [
  { key: 'slow-mornings', name: 'Mañanas lentas', category: 'Menús', description: 'Menú de cafetería ilustrado: taza humeante bajo un arco con sol, granos de café, precios con guías punteadas e insignia 2×1.',
    width: 1080, height: 1350, background: '#f3e9dc', objects: [
      // Scene: arch window with sun, sprig and sparkles.
      box(600, 110, 420, 620, '#e8cfa9', { radius: 210 }),
      circle(700, 190, 220, '#e9a65c'),
      line(548, 540, 70, 190, samples(16, t => [0.2 + 0.25 * Math.sin(t * Math.PI), 1 - t]), '#6f7f5c', { weight: 6 }),
      oval(500, 580, 70, 28, '#8a9a74', { rotation: -30 }), oval(566, 548, 70, 28, '#8a9a74', { rotation: 30 }),
      oval(506, 636, 70, 28, '#7d8f6e', { rotation: -24 }), oval(574, 610, 64, 26, '#7d8f6e', { rotation: 34 }),
      icon('sparkle', 930, 330, 54, '#fffaf3'), icon('sparkle', 655, 330, 30, '#fffaf3'),
      // Cup on its saucer, with steam and latte art.
      line(700, 290, 40, 120, steam(1.25), '#fffaf3', { weight: 9, opacity: 0.95 }),
      line(760, 260, 40, 150, steam(1.5), '#fffaf3', { weight: 9, opacity: 0.95 }),
      line(820, 290, 40, 120, steam(1.25), '#fffaf3', { weight: 9, opacity: 0.95 }),
      oval(632, 664, 380, 66, '#3b2418', { opacity: 0.14 }),
      oval(620, 640, 392, 72, '#fffaf3'),
      circle(828, 470, 124, '#b5532f', { noFill: true, strokeWidth: 26, stroke: '#b5532f' }),
      box(660, 420, 230, 250, '#b5532f', { radius: 40 }),
      box(660, 560, 230, 18, '#8f3f22'),
      box(682, 486, 16, 130, '#ffffff', { radius: 8, opacity: 0.28 }),
      oval(676, 432, 198, 44, '#5a3322'),
      icon('heart', 757, 437, 34, '#e8cfa9'),
      ...bean(560, 760, -18), ...bean(640, 790, 24), ...bean(950, 760, 12),
      // Sticker badge over the arch corner.
      circle(860, 70, 180, '#3b2418'),
      circle(874, 84, 152, '#3b2418', { noFill: true, strokeWidth: 3, stroke: '#e9a65c', dash: 'dashed' }),
      text(860, 112, 180, 74, '#fffaf3', '2×1', { font: 'Bebas Neue', align: 'center', lineHeight: 1 }),
      text(860, 188, 180, 13, '#e9a65c', 'ANTES DE 10', { font: 'Space Mono', align: 'center', spacing: 60 }),
      // Headline.
      text(70, 70, 480, 20, '#b5532f', 'CASA TOSTADO · DESDE 2014', { font: 'Space Mono', spacing: 60 }),
      text(64, 120, 520, 112, '#3b2418', 'Mañanas\nlentas', { font: 'Playfair Display', variant: 'semibold', lineHeight: 0.95 }),
      text(70, 384, 480, 32, '#6b4a36', 'Café de especialidad,\ntostado aquí cada semana.', { font: 'Lora', variant: 'italic', lineHeight: 1.2 }),
      box(70, 500, 90, 5, '#b5532f', { radius: 2 }),
      ...[['Tostado en casa cada lunes', 560], ['Leche vegetal sin costo extra', 620], ['Granos por kilo para llevar', 680]].flatMap(([label, y]) => [
        circle(70, y + 4, 22, '#8a9a74'), text(108, y, 380, 24, '#3b2418', label)]),
      // Menu.
      text(70, 880, 600, 20, '#b5532f', 'MENÚ DE LA CASA', { font: 'Space Mono', spacing: 120 }),
      ...dish(930, 'Espresso doble', 'Chiapas · notas a cacao y nuez', '$48'),
      ...dish(1030, 'Flat white', 'Leche entera o de avena', '$62'),
      ...dish(1130, 'Pan de masa madre', 'Con mantequilla de la casa', '$55'),
      // Footer band with call to action.
      box(0, 1250, 1080, 100, '#3b2418'),
      text(70, 1286, 640, 24, '#f3e9dc', 'Calle Olmo 21 · Abierto de 7 a 15 h'),
      box(790, 1272, 220, 56, '#e9a65c', { radius: 28 }),
      text(790, 1288, 220, 18, '#3b2418', 'PIDE EN BARRA', { font: 'Space Mono', align: 'center', spacing: 40 }),
    ] },
  { key: 'sunrise-trail', name: 'Ruta al amanecer', category: 'Eventos', description: 'Historia para carrera de montaña: paisaje ilustrado al amanecer, mapa de ruta con extremos y tarjetas de datos.',
    width: 1080, height: 1920, background: '#ffe2b8', objects: [
      // Poster header.
      text(80, 80, 600, 22, '#a4507a', 'VALLE DEL NEVADO', { font: 'Space Mono', spacing: 120 }),
      text(700, 80, 300, 22, '#a4507a', '14 · 03 · 27', { font: 'Space Mono', spacing: 120, align: 'right' }),
      box(80, 130, 920, 3, '#a4507a', { opacity: 0.35 }),
      // Sky bands and striped retro sun.
      box(0, 300, 1080, 900, '#ffc89a'), box(0, 560, 1080, 640, '#ffae8a'),
      circle(330, 520, 420, '#fff1cf'),
      box(332, 760, 416, 10, '#ffae8a'), box(342, 800, 396, 14, '#ffae8a'), box(364, 845, 352, 18, '#ffae8a'), box(404, 890, 272, 22, '#ffae8a'),
      // Clouds and birds.
      box(90, 430, 240, 50, '#fff6ec', { radius: 25, opacity: 0.85 }), box(150, 400, 140, 50, '#fff6ec', { radius: 25, opacity: 0.85 }),
      box(760, 262, 220, 46, '#fff6ec', { radius: 23, opacity: 0.85 }), box(822, 234, 120, 46, '#fff6ec', { radius: 23, opacity: 0.85 }),
      ...[[180, 300, 44], [240, 274, 32], [800, 380, 38]].map(([x, y, size]) => line(x, y, size, size * 0.35, [[0, 0], [0.5, 1], [1, 0]], '#a4507a', { weight: 5 })),
      // Three mountain ranges, snow on the middle one.
      peak(160, 820, 520, '#e0848a'), peak(560, 860, 520, '#e0848a'), peak(930, 790, 560, '#e0848a'),
      peak(330, 900, 620, '#a4507a'), peak(770, 870, 660, '#a4507a'),
      ...snow(330, 900, 92), ...snow(770, 870, 96),
      peak(40, 1050, 520, '#5b2f5e'), peak(1010, 1020, 540, '#5b2f5e'), peak(560, 1110, 420, '#5b2f5e'),
      // Ground, lake reflection and a forest edge.
      box(0, 1190, 1080, 730, '#2d1e3a'),
      oval(240, 1176, 600, 64, '#f6b99b', { opacity: 0.9 }),
      line(330, 1196, 140, 6, [[0, 0.5], [1, 0.5]], '#fff1cf', { weight: 5 }), line(520, 1214, 90, 6, [[0, 0.5], [1, 0.5]], '#fff1cf', { weight: 5 }),
      ...[[20, 1040, 70, 190], [80, 1080, 60, 150], [140, 1100, 54, 120], [880, 1060, 64, 170], [944, 1030, 76, 200], [1016, 1080, 60, 150]]
        .map(([x, y, width, height]) => oval(x, y, width, height, '#2d1e3a')),
      // Event information.
      text(80, 1290, 900, 24, '#ffcf5c', 'CARRERA DE MONTAÑA · 3ª EDICIÓN', { font: 'Space Mono', spacing: 80 }),
      text(74, 1336, 600, 150, '#fff6ec', 'RUTA AL\nAMANECER', { font: 'Bebas Neue', lineHeight: 0.88 }),
      // Route map: elevation profile and dashed trail with start and finish caps
      // (long end segments: cap size is bounded by the adjacent segment).
      line(690, 1340, 310, 90, [[0, 1], [0.18, 0.62], [0.3, 0.75], [0.48, 0.2], [0.6, 0.35], [0.74, 0], [0.88, 0.45], [1, 0.6]], '#fff6ec', { weight: 4, opacity: 0.45 }),
      line(690, 1450, 310, 150, [[0, 0.78], [0.16, 0.9], [0.3, 0.62], [0.42, 0.32], [0.56, 0.24], [0.68, 0.5], [0.8, 0.46], [1, 0.08]], '#ffcf5c', { weight: 7, dash: 'dashed', start: 'circle', end: 'diamond' }),
      text(680, 1612, 160, 16, '#fff6ec', 'SALIDA', { font: 'Space Mono', spacing: 80, opacity: 0.8 }),
      text(860, 1612, 150, 16, '#fff6ec', 'CUMBRE', { font: 'Space Mono', spacing: 80, opacity: 0.8, align: 'right' }),
      ...stat(80, 1670, '21 KM', 'DISTANCIA'), ...stat(395, 1670, '06:00 H', 'SALIDA'), ...stat(710, 1670, '+1.200 M', 'DESNIVEL'),
      text(80, 1852, 620, 24, '#fff6ec', 'SÁB 14 MAR · VALLE DEL NEVADO', { variant: 'medium' }),
      box(770, 1834, 230, 60, '#ffcf5c', { radius: 30 }),
      text(770, 1849, 230, 24, '#2d1e3a', 'INSCRÍBETE', { variant: 'semibold', align: 'center' }),
    ] },
]
