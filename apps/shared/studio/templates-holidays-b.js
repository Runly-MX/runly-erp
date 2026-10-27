// Mexican holiday templates, batch B: Día de la Bandera, Día del Padre, Día de los Abuelos.
// The flag is drawn with tricolor bands only (no coat of arms or official emblem).
import { box, centered, chip, circle, gradientBands, halftone, icon, line, oval, rings, rule, samples, shadowBox, sunburst, text, zigzag } from './templates-motifs.js'

const GREEN = '#006847', RED = '#ce1126', WHITE = '#ffffff'
const caps = (x, y, width, fill, value, options = {}) => text(x, y, width, 18, fill, value, { font: 'Space Mono', spacing: 120, ...options })

// Waving flag: vertical slices of the three bands with a sine offset and wave shading.
const flagWave = (x, y, width, height, slices, amplitude, cycles) => {
  const sliceWidth = width / slices
  return Array.from({ length: slices }, (_, index) => {
    const t = index / slices, phase = t * cycles * Math.PI * 2, top = Math.round(y + amplitude * Math.sin(phase)), left = Math.round(x + index * sliceWidth)
    const shade = Math.round(Math.max(0, -Math.cos(phase)) * 12) / 100, light = Math.round(Math.max(0, Math.cos(phase)) * 8) / 100
    return [box(left, top, Math.ceil(sliceWidth) + 1, height, [GREEN, WHITE, RED][Math.floor(t * 3)], { stroke: undefined }),
      ...(shade > 0.02 ? [box(left, top, Math.ceil(sliceWidth) + 1, height, '#000000', { opacity: shade })] : []),
      ...(light > 0.02 ? [box(left, top, Math.ceil(sliceWidth) + 1, height, '#ffffff', { opacity: light })] : [])]
  }).flat()
}

// Laurel branches: leaves along two arcs around a center.
const laurel = (cx, cy, radius, fill) => [[110, 250, 1], [-70, 70, -1]].flatMap(([from, to, side]) =>
  Array.from({ length: 11 }, (_, index) => {
    const angle = from + ((to - from) / 10) * index, radians = angle * Math.PI / 180, rotation = angle + 90 - side * 22
    const [x, y] = centered(cx + radius * Math.cos(radians), cy + radius * Math.sin(radians), 120, 46, rotation)
    return oval(x, y, 120, 46, fill, { rotation })
  }))

// Ribbon band rotated around the canvas center, shifted along its perpendicular.
const ribbon = (offset, color, rotation = -25, outline) => {
  const angle = rotation * Math.PI / 180, [x, y] = centered(540 + offset * -Math.sin(angle), 540 + offset * Math.cos(angle), 1700, 240, rotation)
  return box(x, y, 1700, 240, color, { rotation, ...(outline ? { stroke: outline, strokeWidth: 3 } : {}) })
}

const gingham = (width, height, color) => [
  ...Array.from({ length: Math.ceil(width / 180) }, (_, index) => box(index * 180, 0, 90, height, color, { opacity: 0.28 })),
  ...Array.from({ length: Math.ceil(height / 180) }, (_, index) => box(0, index * 180, width, 90, color, { opacity: 0.28 }))]

const cup = (x, y, color) => [
  oval(x - 20, y + 140, 300, 50, '#fff3e0', { opacity: 0.95 }), rings(x + 250, y + 60, [90], color, { weight: 18 })[0],
  box(x, y, 240, 160, color, { radius: 70 }), box(x, y, 240, 70, color), oval(x + 10, y - 6, 220, 40, '#6b3e26'),
  ...[0, 1, 2].map(index => line(x + 50 + index * 60, y - 190, 40, 160, samples(14, t => [0.5 + 0.4 * Math.sin(t * Math.PI * 2.4 + index), t]), '#fff3e0', { weight: 8, opacity: 0.7 }))]

const TREE_HEARTS = [[250, 200, '#e63946'], [470, 140, '#ff8fab'], [650, 240, '#e63946'], [370, 330, '#ff8fab'], [800, 160, '#ff8fab'], [160, 330, '#ff8fab'], [570, 370, '#e63946'], [760, 380, '#e63946']]
const HAMMER = centered(1570, 388, 200, 80, 35)

export const HOLIDAYS_B = [
  { key: 'bandera-ondeante', name: 'Bandera ondeante', category: 'Fiestas de México', description: 'Cartel del 24 de febrero con bandera tricolor ondeando en asta dorada y titular en serif.',
    width: 1080, height: 1350, background: '#f7f1e3', objects: [
      box(70, 230, 22, 1010, '#6b5a3a', { radius: 11 }), circle(53, 190, 56, '#c9a24a'),
      ...flagWave(92, 300, 890, 560, 36, 26, 1.2),
      caps(100, 110, 880, GREEN, '24 DE FEBRERO · DÍA DE LA BANDERA'), ...rule(340, 170, 400, RED),
      text(100, 930, 880, 130, '#1f2d1f', 'Día de la\nBandera', { font: 'Playfair Display', variant: 'bold', align: 'left', lineHeight: 1 }),
      text(100, 1230, 880, 28, '#4a4a3a', 'Orgullo, unidad e identidad', { font: 'Raleway', variant: 'medium', spacing: 60 }),
    ] },
  { key: 'bandera-cintas', name: 'Cintas tricolor', category: 'Fiestas de México', description: 'Cuadrada geométrica con tres cintas diagonales verde, blanca y roja cruzando el lienzo y tarjeta central con sombra dura.',
    width: 1080, height: 1080, background: '#fff8e8', objects: [
      ribbon(-250, GREEN), ribbon(0, WHITE, -25, '#d8d0bd'), ribbon(250, RED),
      icon('sparkle', 60, 60, 70, GREEN), icon('sparkle', 950, 950, 70, RED),
      ...shadowBox(190, 370, 700, 340, WHITE, { offset: 12, shadow: '#1b1b1b', stroke: '#1b1b1b', strokeWidth: 5, radius: 24 }),
      text(190, 400, 700, 100, '#1b1b1b', 'Día de la\nBandera', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      ...chip(360, 640, 360, 56, RED, '24 DE FEBRERO', WHITE, { font: 'Montserrat', variant: 'bold', spacing: 60 }),
    ] },
  { key: 'bandera-laurel', name: 'Honor y laurel', category: 'Fiestas de México', description: 'Historia vertical con tres columnas tricolor, círculo blanco con corona de laurel dorada y fecha grande.',
    width: 1080, height: 1920, background: '#ffffff', objects: [
      box(0, 0, 360, 1920, GREEN), box(360, 0, 360, 1920, WHITE), box(720, 0, 360, 1920, RED),
      ...halftone(0, 1300, 6, 6, 60, 36, '#ffffff', { toward: 'down', opacity: 0.18 }), ...halftone(720, 1300, 6, 6, 60, 36, '#ffffff', { toward: 'down', opacity: 0.18 }),
      caps(60, 100, 960, '#ffffff', 'MÉXICO', { align: 'center', spacing: 400 }),
      circle(190, 500, 700, WHITE, { stroke: '#e8e2d0', strokeWidth: 4 }), ...laurel(540, 850, 380, '#c9a24a'),
      text(190, 680, 700, 300, GREEN, '24', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      text(190, 1030, 700, 44, RED, 'DE FEBRERO', { font: 'Montserrat', variant: 'bold', align: 'center', spacing: 200, lineHeight: 1 }),
      box(60, 1420, 960, 330, WHITE, { radius: 28 }),
      text(60, 1450, 960, 100, GREEN, 'Día de la\nBandera', { font: 'Playfair Display', variant: 'bold', align: 'center', lineHeight: 1 }),
      text(60, 1690, 960, 26, '#4a4a3a', 'Honra los colores que nos unen', { font: 'Raleway', variant: 'medium', align: 'center' }),
    ] },
  { key: 'padre-bigote', name: 'Papá bigotón', category: 'Fiestas de México', description: 'Cuadrada divertida con bigote gigante sobre fondo mostaza con semitono y titular en Bitter.',
    width: 1080, height: 1080, background: '#f2c14e', objects: [
      ...halftone(40, 40, 14, 14, 76, 44, '#e0a82e', { toward: 'down' }),
      caps(60, 90, 960, '#2b2118', '¡GRACIAS, PAPÁ!', { align: 'center', spacing: 300 }),
      ...[[400, 480, -14], [680, 480, 14]].map(([cx, cy, rotation]) => { const [x, y] = centered(cx, cy, 340, 130, rotation); return oval(x, y, 340, 130, '#2b2118', { rotation }) }),
      circle(490, 380, 100, '#2b2118'), ...rings(215, 440, [120], '#2b2118', { weight: 28 }), ...rings(865, 440, [120], '#2b2118', { weight: 28 }),
      text(60, 650, 960, 120, '#2b2118', 'Feliz Día\ndel Padre', { font: 'Bitter', variant: 'bold', align: 'center', lineHeight: 0.95 }),
      ...chip(290, 940, 500, 70, '#2b2118', 'TERCER DOMINGO DE JUNIO', '#f2c14e', { font: 'Montserrat', variant: 'bold', spacing: 40 }),
    ] },
  { key: 'padre-campeon', name: 'Papá campeón', category: 'Fiestas de México', description: 'Historia con trofeo dorado, rayos y degradado azul marino: "Papá campeón".',
    width: 1080, height: 1920, background: '#10233f', objects: [
      ...gradientBands(0, 0, 1080, 1920, '#10233f', '#1d4372', 40), ...sunburst(540, 820, 900, 36, '#ffffff', { weight: 8, opacity: 0.06 }),
      ...rings(345, 650, [170], '#e0b84f', { weight: 28 }), ...rings(735, 650, [170], '#e0b84f', { weight: 28 }),
      box(360, 520, 360, 220, '#e0b84f'), box(360, 560, 360, 400, '#e0b84f', { radius: 170 }), box(400, 570, 28, 300, '#ffffff', { radius: 14, opacity: 0.35 }),
      box(500, 950, 80, 190, '#c9a24a'), box(430, 1120, 220, 70, '#e0b84f', { radius: 10 }), box(380, 1180, 320, 60, '#c9a24a', { radius: 12 }),
      text(360, 650, 360, 200, '#10233f', '1', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      icon('sparkle', 180, 420, 90, '#e0b84f'), icon('sparkle', 860, 380, 70, '#ffffff'), icon('sparkle', 820, 900, 60, '#e0b84f'),
      caps(60, 140, 960, '#e0b84f', 'EL MEJOR DEL MUNDO', { align: 'center', spacing: 260 }),
      text(60, 1290, 960, 240, '#ffffff', 'PAPÁ', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      text(60, 1570, 960, 130, '#e0b84f', 'CAMPEÓN', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1, spacing: 80 }),
      ...chip(300, 1760, 480, 80, '#e0b84f', 'FELIZ DÍA DEL PADRE', '#10233f', { font: 'Montserrat', variant: 'black', spacing: 20 }),
    ] },
  { key: 'padre-taller', name: 'Taller de papá', category: 'Fiestas de México', description: 'Banner 16:9 en papel kraft con tablero de puntos y herramientas: martillo, llave y desarmador.',
    width: 1920, height: 1080, background: '#c9a67a', objects: [
      ...Array.from({ length: 13 * 24 }, (_, index) => circle(36 + (index % 24) * 80, 40 + Math.floor(index / 24) * 80, 10, '#a98652')),
      box(...centered(1450, 560, 40, 420, 35), 40, 420, '#7b4a2a', { rotation: 35, radius: 14 }), box(HAMMER[0], HAMMER[1], 200, 80, '#4a4a4a', { rotation: 35, radius: 10 }),
      box(...centered(1250, 620, 36, 380, -30), 36, 380, '#9aa0a6', { rotation: -30, radius: 12 }), ...rings(1155, 455, [120], '#9aa0a6', { weight: 34 }), ...rings(1345, 785, [100], '#9aa0a6', { weight: 30 }),
      box(1723, 790, 14, 230, '#b0b5ba'), box(1698, 640, 64, 150, RED, { radius: 20 }), box(1708, 660, 10, 100, '#ffffff', { radius: 5, opacity: 0.4 }),
      caps(100, 130, 900, '#7b4a2a', 'TERCER DOMINGO DE JUNIO', { spacing: 200 }),
      text(94, 190, 1000, 190, '#2b2118', 'Feliz Día\ndel Padre', { font: 'Oswald', variant: 'bold', lineHeight: 0.95 }),
      text(100, 640, 1000, 76, '#7b2d1a', 'Para el que todo lo arregla', { font: 'Caveat', variant: 'bold', lineHeight: 1 }),
      ...chip(100, 820, 420, 80, RED, 'HECHO CON AMOR', WHITE, { font: 'Montserrat', variant: 'bold', spacing: 60 }),
    ] },
  { key: 'abuelos-vichy', name: 'Abuelos en vichy', category: 'Fiestas de México', description: 'Tarjeta con fondo de cuadros vichy terracota, borde de puntada punteado, corazón y mensaje manuscrito.',
    width: 1080, height: 1350, background: '#fff3e0', objects: [
      ...gingham(1080, 1350, '#e76f51'),
      box(110, 200, 860, 950, '#fffaf0', { radius: 36 }), box(130, 220, 820, 910, '#e76f51', { noFill: true, strokeWidth: 4, stroke: '#e76f51', dash: 'dashed', radius: 24 }),
      icon('heart', 460, 270, 160, '#e76f51'), icon('sparkle', 190, 290, 60, '#e9c46a'), icon('sparkle', 830, 290, 60, '#e9c46a'),
      text(110, 470, 860, 100, '#5a2d1a', 'Día de los\nAbuelos', { font: 'Merriweather', variant: 'bold', align: 'center', lineHeight: 1.05 }),
      ...rule(340, 760, 400, '#e76f51'),
      text(110, 810, 860, 60, '#5a2d1a', 'Gracias por sus historias,\nsus abrazos y sus consejos', { font: 'Caveat', variant: 'bold', align: 'center', lineHeight: 1.1 }),
      ...chip(330, 1010, 420, 70, '#e76f51', '28 DE AGOSTO', WHITE, { font: 'Montserrat', variant: 'bold', spacing: 60 }),
    ] },
  { key: 'abuelos-arbol', name: 'Árbol de raíces', category: 'Fiestas de México', description: 'Cuadrada con árbol frondoso lleno de corazones sobre pasto: "Abuelos, nuestras raíces".',
    width: 1080, height: 1080, background: '#e8f1de', objects: [
      box(480, 480, 120, 440, '#7a5230', { radius: 40 }),
      line(300, 300, 280, 240, [[0, 0], [0.5, 0.6], [1, 1]], '#7a5230', { weight: 36 }), line(500, 280, 290, 260, [[1, 0], [0.5, 0.6], [0, 1]], '#7a5230', { weight: 36 }),
      circle(120, 90, 380, '#6aa84f'), circle(340, 40, 400, '#7fbf5f'), circle(560, 90, 380, '#5a9a42'), circle(230, 240, 360, '#7fbf5f'), circle(460, 220, 380, '#6aa84f'), circle(660, 260, 320, '#7fbf5f'),
      ...TREE_HEARTS.map(([x, y, color]) => icon('heart', x, y, 56, color)),
      oval(40, 880, 1000, 240, '#a7cf8a'),
      text(40, 930, 1000, 64, '#2f5d2a', 'Abuelos, nuestras raíces', { font: 'Nunito', variant: 'extrabold', align: 'center', lineHeight: 1 }),
      caps(40, 1015, 1000, '#2f5d2a', '28 DE AGOSTO · DÍA DE LOS ABUELOS', { align: 'center', spacing: 100 }),
    ] },
  { key: 'abuelos-cafecito', name: 'Café con abuelo', category: 'Fiestas de México', description: 'Banner 16:9 cálido: dos tazas humeantes y pan dulce sobre la mesa, greca tejida y frase para los abuelos.',
    width: 1920, height: 1080, background: '#2b1a10', objects: [
      ...gradientBands(0, 0, 1920, 1080, '#5a3a26', '#2b1a10', 30),
      zigzag(0, 0, 1920, 40, 48, '#e9c46a', { weight: 10 }), zigzag(0, 1040, 1920, 40, 48, '#e9c46a', { weight: 10 }),
      box(1000, 790, 920, 250, '#3d2616'), ...cup(1130, 610, '#fff3e0'), ...cup(1520, 610, '#e9c46a'),
      circle(1330, 850, 150, '#e9a66b'), ...sunburst(1405, 925, 70, 12, '#c97f45', { weight: 5 }),
      caps(120, 170, 900, '#e9c46a', 'DÍA DE LOS ABUELOS · 28 DE AGOSTO', { spacing: 160 }),
      text(114, 230, 900, 130, '#fff3e0', 'Una charla,\nun café,\nun abrazo', { font: 'Playfair Display', variant: 'italic', lineHeight: 1 }),
      ...chip(120, 820, 380, 76, '#e9c46a', 'GRACIAS, ABUELOS', '#2b1a10', { font: 'Montserrat', variant: 'black', spacing: 40 }),
    ] },
]
