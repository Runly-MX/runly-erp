// Airport-themed starting points: bag tag, passport stamps, runway, radar,
// route map, retro airline poster, duty free and mobile boarding pass.
import { box, centered, chip, circle, doubleFrame, dotGrid, gradientBands, gridLines, icon, line, oval, rings, rule, samples, text, cloud } from './templates-motifs.js'

const mono = (x, y, width, size, fill, value, options = {}) => text(x, y, width, size, fill, value, { font: 'IBM Plex Mono', ...options })
const caps = (x, y, width, fill, value, options = {}) => text(x, y, width, 18, fill, value, { font: 'Space Mono', spacing: 80, ...options })

// Text turned around its own center (rotation is applied around the top-left corner).
const turned = (cx, cy, width, size, fill, value, rotation, options = {}) => {
  const lineHeight = options.lineHeight ?? 1.16, height = Math.ceil(value.split('\n').length * size * lineHeight * 1.13)
  const [x, y] = centered(cx, cy, width, height, rotation)
  return { ...text(x, y, width, size, fill, value, options), rotation }
}
const roundStamp = (cx, cy, size, color, value, rotation) => [
  ...rings(cx, cy, [size, size * 0.8], color, { weight: 5, opacity: 0.85 }),
  turned(cx, cy, size * 0.7, Math.round(size * 0.12), color, value, rotation, { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1.15, opacity: 0.9 })]
const boxStamp = (cx, cy, width, height, color, value, rotation) => {
  const [x, y] = centered(cx, cy, width, height, rotation)
  return [box(x, y, width, height, color, { noFill: true, strokeWidth: 6, stroke: color, radius: 14, rotation, opacity: 0.85 }),
    turned(cx, cy, width - 30, Math.round(height * 0.2), color, value, rotation, { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1.15, opacity: 0.9 })]
}

const barcode = (x, y, width, height, fill) => {
  const bars = []
  for (let cursor = 0, index = 0; cursor < width; index++) {
    const bar = [3, 6, 4, 9][(index * 7 + 3) % 4], gap = [4, 3, 6][(index * 5 + 1) % 3]
    if (cursor + bar > width) break
    bars.push(box(x + cursor, y, bar, height, fill)); cursor += bar + gap
  }
  return bars
}

// Great-circle-like arc between two points, lifted by `lift` pixels in the middle.
const arc = (x1, y1, x2, y2, lift, fill, options) => {
  const points = Array.from({ length: 40 }, (_, index) => { const t = index / 39; return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t - lift * 4 * t * (1 - t)] })
  const left = Math.min(x1, x2), top = Math.min(...points.map(point => point[1])), width = Math.abs(x2 - x1) || 1, height = Math.max(...points.map(point => point[1])) - top || 1
  return line(left, top, width, height, points.map(([x, y]) => [Math.round(((x - left) / width) * 10000) / 10000, Math.round(((y - top) / height) * 10000) / 10000]), fill, options)
}

// Pseudo QR code: finder squares in three corners and deterministic modules.
const qr = (x, y, cell, ink, paper) => {
  const n = 25, inFinder = (r, c) => (r < 8 && c < 8) || (r < 8 && c > 16) || (r > 16 && c < 8), objects = []
  for (const [fr, fc] of [[0, 0], [0, 18], [18, 0]]) objects.push(box(x + fc * cell, y + fr * cell, cell * 7, cell * 7, ink), box(x + (fc + 1) * cell, y + (fr + 1) * cell, cell * 5, cell * 5, paper), box(x + (fc + 2) * cell, y + (fr + 2) * cell, cell * 3, cell * 3, ink))
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!inFinder(r, c) && (r * 31 + c * 17 + r * c * 5) % 7 < 3) objects.push(box(x + c * cell, y + r * cell, cell, cell, ink))
  return objects
}

const RADAR_SWEEP = Array.from({ length: 16 }, (_, index) => box(533, 540, 14, 450, '#2bff88', { rotation: 130 + index * 2.5, opacity: 0.5 * (1 - index / 16) }))
const RUNWAY_DASHES = Array.from({ length: 9 }, (_, index) => box(536, 40 + index * 150, 8, 80, '#ffffff'))
const RUNWAY_LIGHTS = Array.from({ length: 12 }, (_, index) => [circle(300, 60 + index * 110, 14, '#ffd23f'), circle(766, 60 + index * 110, 14, '#4dabf7')]).flat()
const DECO_RAYS = Array.from({ length: 17 }, (_, index) => box(538, 1080, 4, 800, '#c9a24a', { rotation: 100 + index * 10, opacity: 0.22 }))

export const AIRPORT_TEMPLATES = [
  { key: 'bag-tag', name: 'Etiqueta de equipaje', category: 'Aeropuerto', description: 'Etiqueta vertical de maleta con argolla, código de aeropuerto gigante, datos del pasajero y código de barras.',
    width: 1080, height: 1350, background: '#dfe6ec', objects: [
      ...rings(540, 100, [190], '#e63946', { weight: 16 }),
      box(252, 74, 600, 1230, '#8a97a6', { radius: 40, opacity: 0.35 }), box(240, 60, 600, 1230, '#ffffff', { radius: 40 }), circle(500, 90, 80, '#dfe6ec'),
      box(240, 210, 600, 130, '#111111'), text(240, 238, 600, 40, '#ffffff', 'RUNLY AIR', { font: 'Montserrat', variant: 'black', align: 'center', lineHeight: 1, spacing: 160 }), text(240, 292, 600, 18, '#e63946', 'EQUIPAJE FACTURADO', { font: 'Space Mono', align: 'center', spacing: 120 }),
      text(240, 360, 600, 300, '#111111', 'CUN', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      text(240, 700, 600, 32, '#3d4852', 'CANCÚN · MÉXICO', { font: 'Raleway', variant: 'semibold', align: 'center', spacing: 100, lineHeight: 1 }),
      line(280, 770, 520, 4, [[0, 0.5], [1, 0.5]], '#aab4be', { weight: 4, dash: 'dashed' }),
      caps(290, 810, 240, '#8a97a6', 'PASAJERO'), text(290, 838, 500, 42, '#111111', 'TORRES / ANA', { font: 'Oswald', variant: 'semibold', lineHeight: 1 }),
      caps(290, 910, 240, '#8a97a6', 'VUELO'), text(290, 938, 500, 42, '#111111', 'RX 482 · 14 NOV', { font: 'Oswald', variant: 'semibold', lineHeight: 1 }),
      ...barcode(290, 1010, 500, 150, '#111111'), mono(290, 1175, 500, 22, '#3d4852', '0074 482015 CUN', { align: 'center', spacing: 100 }),
      box(240, 1230, 600, 60, '#e63946', { radius: 0 }), box(240, 1250, 600, 40, '#e63946', { radius: 40 }),
    ] },
  { key: 'passport-stamps', name: 'Pasaporte y sellos', category: 'Aeropuerto', description: 'Página de pasaporte con guilloché, seis sellos de entrada y salida inclinados y zona de lectura mecánica.',
    width: 1080, height: 1350, background: '#2b3a55', objects: [
      box(60, 60, 960, 1230, '#efe6d2', { radius: 24 }),
      ...rings(540, 700, [1100, 980, 860, 740, 620, 500, 380], '#6aa3a0', { weight: 2, opacity: 0.25 }),
      caps(110, 110, 860, '#5b6b7a', 'VISAS · ENTRADAS Y SALIDAS', { align: 'center', spacing: 200 }), ...rule(340, 160, 400, '#5b6b7a'),
      ...roundStamp(300, 400, 260, '#2b4a9b', 'CANCÚN\nENTRADA\n14 NOV 2027', -12), ...boxStamp(730, 360, 340, 170, '#b3261e', 'LLEGADA\nMADRID', 7),
      ...boxStamp(310, 760, 360, 180, '#1e7a46', 'SALIDA\nBOGOTÁ', -6), ...roundStamp(730, 760, 270, '#6b3fa0', 'LIMA\nPERÚ\n03 MAR', 15),
      ...roundStamp(280, 1010, 240, '#b3261e', 'TOKIO\nNARITA\n22 JUN', 8), ...boxStamp(700, 1020, 330, 170, '#2b4a9b', 'ENTRADA\nLISBOA', -9),
      box(60, 1160, 960, 130, '#e3d8bf'), mono(90, 1178, 900, 28, '#2a2a2a', 'P<MEXTORRES<<ANA<<<<<<<<<<<<<<<<<<<<<<<', { spacing: 60 }), mono(90, 1230, 900, 28, '#2a2a2a', 'A12345678<4MEX9001014F3011148<<<<<<<<<<<<<<04', { spacing: 60 }),
    ] },
  { key: 'runway-27', name: 'Pista 27', category: 'Aeropuerto', description: 'Cartel cenital de pista: asfalto con umbral, números, línea central, balizas amarillas y azules y un avión alineado.',
    width: 1080, height: 1350, background: '#17402a', objects: [
      box(340, 0, 400, 1350, '#2a2f3a'), box(352, 0, 6, 1350, '#ffffff'), box(722, 0, 6, 1350, '#ffffff'),
      ...Array.from({ length: 8 }, (_, index) => box(372 + index * 40, 90, 20, 150, '#ffffff')), ...RUNWAY_DASHES.slice(3), ...RUNWAY_LIGHTS.filter((_, index) => index % 2 === 0).map(light => ({ ...light, x: light.x + 26 })), ...RUNWAY_LIGHTS.filter((_, index) => index % 2 === 1).map(light => ({ ...light, x: light.x - 26 })),
      text(340, 300, 400, 180, '#ffffff', '27', { font: 'Montserrat', variant: 'black', align: 'center', lineHeight: 1 }),
      ...[580, 700].flatMap(y => [box(400, y, 26, 90, '#ffffff'), box(654, y, 26, 90, '#ffffff')]),
      box(0, 900, 340, 120, '#2a2f3a'), box(0, 956, 340, 6, '#ffd23f'),
      ...(([x, y]) => [icon('plane', x, y, 220, '#f5f7fa', -45)])(centered(540, 1130, 220, 220, -45)),
      text(30, 60, 300, 110, '#ffffff', 'PISTA\n27L', { font: 'Oswald', variant: 'bold', lineHeight: 0.95 }),
      caps(30, 330, 300, '#9fd8b4', 'RWY 27L / 09R'), mono(30, 370, 300, 20, '#ffffff', 'LONGITUD 3,800 m'), mono(30, 404, 300, 20, '#ffffff', 'ELEVACIÓN 2,240 m'),
      mono(770, 1120, 290, 20, '#ffffff', 'ALINEAR Y\nESPERAR', { lineHeight: 1.3 }), mono(770, 1200, 290, 18, '#9fd8b4', 'VIENTO 270 / 08 KT'),
    ] },
  { key: 'tower-radar', name: 'Radar de torre', category: 'Aeropuerto', description: 'Pantalla de control de tráfico aéreo: anillos de distancia, barrido verde, ecos con etiquetas y coordenadas.',
    width: 1080, height: 1080, background: '#04120a', objects: [
      circle(90, 90, 900, '#06200f'), ...rings(540, 540, [900, 720, 540, 360, 180], '#2bff88', { weight: 2, opacity: 0.45 }),
      box(90, 539, 900, 2, '#2bff88', { opacity: 0.3 }), box(539, 90, 2, 900, '#2bff88', { opacity: 0.3 }), ...RADAR_SWEEP, box(533, 540, 4, 450, '#2bff88', { rotation: 130 }),
      ...[[690, 360, 'RX482 · FL350'], [380, 700, 'AM117 · FL280'], [700, 700, 'VB903 · FL120'], [420, 360, 'CM44 · FL390']].flatMap(([x, y, name]) => [
        circle(x - 9, y - 9, 18, '#2bff88'), circle(x - 20, y - 20, 40, '#2bff88', { noFill: true, strokeWidth: 2, stroke: '#2bff88', opacity: 0.6 }), mono(x + 28, y - 12, 220, 18, '#2bff88', name)]),
      caps(60, 60, 600, '#2bff88', 'TWR · CONTROL DE TRÁFICO AÉREO', { spacing: 120 }), mono(60, 1000, 500, 20, '#2bff88', 'N 19 26 · W 99 04', { opacity: 0.8 }), mono(680, 1000, 340, 20, '#2bff88', 'ALCANCE 60 NM', { align: 'right', opacity: 0.8 }),
    ] },
  { key: 'route-map', name: 'Mapa de rutas', category: 'Aeropuerto', description: 'Mapa 16:9 de puntos con arcos de vuelo entre seis ciudades, ciudades iluminadas y leyenda.',
    width: 1920, height: 1080, background: '#0a1628', objects: [
      ...dotGrid(130, 140, 28, 14, 62, 6, '#2c4a7a', 0.6),
      ...[[500, 700, 760, 520, 120, 'MEX–NYC'], [760, 520, 1180, 500, 200, 'NYC–MAD'], [1180, 500, 1480, 640, 140, 'MAD–DXB'], [1480, 640, 1740, 500, 160, 'DXB–TYO'], [500, 700, 760, 900, 80, 'MEX–SAO']].flatMap(([x1, y1, x2, y2, lift]) => [
        arc(x1, y1, x2, y2, lift, '#ffb703', { weight: 10, opacity: 0.18 }), arc(x1, y1, x2, y2, lift, '#ffb703', { weight: 3, dash: 'dashed' })]),
      ...[[500, 700, 'MEX'], [760, 520, 'NYC'], [1180, 500, 'MAD'], [1480, 640, 'DXB'], [1740, 500, 'TYO'], [760, 900, 'SAO']].flatMap(([x, y, name]) => [
        circle(x - 24, y - 24, 48, '#ffb703', { opacity: 0.25 }), circle(x - 9, y - 9, 18, '#ffb703'), mono(x + 18, y - 40, 120, 22, '#ffffff', name, { variant: 'bold' })]),
      caps(120, 80, 800, '#ffb703', 'RED DE RUTAS · TEMPORADA 2027', { spacing: 160 }),
      text(114, 150, 900, 110, '#ffffff', 'Conectamos\n6 ciudades', { font: 'DM Sans', variant: 'bold', lineHeight: 1 }), ...chip(120, 400, 340, 60, '#ffb703', '38 VUELOS SEMANALES', '#0a1628', { font: 'DM Sans', variant: 'bold' }),
    ] },
  { key: 'retro-airline', name: 'Aerolínea retro', category: 'Aeropuerto', description: 'Cartel de aerolínea años 60: sol, avión gigante en ascenso, estelas de colores y titular geométrico.',
    width: 1080, height: 1350, background: '#f4e7cf', objects: [
      circle(120, 140, 560, '#e76f51'), ...cloud(620, 140, 1.3, '#ffffff', 0.95), ...cloud(80, 640, 1.1, '#ffffff', 0.95),
      line(40, 560, 520, 330, samples(30, t => [t, 1 - Math.pow(t, 1.5)]), '#e9c46a', { weight: 22 }), line(40, 640, 520, 330, samples(30, t => [t, 1 - Math.pow(t, 1.5)]), '#e76f51', { weight: 22 }), line(40, 720, 520, 330, samples(30, t => [t, 1 - Math.pow(t, 1.5)]), '#2a9d8f', { weight: 22 }),
      icon('plane', 420, 80, 640, '#1d4e5f'),
      text(70, 800, 940, 150, '#1d4e5f', 'VUELA\nLIGERO', { font: 'Raleway', variant: 'black', lineHeight: 0.9 }),
      text(74, 1130, 900, 30, '#1d4e5f', 'Ciudad de México — Los Ángeles · desde $2,490', { font: 'Raleway', variant: 'medium' }),
      box(0, 1210, 1080, 140, '#1d4e5f'), ...chip(70, 1245, 340, 70, '#e9c46a', 'RESERVA YA', '#1d4e5f', { font: 'Raleway', variant: 'extrabold', spacing: 60 }), caps(460, 1268, 560, '#f4e7cf', 'RUNLY AIR · SERVICIO DIARIO', { spacing: 100 }),
    ] },
  { key: 'duty-free-deco', name: 'Duty free art déco', category: 'Aeropuerto', description: 'Promoción de tienda libre de impuestos en negro y oro: abanico art déco, marco doble y descuento en serif.',
    width: 1080, height: 1080, background: '#0d0d0d', objects: [
      ...DECO_RAYS, ...rings(540, 1080, [300, 500, 700, 900], '#c9a24a', { weight: 3, opacity: 0.5 }), ...doubleFrame(50, 50, 980, 980, '#c9a24a', { gap: 12 }),
      caps(100, 110, 880, '#c9a24a', 'EXCLUSIVO PARA VIAJEROS', { align: 'center', spacing: 260 }),
      text(100, 150, 880, 130, '#c9a24a', 'DUTY FREE', { font: 'Cormorant Garamond', variant: 'semibold', align: 'center', lineHeight: 1, spacing: 80 }), ...rule(340, 310, 400, '#c9a24a'),
      text(100, 350, 880, 280, '#ffffff', '-25%', { font: 'Playfair Display', variant: 'bold', align: 'center', lineHeight: 1 }),
      text(100, 690, 880, 28, '#f1e3b8', 'EN PERFUMES, LICORES Y CHOCOLATES', { font: 'Montserrat', variant: 'medium', align: 'center', spacing: 140 }),
      ...chip(260, 830, 560, 74, '#c9a24a', 'TERMINAL 1 · ZONA INTERNACIONAL', '#0d0d0d', { font: 'Montserrat', variant: 'bold', spacing: 20 }),
    ] },
  { key: 'mobile-pass', name: 'Pase en el celular', category: 'Aeropuerto', description: 'Promoción de check-in digital: teléfono con pase de abordar, código QR y etiquetas "Sin filas" y "Sin papel".',
    width: 1080, height: 1350, background: '#4361ee', objects: [
      ...gradientBands(0, 0, 1080, 1350, '#4361ee', '#3a0ca3', 30),
      circle(-120, 900, 420, '#ffffff', { opacity: 0.08 }), circle(760, -100, 360, '#ffffff', { opacity: 0.08 }),
      box(308, 140, 480, 1000, '#000000', { radius: 70, opacity: 0.25 }), box(300, 120, 480, 1000, '#0b0b14', { radius: 70 }), box(318, 138, 444, 964, '#ffffff', { radius: 54 }),
      box(318, 138, 444, 220, '#4361ee', { radius: 54 }), box(318, 260, 444, 98, '#4361ee'), box(480, 156, 120, 30, '#0b0b14', { radius: 15 }),
      caps(350, 210, 380, '#dbe2ff', 'PASE DE ABORDAR'), text(350, 245, 170, 84, '#ffffff', 'MEX', { font: 'Oswald', variant: 'bold', lineHeight: 1 }), icon('plane', 508, 268, 50, '#ffd166', 90), text(580, 245, 170, 84, '#ffffff', 'CUN', { font: 'Oswald', variant: 'bold', lineHeight: 1, align: 'right' }),
      caps(350, 390, 200, '#8d99ae', 'PASAJERO'), text(350, 416, 400, 40, '#14213d', 'ANA TORRES', { font: 'Oswald', variant: 'semibold', lineHeight: 1 }),
      caps(350, 480, 200, '#8d99ae', 'VUELO'), text(350, 506, 200, 40, '#14213d', 'RX 482', { font: 'Oswald', variant: 'semibold', lineHeight: 1 }),
      caps(590, 480, 170, '#8d99ae', 'ASIENTO'), text(590, 506, 170, 40, '#14213d', '14A', { font: 'Oswald', variant: 'semibold', lineHeight: 1 }),
      ...qr(365, 590, 14, '#14213d', '#ffffff'), text(318, 950, 444, 22, '#14213d', 'PUERTA B12 · 07:10', { font: 'Space Mono', variant: 'bold', align: 'center', spacing: 60, lineHeight: 1 }), caps(318, 1000, 444, '#8d99ae', 'ESCANÉALO EN LA PUERTA', { align: 'center', spacing: 40 }),
      ...chip(60, 300, 220, 64, '#ffd166', 'SIN FILAS', '#1b1b3a', { font: 'Montserrat', variant: 'black' }), ...chip(800, 640, 220, 64, '#ffd166', 'SIN PAPEL', '#1b1b3a', { font: 'Montserrat', variant: 'black' }),
      text(60, 1190, 960, 60, '#ffffff', 'Tu pase en el celular', { font: 'Poppins', variant: 'semibold', align: 'center', lineHeight: 1 }), text(60, 1262, 960, 28, '#dbe2ff', 'Check-in en 30 segundos', { font: 'Poppins', align: 'center', lineHeight: 1 }),
    ] },
]
