// Mexican holiday templates, batch C: Año Nuevo, Independencia and Día de Reyes.
// Tricolor bands, bells, stars and fireworks only; no coat of arms or official emblem.
import { box, centered, chip, circle, confetti, gradientBands, icon, line, oval, rings, rule, samples, starburst, stripes, text, zigzag } from './templates-motifs.js'

const caps = (x, y, width, fill, value, options = {}) => text(x, y, width, 18, fill, value, { font: 'Space Mono', spacing: 100, ...options })
const GREEN = '#006847', RED = '#ce1126', CREAM = '#fff6e8'

// Firework: rays from an inner radius with a dot at each tip.
const burst = (cx, cy, inner, length, count, fill, { weight = 6, dot = 14, start = 0, opacity } = {}) => Array.from({ length: count }, (_, index) => {
  const angle = start + (360 / count) * index, radians = angle * Math.PI / 180, dx = -Math.sin(radians), dy = Math.cos(radians)
  const x = cx + dx * inner - (weight / 2) * Math.cos(radians), y = cy + dy * inner - (weight / 2) * Math.sin(radians)
  return [box(Math.round(x), Math.round(y), weight, length - inner, fill, { rotation: angle, opacity }),
    circle(Math.round(cx + dx * (length + dot) - dot / 2), Math.round(cy + dy * (length + dot) - dot / 2), dot, fill, { opacity })]
}).flat()

const SKYLINE = [[0, 90, 140], [90, 120, 220], [210, 70, 170], [280, 130, 260], [410, 90, 190], [500, 110, 300], [610, 80, 210], [690, 140, 250], [830, 100, 180], [930, 150, 230]]
const skyline = (bottom, fill) => SKYLINE.flatMap(([x, width, height], index) => [box(x, bottom - height, width, height, fill),
  ...[0, 1, 2].map(row => box(x + 18 + (index % 2) * 10, bottom - height + 30 + row * 46, 14, 20, '#ffd166', { opacity: index % 3 ? 0.7 : 0.25 }))])

// Church-style bell: dome, flared skirt, mouth and clapper.
const bell = (cx, cy, scale, fill, shade) => [
  circle(cx - 28 * scale, cy - 250 * scale, 56 * scale, shade), oval(cx - 120 * scale, cy - 200 * scale, 240 * scale, 300 * scale, fill),
  box(cx - 190 * scale, cy + 20 * scale, 380 * scale, 90 * scale, fill, { radius: 45 * scale }), oval(cx - 190 * scale, cy + 70 * scale, 380 * scale, 50 * scale, shade),
  circle(cx - 35 * scale, cy + 95 * scale, 70 * scale, shade), box(cx - 70 * scale, cy - 120 * scale, 26 * scale, 180 * scale, '#f5cf72', { radius: 13 * scale, opacity: 0.7 })]

// Papel picado flags with a hole and a scalloped bottom cut in the background color.
const flags = (y, colors, background, outline = '#d8cfb8') => [
  line(0, y - 30, 1080, 50, samples(20, t => [t, 4 * t * (1 - t)]), '#b9a77f', { weight: 4 }),
  ...Array.from({ length: 9 }, (_, index) => {
    const x = 14 + index * 118, color = colors[index % colors.length]
    return [box(x, y, 104, 150, color, color === '#ffffff' ? { stroke: outline, strokeWidth: 2 } : {}), circle(x + 36, y + 36, 32, background),
      ...[0, 1, 2].map(step => box(x + 14 + step * 30, y + 134, 24, 24, background, { rotation: 45 })), box(x + 8, y + 70, 88, 6, background), box(x + 8, y + 90, 88, 6, background)]
  }).flat()]

// Crown: three diamond peaks with gem tips over a banded base.
const crown = (cx, baseY, width, height, fill, gem) => {
  const baseTop = baseY - height * 0.35, gemSize = width * 0.09
  return [...[-1, 0, 1].flatMap(step => {
    const size = width * (step === 0 ? 0.38 : 0.3), px = cx + step * width * 0.31, [x, y] = centered(px, baseTop, size, size, 45)
    return [box(x, y, size, size, fill, { rotation: 45 }), circle(px - gemSize / 2, baseTop - size * 0.707 - gemSize / 2, gemSize, gem)]
  }), box(cx - width / 2, baseTop, width, height * 0.35, fill, { radius: 10 }), box(cx - width / 2, baseTop + height * 0.1, width, height * 0.05, gem, { opacity: 0.6 }),
  circle(cx - gemSize, baseTop + height * 0.175 - gemSize + 6, gemSize * 2, gem)]
}

const CLOCK_TICKS = Array.from({ length: 12 }, (_, index) => {
  const angle = index * 30, radians = angle * Math.PI / 180, [x, y] = centered(540 + 270 * Math.cos(radians), 420 + 270 * Math.sin(radians), 10, index % 3 === 0 ? 46 : 28, angle - 90), turn = (angle + 270) % 360
  return box(x, y, 10, index % 3 === 0 ? 46 : 28, '#14123a', { rotation: turn })
})
const GRAPES = Array.from({ length: 12 }, (_, index) => {
  const x = 80 + index * 78, y = 830 - 46 * Math.sin((index / 11) * Math.PI)
  return [circle(x, y, 62, '#8e44ad'), circle(x + 12, y + 10, 16, '#ffffff', { opacity: 0.35 }), text(x, y + 20, 62, 20, '#fff6e8', String(index + 1), { font: 'Space Mono', variant: 'bold', align: 'center', lineHeight: 1 })]
}).flat()

const ROSCA_STRIPS = Array.from({ length: 12 }, (_, index) => {
  const angle = index * 30, radians = angle * Math.PI / 180, [x, y] = centered(540 + 325 * Math.cos(radians), 540 + 325 * Math.sin(radians), 96, 26, angle + 90), turn = (angle + 90) % 360
  return box(x, y, 96, 26, '#fff6e8', { radius: 13, rotation: turn, opacity: 0.92 })
})
const ROSCA_FRUIT = Array.from({ length: 12 }, (_, index) => {
  const radians = ((index * 30 + 15) * Math.PI) / 180, size = 52
  return circle(Math.round(540 + 325 * Math.cos(radians) - size / 2), Math.round(540 + 325 * Math.sin(radians) - size / 2), size, ['#c0392b', '#2e8b57', '#f4c430'][index % 3])
})
const STAR_BEAM = Array.from({ length: 13 }, (_, index) => box(500, 440, 80, 1200, '#ffd166', { rotation: -30 + index * 5, opacity: 0.05 }))
const GIFT_SPOTS = [['#8e2c4f', 420], ['#1f7a7a', 960], ['#b5651d', 1500]]

export const HOLIDAYS_C = [
  { key: 'ano-nuevo-fuegos', name: 'Año Nuevo: fuegos artificiales', category: 'Fiestas de México', description: 'Cartel nocturno con cielo morado, cuatro fuegos artificiales, 2028 en dorado y horizonte de ciudad.',
    width: 1080, height: 1350, background: '#0b1026', objects: [
      ...gradientBands(0, 0, 1080, 1100, '#0b1026', '#3a1c71', 36),
      ...burst(300, 330, 40, 200, 18, '#ffd166'), ...burst(790, 260, 30, 150, 16, '#ff5d8f', { start: 10 }), ...burst(620, 540, 24, 130, 14, '#7bdff2'), ...burst(120, 640, 20, 90, 12, '#ffffff', { weight: 4, dot: 10 }),
      ...skyline(1350, '#05070f'), box(0, 1060, 1080, 290, '#05070f', { opacity: 0.88 }),
      text(40, 690, 1000, 300, '#ffd166', '2028', { font: 'Montserrat', variant: 'black', align: 'center', lineHeight: 1 }),
      text(40, 1080, 1000, 64, '#fff6e8', 'Feliz Año Nuevo', { font: 'Playfair Display', variant: 'semibold', align: 'center', lineHeight: 1 }),
      caps(40, 1170, 1000, '#ffd166', '31 DIC · CUENTA REGRESIVA 11:59 PM', { align: 'center', spacing: 80 }),
    ] },
  { key: 'ano-nuevo-doce-uvas', name: 'Año Nuevo: doce uvas', category: 'Fiestas de México', description: 'Reloj a punto de dar la medianoche con las doce uvas numeradas de la tradición mexicana.',
    width: 1080, height: 1080, background: '#14123a', objects: [
      circle(220, 100, 640, '#fff6e8'), ...rings(540, 420, [640, 600], '#ffd166', { weight: 8 }), ...CLOCK_TICKS,
      box(536, 190, 8, 232, '#14123a', { radius: 4 }), box(534, 260, 12, 162, '#14123a', { radius: 6 }), circle(522, 402, 36, '#ffd166'),
      icon('sparkle', 70, 120, 90, '#ffd166'), icon('sparkle', 920, 300, 60, '#ffd166'), icon('sparkle', 90, 480, 50, '#fff6e8'),
      ...GRAPES,
      text(40, 930, 1000, 56, '#fff6e8', 'Doce uvas, doce deseos', { font: 'Playfair Display', variant: 'italic', align: 'center', lineHeight: 1 }),
      caps(40, 1010, 1000, '#ffd166', 'MEDIANOCHE · 31 DE DICIEMBRE', { align: 'center', spacing: 160 }),
    ] },
  { key: 'ano-nuevo-propositos', name: 'Año Nuevo: propósitos', category: 'Fiestas de México', description: 'Historia vertical con lista de propósitos a mano, casillas marcadas, franjas doradas y confeti.',
    width: 1080, height: 1920, background: '#fff6e0', objects: [
      ...stripes(0, 0, 1080, 150, 5, '#e9b44c'), ...confetti({ x: 40, y: 500, width: 1000, height: 60 }, 22, ['#e9b44c', '#e63946', '#2a9d8f', '#14213d'], 5),
      text(40, 190, 1000, 300, '#e9b44c', '2028', { font: 'Montserrat', variant: 'black', align: 'center', lineHeight: 1 }),
      text(40, 560, 1000, 100, '#14213d', 'PROPÓSITOS', { font: 'Montserrat', variant: 'black', align: 'center', lineHeight: 1, spacing: 20 }), ...rule(340, 700, 400, '#e9b44c'),
      ...['Viajar más', 'Leer 12 libros', 'Ahorrar cada quincena', 'Hacer ejercicio', 'Cenar en familia', 'Aprender algo nuevo'].flatMap((value, index) => {
        const y = 780 + index * 165, done = index < 3
        return [box(90, y, 84, 84, '#e9b44c', { radius: 18, noFill: !done, strokeWidth: 5, stroke: '#14213d' }), ...(done ? [icon('check', 102, y + 12, 60, '#14213d')] : []),
          text(210, y + 6, 780, 62, '#14213d', value, { font: 'Caveat', variant: 'bold', lineHeight: 1 }), box(210, y + 82, 780, 3, '#14213d', { opacity: 0.25 })]
      }),
      ...chip(340, 1780, 400, 80, '#14213d', 'EMPIEZA HOY', '#fff6e8', { font: 'Montserrat', variant: 'bold', spacing: 80 }),
    ] },
  { key: 'independencia-grito', name: 'Independencia: el Grito', category: 'Fiestas de México', description: 'Cartel con papel picado tricolor, campana dorada sobre rayos y "¡Viva México!" en grande.',
    width: 1080, height: 1350, background: '#f6efe0', objects: [
      ...Array.from({ length: 28 }, (_, index) => box(538, 600, 12, 560, '#e9d9b8', { rotation: index * (360 / 28) })), ...flags(70, [GREEN, '#ffffff', RED], '#f6efe0'),
      ...bell(540, 570, 1.25, '#d99a2b', '#a8701a'),
      text(40, 870, 1000, 150, GREEN, 'VIVA\nMÉXICO', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 0.95 }),
      caps(40, 1215, 1000, RED, 'EL GRITO · 15 DE SEPTIEMBRE · 11 PM', { align: 'center', spacing: 80 }),
      box(0, 1290, 360, 60, GREEN), box(360, 1290, 360, 60, '#ffffff', { stroke: '#d8cfb8', strokeWidth: 2 }), box(720, 1290, 360, 60, RED),
    ] },
  { key: 'independencia-noche-mexicana', name: 'Independencia: noche mexicana', category: 'Fiestas de México', description: 'Invitación 16:9 con medalla tricolor de círculos concéntricos, zigzag de sarape y título en serif.',
    width: 1920, height: 1080, background: '#00331f', objects: [
      ...gradientBands(0, 0, 1920, 1080, '#00331f', GREEN, 30),
      circle(1180, 160, 700, RED), circle(1250, 230, 560, '#ffffff'), circle(1320, 300, 420, GREEN), ...rings(1530, 510, [780], '#ffffff', { weight: 4, dash: 'dashed', opacity: 0.6 }),
      text(1320, 410, 420, 80, '#ffffff', '¡VIVA\nMÉXICO!', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      icon('sparkle', 1020, 120, 70, '#ffd166'), icon('sparkle', 1740, 90, 50, '#ffd166'), icon('sparkle', 1800, 800, 70, '#ffd166'),
      caps(120, 120, 800, '#ffd166', '15 DE SEPTIEMBRE · 8 PM', { spacing: 160 }),
      text(114, 170, 1000, 170, '#fff6e8', 'Noche\nMexicana', { font: 'Playfair Display', variant: 'bold', lineHeight: 0.95 }),
      text(120, 560, 900, 30, '#d6efe3', 'Mariachi, antojitos y\nfuegos artificiales a la medianoche.', { font: 'Lora', variant: 'italic', lineHeight: 1.35 }),
      ...chip(120, 740, 240, 64, '#ffd166', 'MARIACHI', '#00331f', { font: 'Montserrat', variant: 'black' }), ...chip(380, 740, 240, 64, '#ffffff', 'ANTOJITOS', '#00331f', { font: 'Montserrat', variant: 'black' }), ...chip(640, 740, 240, 64, RED, 'FUEGOS', '#ffffff', { font: 'Montserrat', variant: 'black' }),
      zigzag(0, 940, 1920, 70, 48, RED, { weight: 14 }), zigzag(0, 970, 1920, 70, 48, '#ffffff', { weight: 10 }),
    ] },
  { key: 'independencia-menu-patrio', name: 'Independencia: menú patrio', category: 'Fiestas de México', description: 'Menú vertical de cena patria con cinta tricolor, trío de chiles en nogada y precios con puntos guía.',
    width: 1080, height: 1920, background: '#fffaf0', objects: [
      box(0, 0, 360, 70, GREEN), box(360, 0, 360, 70, '#ffffff', { stroke: '#d8cfb8', strokeWidth: 2 }), box(720, 0, 360, 70, RED),
      text(40, 150, 1000, 120, GREEN, 'Menú patrio', { font: 'Playfair Display', variant: 'bold', align: 'center', lineHeight: 1 }), caps(40, 290, 1000, RED, 'CENA DEL 15 DE SEPTIEMBRE', { align: 'center', spacing: 160 }),
      ...[[GREEN, 330], [ '#ffffff', 480], [RED, 630]].flatMap(([fill, x]) => [circle(x, 400, 120, fill, fill === '#ffffff' ? { stroke: '#d8cfb8', strokeWidth: 3 } : {}), icon('sparkle', x + 40, 440, 40, fill === '#ffffff' ? GREEN : '#ffffff')]),
      ...[['Pozole rojo', 'Maíz cacahuazintle y chile guajillo', '$120'], ['Chiles en nogada', 'Receta de temporada', '$185'], ['Tostadas de tinga', 'Con crema y queso fresco', '$90'], ['Esquites', 'Epazote, limón y chile piquín', '$60'], ['Agua de jamaica', 'Jarra para compartir', '$40']].flatMap(([name, note, price], index) => {
        const y = 700 + index * 190
        return [text(90, y, 640, 54, '#2b1b12', name, { font: 'Playfair Display', variant: 'semibold', lineHeight: 1 }), text(90, y + 70, 700, 28, '#7a6a55', note, { font: 'Lora', variant: 'italic', lineHeight: 1 }),
          line(560, y + 24, 300, 8, [[0, 0.5], [1, 0.5]], '#c9b88f', { weight: 4, dash: 'dotted' }), text(860, y, 130, 54, RED, price, { font: 'Oswald', variant: 'semibold', align: 'right', lineHeight: 1 })]
      }),
      box(0, 1700, 1080, 220, GREEN), ...chip(340, 1760, 400, 80, '#ffffff', 'RESERVA TU MESA', GREEN, { font: 'Montserrat', variant: 'black', spacing: 60 }),
    ] },
  { key: 'reyes-rosca', name: 'Reyes: rosca', category: 'Fiestas de México', description: 'Rosca de Reyes vista desde arriba con azúcar, frutas cristalizadas y título al centro.',
    width: 1080, height: 1080, background: '#fff1dc', objects: [
      ...stripes(0, 0, 1080, 90, 4, '#2a9d8f', 0.8), ...stripes(0, 990, 1080, 90, 4, '#2a9d8f', 0.8),
      circle(140, 140, 800, '#d9893b'), circle(290, 290, 500, '#fff1dc'), ...rings(540, 540, [790, 510], '#b86a24', { weight: 6, dash: 'dashed' }), ...ROSCA_STRIPS, ...ROSCA_FRUIT,
      circle(820, 300, 48, '#f6d7b0'), box(804, 340, 32, 40, '#2a9d8f', { radius: 10 }),
      text(290, 430, 500, 110, '#8a4b14', 'Rosca\nde Reyes', { font: 'Pacifico', align: 'center', lineHeight: 1 }), caps(290, 690, 500, '#8a4b14', '6 DE ENERO', { align: 'center', spacing: 200 }),
    ] },
  { key: 'reyes-estrella', name: 'Reyes: la estrella', category: 'Fiestas de México', description: 'Historia con estrella guía y haz de luz, tres coronas, y carta a los Reyes Magos.',
    width: 1080, height: 1920, background: '#071033', objects: [
      ...gradientBands(0, 0, 1080, 1300, '#071033', '#2a2a72', 40), ...STAR_BEAM,
      ...[420, 300].flatMap((size, index) => starburst(540, 400, size, index ? '#fff6c8' : '#ffd166', { layers: 4 })), circle(500, 360, 80, '#ffffff'),
      text(40, 700, 1000, 110, '#fff6e8', 'Ya vienen los\nReyes Magos', { font: 'Cormorant Garamond', variant: 'semiboldItalic', align: 'center', lineHeight: 1.05 }),
      ...[[250, '#ffd166', '#c0392b', 'MELCHOR'], [540, '#f6e7a1', '#2a9d8f', 'GASPAR'], [830, '#e9b44c', '#8e44ad', 'BALTASAR']].flatMap(([x, fill, gem, name]) => [...crown(x, 1230, 220, 190, fill, gem), caps(x - 130, 1255, 260, '#fff6e8', name, { align: 'center', spacing: 60 })]),
      box(140, 1380, 800, 380, '#fff6e8', { radius: 16, rotation: -1.5 }), text(190, 1420, 700, 50, '#3b2e22', 'Queridos Reyes Magos:', { font: 'Caveat', variant: 'bold', lineHeight: 1 }),
      text(190, 1500, 700, 42, '#3b2e22', 'Este año me porté muy bien.\nTrae un regalo para mi familia.', { font: 'Caveat', lineHeight: 1.2 }), text(190, 1670, 700, 42, '#c0392b', 'Con cariño, tu nombre', { font: 'Caveat', variant: 'bold', lineHeight: 1 }),
      ...chip(340, 1810, 400, 70, '#ffd166', 'ESCRIBE TU CARTA', '#071033', { font: 'Montserrat', variant: 'black', spacing: 60 }),
    ] },
  { key: 'reyes-tres-arcos', name: 'Reyes: tres arcos', category: 'Fiestas de México', description: 'Invitación 16:9 a la fiesta de Reyes: tres arcos con corona y regalo para cada rey, y detalles del evento.',
    width: 1920, height: 1080, background: '#2b1646', objects: [
      text(60, 50, 1800, 100, '#fff6e8', 'Fiesta de Reyes', { font: 'Playfair Display', variant: 'bold', align: 'center', lineHeight: 1 }), ...rule(760, 175, 400, '#ffd166'),
      ...GIFT_SPOTS.flatMap(([panel, x], index) => {
        const cx = x, name = ['MELCHOR', 'GASPAR', 'BALTASAR'][index], gold = ['#ffd166', '#f6e7a1', '#e9b44c'][index]
        return [box(cx - 240, 220, 480, 640, panel, { radius: 240 }), box(cx - 240, 620, 480, 240, panel), icon('sparkle', cx - 30, 270, 60, '#fff6e8'), ...crown(cx, 560, 260, 220, gold, '#c0392b'),
          box(cx - 80, 640, 160, 130, '#fff6e8', { radius: 8 }), box(cx - 12, 640, 24, 130, gold), box(cx - 80, 695, 160, 20, gold), caps(cx - 200, 800, 400, '#fff6e8', name, { align: 'center', spacing: 120 })]
      }),
      caps(60, 940, 1800, '#ffd166', 'SÁBADO 6 DE ENERO · 5 PM · ROSCA Y CHOCOLATE CALIENTE', { align: 'center', spacing: 100 }),
      text(60, 985, 1800, 30, '#d9c9f0', 'Trae tu carta y un regalo para intercambiar.', { font: 'Lora', variant: 'italic', align: 'center', lineHeight: 1 }),
    ] },
]
