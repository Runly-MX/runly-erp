// Mexican holiday starting points: Día de Muertos, posada navideña and Día de las Madres.
import { box, centered, chip, circle, confetti, dotGrid, flower, icon, line, oval, rings, rule, samples, stripes, text } from './templates-motifs.js'

const caps = (x, y, width, fill, value, options = {}) => text(x, y, width, 18, fill, value, { font: 'Space Mono', spacing: 100, ...options })

// Papel picado flag: colored sheet with a round hole and scalloped bottom cut in the background color.
const FLAG_COLORS = ['#ff2e93', '#ff8c1a', '#ffd23f', '#19c3b1', '#9b5de5']
const bunting = (y, background) => [
  line(0, y - 30, 1080, 50, samples(20, t => [t, 4 * t * (1 - t)]), '#e8d9b8', { weight: 4 }),
  ...Array.from({ length: 9 }, (_, index) => {
    const x = 14 + index * 118, color = FLAG_COLORS[index % FLAG_COLORS.length]
    return [box(x, y, 104, 150, color), circle(x + 36, y + 36, 32, background),
      ...[0, 1, 2].map(step => box(x + 14 + step * 30, y + 134, 24, 24, background, { rotation: 45 })), box(x + 8, y + 70, 88, 6, background), box(x + 8, y + 90, 88, 6, background)]
  }).flat()]

const BULB_COLORS = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#ff924c']
const lights = y => [line(0, y, 1080, 70, samples(24, t => [t, 1 - 4 * t * (1 - t)]), '#0a2a20', { weight: 4 }),
  ...Array.from({ length: 12 }, (_, index) => { const t = (index + 0.5) / 12; return circle(Math.round(t * 1080 - 14), Math.round(y + 70 * (1 - 4 * t * (1 - t)) + 4), 28, BULB_COLORS[index % 5]) })]

const SUGAR_MOUTH = samples(14, t => [t, 0.5 + 0.3 * Math.sin(t * Math.PI * 6)])
const WREATH = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2, [petal, center, accent] = [['#e63a6e', '#ffd23f', '#ff7aa2'], ['#ff8fab', '#fff3b0', '#e63a6e'], ['#ffb703', '#e63a6e', '#ffd166']][index % 3]
  return flower(Math.round(540 + 400 * Math.cos(angle)), Math.round(470 + 390 * Math.sin(angle)), 150, petal, center, { accent })
}).flat()
const TASSELS = ['#e63946', '#ffb703', '#2a9d8f', '#9b5de5', '#4dabf7'].map((color, index) => line(470 + index * 36, 740, 30, 110, samples(14, t => [0.5 + 0.4 * Math.sin(t * 5 + index), t]), color, { weight: 10 }))

export const HOLIDAY_TEMPLATES = [
  { key: 'dia-de-muertos', name: 'Día de Muertos', category: 'Fiestas de México', description: 'Ofrenda con papel picado, calavera de azúcar y flores de cempasúchil sobre fondo morado.',
    width: 1080, height: 1350, background: '#2a0f3d', objects: [
      ...bunting(70, '#2a0f3d'),
      ...rings(540, 620, [560, 480], '#ff8c1a', { weight: 3, opacity: 0.35, dash: 'dashed' }),
      circle(360, 410, 360, '#fff6e8'), box(420, 700, 240, 140, '#fff6e8', { radius: 56 }),
      ...[[455, 570, '#ff2e93'], [625, 570, '#ffd23f']].flatMap(([x, y, color]) => [...rings(x, y, [140, 104], color, { weight: 7 }), circle(x - 36, y - 36, 72, '#2a0f3d'), circle(x - 11, y - 11, 22, color)]),
      box(...centered(540, 655, 40, 40, 45), 40, 40, '#2a0f3d', { rotation: 45 }),
      circle(500, 420, 80, '#ff8c1a'), circle(520, 440, 40, '#ffd23f'), ...dotGrid(390, 650, 3, 2, 20, 8, '#ff2e93'), ...dotGrid(640, 650, 3, 2, 20, 8, '#ff2e93'),
      line(430, 750, 220, 30, SUGAR_MOUTH, '#2a0f3d', { weight: 6 }), ...[450, 490, 530, 570, 610].map(x => box(x, 738, 8, 36, '#2a0f3d')),
      ...flower(150, 470, 240, '#ff8c1a', '#ffd23f', { petals: 12, accent: '#ffb703' }), ...flower(930, 470, 240, '#ff8c1a', '#ffd23f', { petals: 12, accent: '#ffb703' }),
      ...flower(190, 1190, 230, '#ffb703', '#ff8c1a', { petals: 12, accent: '#ff8c1a' }), ...flower(890, 1190, 230, '#ffb703', '#ff8c1a', { petals: 12, accent: '#ff8c1a' }), ...flower(540, 1245, 170, '#ff8c1a', '#ffd23f', { petals: 10 }),
      text(60, 880, 960, 130, '#ffd23f', 'Día de Muertos', { font: 'Lobster', align: 'center', lineHeight: 1 }),
      caps(60, 1040, 960, '#fff6e8', 'HONRAMOS SU MEMORIA · 1 Y 2 DE NOVIEMBRE', { align: 'center', spacing: 80 }),
      ...rule(340, 1090, 400, '#ff2e93'),
    ] },
  { key: 'posada-navidena', name: 'Posada navideña', category: 'Fiestas de México', description: 'Invitación de posada con piñata de estrella de colores, luces, confeti y nieve.',
    width: 1080, height: 1350, background: '#0f3d2e', objects: [
      ...confetti({ x: 40, y: 200, width: 1000, height: 650 }, 40, ['#ffca3a', '#ff595e', '#ffffff', '#8ac926'], 11),
      box(538, 120, 4, 160, '#d9c9a8'), ...lights(20),
      ...[380, 300, 220, 140].flatMap((size, index) => Array.from({ length: 4 }, (_, layer) => {
        const rotation = (90 / 4) * layer, [x, y] = centered(540, 520, size, size, rotation)
        return box(x, y, size, size, ['#e63946', '#ffb703', '#2a9d8f', '#9b5de5'][index], { rotation })
      })),
      circle(500, 480, 80, '#fff6e8'), icon('sparkle', 510, 490, 60, '#e63946'), ...TASSELS,
      oval(-120, 1180, 760, 320, '#ffffff'), oval(380, 1210, 820, 320, '#e8f1ee'),
      text(40, 860, 1000, 150, '#fff6e8', 'Feliz Navidad', { font: 'Dancing Script', variant: 'bold', align: 'center', lineHeight: 1 }),
      caps(40, 1030, 1000, '#ffca3a', 'POSADA · 16 DE DICIEMBRE · 7:00 PM', { align: 'center', spacing: 120 }),
      text(40, 1075, 1000, 28, '#fff6e8', 'Ponche, piñata y villancicos', { font: 'Raleway', variant: 'medium', align: 'center' }),
      ...chip(380, 1160, 320, 70, '#ffca3a', 'CONFIRMA', '#0f3d2e', { font: 'Montserrat', variant: 'black' }),
    ] },
  { key: 'dia-de-las-madres', name: 'Día de las Madres', category: 'Fiestas de México', description: 'Tarjeta del 10 de mayo con corona de flores, "Mamá" en script y franjas de rebozo con fleco.',
    width: 1080, height: 1080, background: '#ffe5ec', objects: [
      ...WREATH,
      icon('heart', 480, 150, 120, '#e63a6e'),
      text(140, 270, 800, 250, '#e63a6e', 'Mamá', { font: 'Pacifico', align: 'center', lineHeight: 1 }),
      text(140, 560, 800, 38, '#7a2a45', 'Feliz 10 de mayo', { font: 'Raleway', variant: 'semibold', align: 'center', spacing: 40, lineHeight: 1 }),
      text(140, 630, 800, 48, '#7a2a45', 'Gracias por tanto amor', { font: 'Caveat', variant: 'bold', align: 'center', lineHeight: 1 }),
      box(0, 930, 1080, 150, '#fff5f8'), ...stripes(0, 940, 1080, 60, 3, '#e63a6e'), box(0, 1010, 1080, 14, '#ffb703'), box(0, 1034, 1080, 14, '#2a9d8f'),
      ...Array.from({ length: 108 }, (_, index) => box(index * 10 + 3, 1048, 4, 32, index % 3 === 0 ? '#e63a6e' : index % 3 === 1 ? '#ffb703' : '#2a9d8f')),
    ] },
]
