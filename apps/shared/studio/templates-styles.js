// Stylistically distinct starting points: neo-brutalism, synthwave, terminal,
// editorial, Memphis, zen, blueprint and handwritten notebook. Gradients are
// built as bands (documents have no gradient paint); everything stays editable.
import { box, centered, checker, chip, circle, dotGrid, gradientBands, gridLines, halftone, line, mix, oval, rings, rule, shadowBox, starburst, tape, text, zigzag } from './templates-motifs.js'

const mono = (x, y, width, size, fill, value, options = {}) => text(x, y, width, size, fill, value, { font: 'JetBrains Mono', ...options })

// Synthwave sun cut by horizontal slits that match the sky behind it.
const skyAt = y => mix('#12002b', '#7a1fa2', Math.min(1, y / 800))
// Perspective floor: horizontal lines spaced by depth plus lines fanning from the horizon.
const floor = (horizon, bottom, color) => [
  ...[0, 40, 90, 155, 235, 330, 440].map(offset => box(0, horizon + offset, 1080, 3, color, { opacity: 0.85 })),
  ...[-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7].map(step => {
    const dx = step * 170, x = Math.min(540, 540 + dx)
    return step === 0 ? line(538, horizon, 4, bottom - horizon, [[0.5, 0], [0.5, 1]], color, { weight: 3, opacity: 0.85 })
      : line(x, horizon, Math.abs(dx), bottom - horizon, step > 0 ? [[0, 0], [1, 1]] : [[1, 0], [0, 1]], color, { weight: 3, opacity: 0.85 })
  })]

const TERMINAL_LINES = [['$ runly deploy --env prod', '#7ee787'], ['[ok] build completado en 42 s', '#79c0ff'], ['[ok] 128 pruebas aprobadas', '#79c0ff'],
  ['> subiendo imágenes (3/3)', '#8b949e'], ['> migrando base de datos', '#8b949e'], ['[warn] 1 aviso de rendimiento', '#ffa657'], ['$ runly open', '#7ee787']]

export const STYLE_TEMPLATES = [
  { key: 'brutal-sale', name: 'Rebajas brutalistas', category: 'Negocios', description: 'Oferta neo-brutalista: bloques con sombra dura, contornos negros, sello en estallido y tablero de ajedrez.',
    width: 1080, height: 1080, background: '#fffbe6', objects: [
      ...checker(0, 0, 27, 2, 40, '#000000'),
      ...shadowBox(70, 150, 700, 330, '#ffe14d', { offset: 14 }),
      text(100, 175, 650, 120, '#000000', 'REBAJAS\nTOTALES', { font: 'Oswald', variant: 'bold', lineHeight: 0.9 }),
      ...shadowBox(600, 520, 390, 200, '#ff7ab8', { offset: 14 }),
      text(630, 545, 330, 80, '#000000', 'HASTA\n-50%', { font: 'Oswald', variant: 'bold', lineHeight: 0.95 }),
      ...shadowBox(70, 560, 460, 160, '#7cf0c9', { offset: 14 }),
      text(100, 590, 400, 36, '#000000', 'SOLO ESTE\nFIN DE SEMANA', { font: 'DM Sans', variant: 'extrabold', lineHeight: 1.1 }),
      ...starburst(880, 230, 150, '#ff4d2e', { layers: 4 }),
      text(790, 205, 180, 56, '#ffffff', '¡YA!', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      zigzag(70, 790, 520, 36, 13, '#000000', { weight: 8 }),
      box(0, 900, 1080, 180, '#000000'),
      text(70, 950, 700, 40, '#fffbe6', 'COMPRA EN TUTIENDA.COM', { font: 'DM Sans', variant: 'extrabold' }),
      ...chip(780, 940, 230, 70, '#ffe14d', 'VER MÁS', '#000000', { font: 'DM Sans', variant: 'bold', spacing: 60 }),
    ] },
  { key: 'neon-night', name: 'Noche neón', category: 'Eventos', description: 'Cartel synthwave: cielo en degradado, sol con rendijas, suelo en perspectiva y título en script con doble resplandor.',
    width: 1080, height: 1350, background: '#12002b', objects: [
      ...gradientBands(0, 0, 1080, 800, '#12002b', '#7a1fa2', 40),
      circle(290, 300, 500, '#ff7a59'),
      ...[[600, 8], [645, 12], [688, 16], [726, 22], [758, 28]].map(([y, h]) => box(280, y, 520, h, skyAt(y + h / 2))),
      box(0, 800, 1080, 550, '#12002b'), ...floor(800, 1350, '#ff2bd6'),
      text(80, 60, 920, 20, '#00e5ff', 'SYNTH · LIVE · 2027', { font: 'Montserrat', variant: 'bold', align: 'center', spacing: 300 }),
      text(86, 124, 920, 200, '#00e5ff', 'Retro\nWave', { font: 'Pacifico', align: 'center', lineHeight: 0.95 }),
      text(80, 120, 920, 200, '#ff4fd8', 'Retro\nWave', { font: 'Pacifico', align: 'center', lineHeight: 0.95 }),
      ...chip(290, 1200, 500, 84, '#00e5ff', 'VIE 21 NOV · 21:00', '#12002b', { font: 'Montserrat', variant: 'bold', spacing: 60 }),
    ] },
  { key: 'terminal-release', name: 'Lanzamiento en terminal', category: 'Presentaciones', description: 'Anuncio técnico 16:9: ventana de terminal con salida de comandos, versión grande y punteado de semitono.',
    width: 1920, height: 1080, background: '#0d1117', objects: [
      ...gridLines(0, 0, 1920, 1080, 60, '#ffffff', { opacity: 0.04 }),
      box(120, 130, 1100, 820, '#161b22', { radius: 20, stroke: '#30363d', strokeWidth: 2 }),
      box(120, 130, 1100, 70, '#21262d', { radius: 20 }), box(120, 170, 1100, 30, '#21262d'),
      circle(152, 154, 22, '#ff5f56'), circle(192, 154, 22, '#ffbd2e'), circle(232, 154, 22, '#27c93f'),
      mono(300, 153, 600, 20, '#8b949e', 'release.sh — zsh'),
      ...TERMINAL_LINES.map(([value, fill], index) => mono(170, 250 + index * 72, 1000, 32, fill, value)),
      box(170, 770, 20, 38, '#7ee787'),
      mono(1300, 150, 560, 22, '#58a6ff', 'NUEVA VERSIÓN', { spacing: 120 }),
      mono(1290, 200, 560, 230, '#7ee787', 'v2.0', { variant: 'extrabold', lineHeight: 1 }),
      text(1300, 470, 540, 36, '#e6edf3', 'Despliegues más rápidos,\nmenos pasos manuales.', { variant: 'medium', lineHeight: 1.25 }),
      ...halftone(1300, 640, 9, 4, 60, 44, '#58a6ff', { toward: 'right', opacity: 0.9 }),
      ...chip(1300, 930, 300, 70, '#238636', 'LEER NOTAS', '#ffffff', { font: 'JetBrains Mono', variant: 'bold' }),
    ] },
  { key: 'atelier-cover', name: 'Portada editorial', category: 'Editorial', description: 'Portada de revista: cabecera en serif, arco con sol, columnas de titulares y gran titular en cursiva.',
    width: 1080, height: 1350, background: '#f1ebe0', objects: [
      text(40, 36, 1000, 200, '#2a211c', 'ATELIER', { font: 'Cormorant Garamond', variant: 'semibold', align: 'center', lineHeight: 1, spacing: 40 }),
      box(60, 262, 960, 2, '#2a211c'),
      text(60, 276, 960, 16, '#2a211c', 'EDICIÓN DE PRIMAVERA · Nº 14 · $85', { font: 'Montserrat', variant: 'medium', align: 'center', spacing: 160 }),
      box(300, 340, 480, 740, '#c9a9a0', { radius: 240 }), box(332, 372, 416, 708, '#e2c6bd', { radius: 208 }),
      circle(400, 480, 280, '#f1ebe0'), box(332, 860, 416, 220, '#a8786b'), box(332, 900, 416, 4, '#f1ebe0', { opacity: 0.5 }),
      text(60, 380, 220, 15, '#a8786b', 'ENTREVISTA', { font: 'Montserrat', variant: 'bold', spacing: 120 }),
      text(60, 410, 220, 46, '#2a211c', 'La nueva\nartesanía', { font: 'Cormorant Garamond', variant: 'italic', lineHeight: 1.05 }),
      text(60, 620, 220, 15, '#a8786b', 'MODA', { font: 'Montserrat', variant: 'bold', spacing: 120 }),
      text(60, 650, 220, 46, '#2a211c', '12 looks\npara\nreinventarte', { font: 'Cormorant Garamond', variant: 'italic', lineHeight: 1.05 }),
      text(810, 380, 210, 15, '#a8786b', 'HOGAR', { font: 'Montserrat', variant: 'bold', spacing: 120 }),
      text(810, 410, 210, 46, '#2a211c', 'Espacios\nque respiran', { font: 'Cormorant Garamond', variant: 'italic', lineHeight: 1.05 }),
      text(810, 620, 210, 15, '#a8786b', 'VIAJES', { font: 'Montserrat', variant: 'bold', spacing: 120 }),
      text(810, 650, 210, 46, '#2a211c', 'Oaxaca,\nsin prisa', { font: 'Cormorant Garamond', variant: 'italic', lineHeight: 1.05 }),
      text(60, 1110, 960, 100, '#2a211c', 'Luz, forma y materia', { font: 'Cormorant Garamond', variant: 'light', align: 'center', lineHeight: 1 }),
      ...rule(340, 1250, 400, '#a8786b'),
    ] },
  { key: 'memphis-party', name: 'Fiesta Memphis', category: 'Eventos', description: 'Invitación de geometría atrevida: tablero, zigzags, anillos, puntos y tipografía Lobster.',
    width: 1080, height: 1080, background: '#fff3d6', objects: [
      ...checker(0, 0, 6, 4, 60, '#6a4cff', 0.9),
      circle(660, 40, 380, '#ff5d8f'), ...rings(850, 230, [260, 180], '#fff3d6', { weight: 10 }),
      box(90, 640, 340, 340, '#2ec4b6', { rotation: -8 }),
      zigzag(430, 120, 300, 70, 8, '#1d1a39', { weight: 12 }), zigzag(560, 900, 420, 80, 10, '#ff5d8f', { weight: 14 }),
      ...dotGrid(750, 470, 5, 5, 44, 16, '#1d1a39'),
      box(40, 40, 60, 60, '#ffd23f', { rotation: 45 }), circle(980, 920, 70, '#ffd23f'),
      text(70, 270, 900, 190, '#1d1a39', 'Fiesta', { font: 'Lobster', lineHeight: 1 }),
      text(70, 470, 700, 100, '#6a4cff', 'de verano', { font: 'Lobster', lineHeight: 1 }),
      ...chip(120, 720, 260, 70, '#ffd23f', 'SÁB 12 JUL', '#1d1a39', { font: 'Montserrat', variant: 'black' }),
      text(120, 820, 280, 22, '#1d1a39', 'Terraza Sol · 18:00 h', { font: 'Montserrat', variant: 'bold' }),
    ] },
  { key: 'zen-retreat', name: 'Retiro zen', category: 'Bienestar', description: 'Cartel sereno: círculo de tinta, sello rojo, degradado arena a salvia y tipografía ligera.',
    width: 1080, height: 1350, background: '#e9e4d8', objects: [
      ...gradientBands(0, 900, 1080, 450, '#e9e4d8', '#bcc8b0', 24),
      ...rings(540, 460, [520], '#2f3a32', { weight: 26 }), ...rings(552, 452, [500], '#2f3a32', { weight: 6, opacity: 0.35 }),
      box(790, 570, 110, 110, '#b5452f', { radius: 8 }),
      text(790, 602, 110, 22, '#e9e4d8', 'CALMA', { font: 'Raleway', variant: 'bold', align: 'center', spacing: 80, lineHeight: 1 }),
      text(60, 820, 960, 120, '#2f3a32', 'Respira.', { font: 'Cormorant Garamond', variant: 'light', align: 'center', lineHeight: 1 }),
      text(60, 960, 960, 24, '#2f3a32', 'RETIRO DE YOGA Y MEDITACIÓN', { font: 'Raleway', variant: 'light', align: 'center', spacing: 260 }),
      ...rule(340, 1030, 400, '#2f3a32'),
      text(60, 1070, 960, 26, '#2f3a32', '3 días · Valle de Bravo · 14 al 16 de marzo', { font: 'Raleway', variant: 'light', align: 'center', spacing: 40 }),
    ] },
  { key: 'blueprint-studio', name: 'Plano de estudio', category: 'Presentaciones', description: 'Portada de portafolio de arquitectura 16:9: papel cuadriculado azul, planta con cotas y cajetín técnico.',
    width: 1920, height: 1080, background: '#0b3d91', objects: [
      ...gridLines(0, 0, 1920, 1080, 40, '#ffffff', { opacity: 0.1 }), ...gridLines(0, 0, 1920, 1080, 200, '#ffffff', { opacity: 0.22 }),
      box(160, 240, 760, 540, '#ffffff', { noFill: true, strokeWidth: 5, stroke: '#ffffff' }),
      box(160, 240, 300, 540, '#ffffff', { noFill: true, strokeWidth: 3, stroke: '#ffffff' }),
      box(460, 240, 460, 220, '#ffffff', { noFill: true, strokeWidth: 3, stroke: '#ffffff' }),
      ...rings(310, 520, [180], '#9ec5ff', { weight: 3, dash: 'dashed' }), ...rings(690, 640, [140], '#9ec5ff', { weight: 3, dash: 'dashed' }),
      line(160, 190, 760, 20, [[0, 0.5], [1, 0.5]], '#9ec5ff', { weight: 3, start: 'diamond', end: 'diamond' }),
      line(110, 240, 20, 540, [[0.5, 0], [0.5, 1]], '#9ec5ff', { weight: 3, start: 'diamond', end: 'diamond' }),
      mono(450, 150, 280, 20, '#9ec5ff', '12.40 m', { align: 'center' }), mono(30, 500, 90, 20, '#9ec5ff', '8.70', { align: 'right' }),
      mono(1060, 250, 700, 22, '#9ec5ff', 'PROYECTO 014 · VIVIENDA UNIFAMILIAR', { spacing: 100 }),
      text(1054, 300, 800, 120, '#ffffff', 'RESIDENCIA\nPATIO', { font: 'Oswald', variant: 'light', lineHeight: 0.95 }),
      box(1060, 760, 740, 220, '#ffffff', { noFill: true, strokeWidth: 3, stroke: '#ffffff' }), box(1060, 850, 740, 3, '#ffffff'), box(1400, 760, 3, 220, '#ffffff'),
      mono(1090, 790, 300, 22, '#ffffff', 'ESCALA 1:50'), mono(1430, 790, 340, 22, '#ffffff', 'HOJA A-01'),
      mono(1090, 890, 300, 22, '#9ec5ff', 'ARQ. TU NOMBRE'), mono(1430, 890, 340, 22, '#9ec5ff', 'REV. 03 · 2027'),
    ] },
  { key: 'grandma-recipe', name: 'Receta de la abuela', category: 'Recetas', description: 'Tarjeta de receta en cuaderno: líneas azules, margen rojo, cinta adhesiva, nota amarilla y letra manuscrita.',
    width: 1080, height: 1350, background: '#f6efe3', objects: [
      ...Array.from({ length: 21 }, (_, index) => box(0, 300 + index * 50, 1080, 2, '#8fb4d9', { opacity: 0.55 })),
      box(130, 0, 3, 1350, '#e07a7a', { opacity: 0.6 }),
      tape(380, 30, 220, 56, '#ffd9a8', -3), tape(80, 1290, 220, 56, '#ffd9a8', 6),
      text(170, 70, 520, 110, '#b5452f', 'Pastel de\nlimón', { font: 'Sacramento', lineHeight: 0.95 }),
      ...(() => { const [x, y] = centered(840, 250, 260, 250, 5); return [box(x + 8, y + 8, 260, 250, '#c9a24a', { rotation: 5, opacity: 0.35 }), box(x, y, 260, 250, '#ffe27a', { rotation: 5 })] })(),
      tape(760, 100, 140, 44, '#ffd9a8', -4),
      text(740, 190, 220, 44, '#3b2e22', '¡Con mucho\ncariño!', { font: 'Caveat', variant: 'bold', lineHeight: 1.1, align: 'center' }),
      text(170, 322, 700, 34, '#3b2e22', 'Rinde 8 porciones · 45 min', { font: 'Caveat', variant: 'medium' }),
      text(170, 390, 700, 52, '#b5452f', 'Ingredientes', { font: 'Caveat', variant: 'bold' }),
      ...['3 limones grandes', '1 lata de leche condensada', '1 taza de crema para batir', '1 paquete de galletas María', '100 g de mantequilla'].flatMap((value, index) => [
        circle(170, 462 + index * 50, 14, '#e9c46a'), text(205, 451 + index * 50, 760, 32, '#3b2e22', value, { font: 'Kalam' })]),
      text(170, 740, 700, 52, '#b5452f', 'Preparación', { font: 'Caveat', variant: 'bold' }),
      ...['Tritura las galletas con la mantequilla\ny forma la base del molde.', 'Bate la crema, la leche condensada\ny el jugo de los limones.', 'Vierte sobre la base y refrigera\nal menos 4 horas.'].flatMap((value, index) => [
        circle(165, 814 + index * 150, 40, '#b5452f'), text(165, 820 + index * 150, 40, 28, '#f6efe3', String(index + 1), { font: 'Caveat', variant: 'bold', align: 'center', lineHeight: 1 }),
        text(225, 808 + index * 150, 780, 32, '#3b2e22', value, { font: 'Kalam', lineHeight: 1.35 })]),
    ] },
]
