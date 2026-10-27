// Mexican holiday templates, batch A: Día de Muertos, Navidad, Día de las Madres and San Valentín.
import { box, centered, chip, circle, dotGrid, doubleFrame, flower, gradientBands, halftone, icon, line, oval, rings, rule, shadowBox, starburst, sunburst, text, zigzag } from './templates-motifs.js'

const caps = (x, y, width, fill, value, options = {}) => text(x, y, width, 18, fill, value, { font: 'Space Mono', spacing: 100, ...options })

// Sugar skull: head and jaw outlined in ink, ringed eyes, diamond nose and teeth.
const skull = (cx, cy, size, ink, accent) => [
  box(cx - size * 0.3, cy + size * 0.3, size * 0.6, size * 0.3, '#ffffff', { radius: size * 0.12, stroke: ink, strokeWidth: 5 }),
  circle(cx - size / 2, cy - size / 2, size, '#ffffff', { stroke: ink, strokeWidth: 5 }),
  ...[-1, 1].flatMap(side => [circle(cx + side * size * 0.19 - size * 0.19, cy - size * 0.02 - size * 0.19, size * 0.38, accent, { noFill: true, strokeWidth: 5, stroke: accent }),
    circle(cx + side * size * 0.19 - size * 0.12, cy - size * 0.02 - size * 0.12, size * 0.24, ink)]),
  (([x, y]) => box(x, y, size * 0.09, size * 0.09, ink, { rotation: 45 }))(centered(cx, cy + size * 0.17, size * 0.09, size * 0.09, 45)),
  ...[0, 1, 2, 3].map(index => box(cx - size * 0.15 + index * size * 0.1, cy + size * 0.36, 4, size * 0.16, ink))]

// Altar candle with flame and soft glow.
const candle = (x, baseY) => [circle(x - 20, baseY - 105, 60, '#ffd23f', { opacity: 0.22 }), box(x, baseY - 70, 20, 70, '#fff6e8'), oval(x + 3, baseY - 104, 14, 30, '#ffd23f')]

// Nordic wreath: tangent leaves in two greens and red berries.
const wreath = (cx, cy, radius) => [
  ...Array.from({ length: 22 }, (_, index) => {
    const angle = (360 / 22) * index, radians = angle * Math.PI / 180, rotation = (angle + 90 + (index % 2 ? 25 : -25)) % 360
    const [x, y] = centered(cx + radius * Math.cos(radians), cy + radius * Math.sin(radians), 110, 44, rotation)
    return oval(x, y, 110, 44, index % 2 ? '#2d6a4f' : '#40916c', { rotation })
  }),
  ...Array.from({ length: 8 }, (_, index) => { const radians = ((360 / 8) * index + 9) * Math.PI / 180; return circle(Math.round(cx + radius * Math.cos(radians) - 13), Math.round(cy + radius * Math.sin(radians) - 13), 26, '#c1121f') }),
  ...[-1, 1].map(side => { const [x, y] = centered(cx + side * 56, cy + radius + 20, 120, 56, side * 28); return oval(x, y, 120, 56, '#c1121f', { rotation: side * 28 }) }),
  circle(cx - 20, cy + radius, 40, '#8f0d17')]

// Fir tree made of three stacked diamonds and a trunk.
const tree = (cx, baseY, size, fill) => [
  box(cx - size * 0.08, baseY - size * 0.3, size * 0.16, size * 0.3, '#6b4423'),
  ...[0, 1, 2].map(index => { const side = size * (1 - index * 0.22), [x, y] = centered(cx, baseY - size * 0.55 - index * size * 0.5, side, side, 45); return box(x, y, side, side, fill, { rotation: 45 }) })]

// Hanging ornament: string, cap, glass ball and highlight.
const ornament = (x, length, size, fill) => [
  box(x - 1.5, 0, 3, length, '#d9c9a8'), box(x - size * 0.12, length - size * 0.04, size * 0.24, size * 0.14, '#ffd166', { radius: 4 }),
  circle(x - size / 2, length + size * 0.08, size, fill), circle(x - size * 0.3, length + size * 0.24, size * 0.2, '#ffffff', { opacity: 0.5 })]

const REBOZO_COLORS = ['#e63a6e', '#ffb703', '#2a9d8f', '#9b5de5', '#4dabf7']
const REBOZO_BANDS = Array.from({ length: 20 }, (_, index) => [box(index * 38, 0, 38, 980, REBOZO_COLORS[index % 5]), box(index * 38 + 16, 0, 6, 980, '#ffffff', { opacity: 0.5 })]).flat()
const REBOZO_FRINGE = Array.from({ length: 63 }, (_, index) => box(index * 12 + 4, 980, 4, 90, REBOZO_COLORS[Math.floor((index * 12) / 38) % 5]))
const REBOZO_DIAMONDS = [300, 700].flatMap(y => Array.from({ length: 10 }, (_, index) => { const [x, yy] = centered(index * 76 + 38, y, 34, 34, 45); return box(x, yy, 34, 34, '#ffffff', { rotation: 45, opacity: 0.65 }) }))

const SNOW = dotGrid(20, 30, 12, 21, 90, 7, '#ffffff', 0.28)
const COUPONS = [['un abrazo\ninfinito', 'heart', '#ff8fab', 90], ['una cena\na la luz de\nvelas', 'sparkle', '#e63a6e', 690], ['una noche\nde película', 'play', '#c9184a', 1290]]

export const HOLIDAYS_A = [
  { key: 'muertos-noche-animas', name: 'Noche de ánimas', category: 'Fiestas de México', description: 'Historia vertical con luna llena, altar de tres niveles, velas, retrato enmarcado y cempasúchil.',
    width: 1080, height: 1920, background: '#14052b', objects: [
      ...gradientBands(0, 0, 1080, 1500, '#14052b', '#5b1a6b', 40),
      circle(290, 500, 500, '#fff3cf'), ...rings(540, 750, [600, 680], '#fff3cf', { weight: 2, opacity: 0.35 }),
      circle(380, 600, 90, '#f1dfae', { opacity: 0.6 }), circle(620, 780, 60, '#f1dfae', { opacity: 0.6 }), circle(470, 860, 40, '#f1dfae', { opacity: 0.6 }),
      caps(60, 100, 960, '#ffd23f', 'NOCHE DE ÁNIMAS', { align: 'center', spacing: 260 }),
      text(60, 150, 960, 130, '#fff6e8', 'Ofrenda\npara ti', { font: 'Cormorant Garamond', variant: 'italic', align: 'center', lineHeight: 0.95 }),
      box(0, 1390, 1080, 530, '#0c0319'),
      box(100, 1260, 880, 130, '#7a1fa2'), box(190, 1130, 700, 130, '#ff2e93'), box(290, 1000, 500, 130, '#ff8c1a'),
      box(100, 1260, 880, 10, '#ffd23f'), box(190, 1130, 700, 10, '#ffd23f'), box(290, 1000, 500, 10, '#ffd23f'),
      box(430, 740, 220, 260, '#fff6e8'), box(446, 756, 188, 228, '#2a0f3d'), icon('heart', 500, 830, 80, '#ff2e93'),
      ...candle(330, 1000), ...candle(740, 1000), ...candle(220, 1130), ...candle(850, 1130), ...candle(130, 1260), ...candle(930, 1260),
      ...[300, 540, 780].flatMap(x => flower(x, 1325, 100, '#ffb703', '#ff8c1a', { petals: 8 })), ...[390, 690].flatMap(x => flower(x, 1195, 90, '#ff8c1a', '#ffd23f', { petals: 8 })),
      text(60, 1470, 960, 44, '#fff6e8', 'Te recordamos con amor', { font: 'Raleway', variant: 'medium', align: 'center', lineHeight: 1 }),
      ...chip(340, 1560, 400, 70, '#ff8c1a', '1 Y 2 DE NOVIEMBRE', '#14052b', { font: 'Montserrat', variant: 'bold' }),
      caps(60, 1700, 960, '#b693c9', 'COMPARTE TU OFRENDA · #NOCHEDEÁNIMAS', { align: 'center', spacing: 40 }),
    ] },
  { key: 'muertos-calaverita', name: 'Calaverita literaria', category: 'Fiestas de México', description: 'Tarjeta cuadrada para versos de calaverita: papel crema, calavera con corona de flores y letra manuscrita.',
    width: 1080, height: 1080, background: '#ffb703', objects: [
      zigzag(0, 20, 1080, 40, 30, '#d00000', { weight: 10 }),
      box(100, 122, 900, 860, '#7a3b00', { radius: 24, opacity: 0.3 }), box(90, 110, 900, 860, '#fff6e8', { radius: 24 }),
      ...skull(810, 300, 210, '#2a0f3d', '#ff2e93'), ...flower(730, 170, 90, '#ff8c1a', '#ffd23f', { petals: 8 }), ...flower(890, 170, 90, '#ff8c1a', '#ffd23f', { petals: 8 }),
      caps(140, 160, 500, '#d00000', 'TRADICIÓN · POESÍA · HUMOR', { spacing: 60 }),
      text(130, 210, 600, 100, '#2a0f3d', 'Calaverita\nliteraria', { font: 'Bitter', variant: 'extrabold', lineHeight: 1 }),
      zigzag(140, 470, 800, 30, 20, '#ff2e93', { weight: 6 }),
      text(140, 540, 800, 44, '#2a0f3d', 'Aquí yace mi amigo Beto,\nque murió de tanto trabajar;\nsu pan de muerto quedó incompleto\ny hoy vino a nuestra mesa a cenar.', { font: 'Caveat', variant: 'medium', lineHeight: 1.25 }),
      text(140, 830, 600, 34, '#d00000', '— Con cariño, tu compa', { font: 'Caveat', variant: 'bold', lineHeight: 1 }),
      ...flower(740, 890, 80, '#ffb703', '#ff8c1a', { petals: 8 }), ...flower(840, 890, 80, '#ff8c1a', '#ffd23f', { petals: 8 }), ...flower(940, 890, 80, '#ffb703', '#ff8c1a', { petals: 8 }),
    ] },
  { key: 'navidad-nordica', name: 'Navidad nórdica', category: 'Fiestas de México', description: 'Tarjeta navideña minimalista: corona de hojas verdes con moño rojo, bosque de pinos y tipografía con serif.',
    width: 1080, height: 1350, background: '#f4efe6', objects: [
      caps(60, 100, 960, '#2d6a4f', 'TALLER NORTE · NAVIDAD 2027', { align: 'center', spacing: 200 }),
      ...wreath(540, 520, 250),
      text(290, 423, 500, 86, '#c1121f', 'Felices\nfiestas', { font: 'Libre Baskerville', variant: 'italic', align: 'center', lineHeight: 1 }),
      text(120, 860, 840, 30, '#3d3d3d', 'Que tu casa se llene de luz, calma y buenos deseos.', { font: 'Raleway', variant: 'light', align: 'center' }),
      ...chip(380, 960, 320, 64, '#c1121f', 'VER MENÚ', '#ffffff', { font: 'Montserrat', variant: 'bold' }),
      box(0, 1260, 1080, 90, '#ffffff'),
      ...[[120, 1260, 110, '#2d6a4f'], [260, 1270, 150, '#40916c'], [420, 1260, 100, '#1b4332'], [660, 1260, 100, '#1b4332'], [820, 1270, 150, '#40916c'], [960, 1260, 110, '#2d6a4f']].flatMap(([cx, baseY, size, fill]) => tree(cx, baseY, size, fill)),
    ] },
  { key: 'navidad-cuenta-regresiva', name: 'Cuenta regresiva navideña', category: 'Fiestas de México', description: 'Historia vertical con número gigante, esferas colgantes, nieve y etiquetas de ponche, tamales y familia.',
    width: 1080, height: 1920, background: '#7a0019', objects: [
      ...gradientBands(0, 0, 1080, 1920, '#7a0019', '#2b0008', 40), ...SNOW,
      ...ornament(120, 180, 150, '#ffd166'), ...ornament(300, 320, 130, '#2a9d8f'), ...ornament(780, 120, 140, '#f1faee'), ...ornament(940, 360, 120, '#e63946'),
      text(40, 430, 1000, 500, '#ffd166', '12', { font: 'Montserrat', variant: 'black', align: 'center', lineHeight: 1 }),
      text(60, 1020, 960, 48, '#fff6e8', 'DÍAS PARA NAVIDAD', { font: 'Montserrat', variant: 'bold', align: 'center', spacing: 160, lineHeight: 1 }),
      ...chip(70, 1180, 290, 72, '#e63946', 'PONCHE', '#ffffff', { font: 'Montserrat', variant: 'bold' }), ...chip(395, 1180, 290, 72, '#2a9d8f', 'TAMALES', '#ffffff', { font: 'Montserrat', variant: 'bold' }), ...chip(720, 1180, 290, 72, '#ffd166', 'FAMILIA', '#2b0008', { font: 'Montserrat', variant: 'bold' }),
      oval(-150, 1700, 800, 400, '#ffffff'), oval(400, 1740, 900, 400, '#e8f1ee'),
      text(60, 1790, 960, 32, '#7a0019', 'Cuéntale a alguien que lo esperas', { font: 'Raleway', variant: 'semibold', align: 'center', lineHeight: 1 }),
    ] },
  { key: 'madres-loteria', name: 'Lotería: La Mamá', category: 'Fiestas de México', description: 'Carta estilo lotería mexicana: número, corazón con rayos y flores, marco doble y nombre en barra.',
    width: 1080, height: 1350, background: '#f2e2b8', objects: [
      box(132, 102, 840, 1170, '#8b3a1a', { radius: 20, opacity: 0.3 }), box(120, 90, 840, 1170, '#fff8e1', { radius: 20, stroke: '#8b3a1a', strokeWidth: 8 }),
      ...sunburst(540, 620, 330, 24, '#ffb703', { weight: 14, opacity: 0.55 }), ...doubleFrame(150, 120, 780, 1110, '#d62839', { gap: 12, weight: 3 }),
      circle(170, 150, 110, '#8b3a1a'), text(170, 176, 110, 56, '#fff8e1', '10', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      ...rings(540, 610, [560], '#8b3a1a', { weight: 4, dash: 'dashed', opacity: 0.6 }),
      icon('heart', 330, 400, 420, '#d62839'),
      ...flower(260, 330, 130, '#ff8fab', '#fff3b0', { accent: '#e63a6e' }), ...flower(820, 330, 130, '#ff8fab', '#fff3b0', { accent: '#e63a6e' }), ...flower(240, 880, 120, '#ffb703', '#e63a6e', { accent: '#ffd166' }), ...flower(840, 880, 120, '#ffb703', '#e63a6e', { accent: '#ffd166' }),
      box(210, 1040, 660, 150, '#8b3a1a', { radius: 14 }), text(210, 1065, 660, 110, '#fff8e1', 'LA MAMÁ', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1, spacing: 60 }),
      caps(150, 1200, 780, '#8b3a1a', 'DÍA DE LAS MADRES · 10 DE MAYO', { align: 'center', spacing: 80 }),
    ] },
  { key: 'madres-rebozo', name: 'Gracias, mamá en rebozo', category: 'Fiestas de México', description: 'Diapositiva 16:9: franjas de rebozo con rombos y fleco a la izquierda; mensaje en cursiva a la derecha.',
    width: 1920, height: 1080, background: '#fff3e6', objects: [
      ...REBOZO_BANDS, ...REBOZO_DIAMONDS, ...REBOZO_FRINGE,
      caps(860, 200, 900, '#e63a6e', '10 DE MAYO · DÍA DE LAS MADRES', { spacing: 160 }),
      text(850, 250, 1000, 170, '#7a2a45', 'Gracias,\nmamá', { font: 'Playfair Display', variant: 'italic', lineHeight: 0.95 }),
      text(860, 660, 900, 34, '#7a2a45', 'Por cada abrazo, cada desvelo y cada comida\nhecha con amor.', { font: 'Raleway', variant: 'light', lineHeight: 1.35 }),
      ...rule(860, 830, 500, '#e63a6e'), ...chip(860, 880, 360, 72, '#e63a6e', 'FELIZ DÍA', '#ffffff', { font: 'Montserrat', variant: 'bold', spacing: 80 }),
      icon('heart', 1560, 700, 110, '#e63a6e'), ...flower(1740, 880, 170, '#ff8fab', '#fff3b0', { accent: '#e63a6e' }),
    ] },
  { key: 'valentin-carta', name: 'Carta de amor', category: 'Fiestas de México', description: 'Tarjeta cuadrada de San Valentín: degradado rosa, corazones flotantes, carta asomando de un sobre con sello.',
    width: 1080, height: 1080, background: '#ffd6e0', objects: [
      ...gradientBands(0, 0, 1080, 1080, '#ffd6e0', '#ff8fab', 30),
      ...[[90, 120, 70, '#ffffff'], [900, 90, 90, '#ffffff'], [960, 420, 50, '#e63a6e'], [60, 640, 60, '#e63a6e'], [880, 860, 80, '#ffffff'], [160, 920, 50, '#ffffff']].map(([x, y, size, fill]) => icon('heart', x, y, size, fill)),
      box(240, 184, 620, 470, '#b03a5e', { radius: 16, opacity: 0.2 }), box(230, 170, 620, 470, '#fffaf3', { radius: 16 }),
      text(270, 210, 540, 110, '#e63a6e', 'Para ti', { font: 'Great Vibes', align: 'center', lineHeight: 1 }),
      text(270, 330, 540, 34, '#6b3a4a', 'Eres mi razón favorita\npara sonreír cada día.', { font: 'Kalam', variant: 'light', align: 'center', lineHeight: 1.35 }),
      text(270, 450, 540, 48, '#e63a6e', 'con amor', { font: 'Dancing Script', variant: 'bold', align: 'center', lineHeight: 1 }),
      box(180, 600, 720, 360, '#ff5d8a', { radius: 24 }), line(180, 600, 360, 200, [[0, 0], [1, 1]], '#c9184a', { weight: 6 }), line(540, 600, 360, 200, [[0, 1], [1, 0]], '#c9184a', { weight: 6 }),
      circle(490, 710, 100, '#c9184a'), icon('heart', 515, 735, 50, '#ffffff'),
    ] },
  { key: 'valentin-popart', name: 'San Valentín pop art', category: 'Fiestas de México', description: 'Cartel vertical pop art: semitono rosa sobre amarillo, corazón gigante con sombra, globo de diálogo y estallido.',
    width: 1080, height: 1350, background: '#ffe14d', objects: [
      ...halftone(0, 0, 14, 17, 80, 56, '#ff3366', { toward: 'right', opacity: 0.85 }),
      icon('heart', 166, 226, 800, '#111111'), icon('heart', 140, 200, 800, '#ff3366'),
      text(240, 500, 600, 190, '#ffffff', 'AMOR', { font: 'Montserrat', variant: 'black', align: 'center', lineHeight: 1 }),
      ...shadowBox(560, 100, 420, 230, '#ffffff', { offset: 12, radius: 40 }), text(580, 130, 380, 64, '#111111', '¡TE\nQUIERO!', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 0.95 }),
      ...starburst(220, 1050, 230, '#00c2ff', { layers: 4 }), text(120, 1020, 200, 56, '#111111', '14 FEB', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      ...shadowBox(380, 1080, 600, 150, '#111111', { offset: 10, shadow: '#ff3366', stroke: '#111111' }), text(380, 1118, 600, 64, '#ffe14d', 'SAN VALENTÍN', { font: 'Oswald', variant: 'bold', align: 'center', spacing: 120, lineHeight: 1 }),
      zigzag(60, 1290, 960, 40, 24, '#111111', { weight: 8 }),
    ] },
  { key: 'valentin-vales', name: 'Vales de amor', category: 'Fiestas de México', description: 'Hoja 16:9 con tres vales recortables de líneas punteadas: abrazo, cena y película.',
    width: 1920, height: 1080, background: '#fff0f3', objects: [
      text(60, 40, 1800, 110, '#c9184a', 'Vales de amor', { font: 'Dancing Script', variant: 'bold', align: 'center', lineHeight: 1 }),
      ...COUPONS.flatMap(([value, glyph, color, x]) => [
        box(x + 8, 212, 540, 760, color, { radius: 28, opacity: 0.18 }), box(x, 200, 540, 760, '#ffffff', { radius: 28 }),
        box(x + 20, 220, 500, 720, color, { noFill: true, strokeWidth: 3, stroke: color, dash: 'dashed', radius: 20 }),
        circle(x + 210, 260, 120, color), icon(glyph, x + 240, 290, 60, '#ffffff'),
        caps(x, 420, 540, color, 'VALE POR', { align: 'center', spacing: 240 }),
        text(x + 30, 480, 480, 64, '#4a1d2c', value, { font: 'Playfair Display', variant: 'bold', align: 'center', lineHeight: 1.1 }),
        ...rule(x + 90, 790, 360, color), text(x + 30, 830, 480, 22, '#8a5a6a', 'Canjeable cualquier día del año', { font: 'Raleway', align: 'center', lineHeight: 1 }),
        circle(x - 30, 540, 60, '#fff0f3'), circle(x + 510, 540, 60, '#fff0f3')]),
      caps(60, 1010, 1800, '#c9184a', '14 DE FEBRERO · HECHO A MANO', { align: 'center', spacing: 200 }),
    ] },
]
