// Themed starting points: airport and travel pieces plus social formats
// (boarding pass, departures board, postcard, beach poster, city guide, story Q&A,
// podcast cover, 30-day tracker, polaroid collage, wayfinding sign).
import { box, centered, chip, circle, dotGrid, gradientBands, gridLines, icon, line, mix, oval, rings, samples, shadowBox, text, waves } from './templates-motifs.js'

const mono = (x, y, width, size, fill, value, options = {}) => text(x, y, width, size, fill, value, { font: 'IBM Plex Mono', ...options })
const label = (x, y, width, fill, value, options = {}) => text(x, y, width, 18, fill, value, { font: 'Space Mono', spacing: 80, ...options })

// Barcode made of bars with pseudo-random widths.
const barcode = (x, y, width, height, fill) => {
  const bars = []
  for (let cursor = 0, index = 0; cursor < width; index++) {
    const bar = [3, 6, 4, 9][(index * 7 + 3) % 4], gap = [4, 3, 6][(index * 5 + 1) % 3]
    if (cursor + bar > width) break
    bars.push(box(x + cursor, y, bar, height, fill)); cursor += bar + gap
  }
  return bars
}

// Position of an element placed at local (ox, oy) inside a card rotated around its center.
const cardSpace = (cx, cy, width, height, rotation) => {
  const [px, py] = centered(cx, cy, width, height, rotation), angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
  return (ox, oy) => [Math.round(px + ox * cos - oy * sin), Math.round(py + ox * sin + oy * cos)]
}

const polaroid = (cx, cy, rotation, scene, caption) => {
  const at = cardSpace(cx, cy, 420, 500, rotation), [px, py] = at(0, 0), [sx, sy] = at(8, 8)
  return [
    box(sx + 6, sy + 10, 420, 500, '#000000', { rotation, opacity: 0.18 }),
    box(px, py, 420, 500, '#fffdf8', { rotation }),
    ...scene.map(({ kind, ox, oy, width, height, fill }) => {
      const [x, y] = at(30 + ox, 30 + oy)
      return kind === 'circle' ? { ...circle(x, y, width, fill), rotation } : box(x, y, width, height, fill, { rotation })
    }),
    { ...text(...at(30, 420), 360, 36, '#3b3b3b', caption, { font: 'Kalam', variant: 'light', align: 'center', lineHeight: 1 }), rotation },
    (([x, y]) => circle(x - 14, y - 14, 28, '#e63946'))(at(210, 14)),
  ]
}

const DEPARTURES = [['07:45', 'CANCÚN', 'A12', 'A TIEMPO', '#3ddc84'], ['08:10', 'MADRID', 'B04', 'ABORDANDO', '#ffb000'], ['08:35', 'BOGOTÁ', 'C21', 'RETRASADO', '#ff5252'],
  ['09:00', 'LIMA', 'A03', 'A TIEMPO', '#3ddc84'], ['09:20', 'BUENOS AIRES', 'B15', 'A TIEMPO', '#3ddc84'], ['09:50', 'NUEVA YORK', 'D08', 'ABORDANDO', '#ffb000'],
  ['10:15', 'LISBOA', 'C02', 'RETRASADO', '#ff5252'], ['10:40', 'TOKIO', 'D19', 'A TIEMPO', '#3ddc84']]

const EQUALIZER = Array.from({ length: 24 }, (_, index) => Math.round(60 + 230 * Math.abs(Math.sin(index * 0.55 + 0.4)) * (1 - Math.abs(index - 11.5) / 20)))

const PALM_LEAVES = [-165, -135, -105, -75, -45, -15, 15].map((angle, index) => {
  const [x, y] = centered(790 + 130 * Math.cos(angle * Math.PI / 180), 560 + 130 * Math.sin(angle * Math.PI / 180), 270, 54, angle)
  return oval(x, y, 270, 54, index % 2 ? '#1b7f5c' : '#2a9d6f', { rotation: angle })
})

const ROUTE = samples(24, t => [t, 0.5 + 0.28 * Math.sin(t * Math.PI * 1.6 + 0.4)])

export const THEME_TEMPLATES = [
  { key: 'boarding-pass', name: 'Tarjeta de embarque', category: 'Viajes', description: 'Pase de abordar 16:9 con talón perforado, ruta en grande, datos del vuelo y código de barras.',
    width: 1920, height: 1080, background: '#0e3b5c', objects: [
      ...gridLines(0, 0, 1920, 1080, 80, '#ffffff', { opacity: 0.05 }),
      box(160, 170, 1600, 740, '#fdfaf3', { radius: 36 }), box(160, 170, 1140, 120, '#e63946', { radius: 36 }), box(160, 230, 1140, 60, '#e63946'),
      icon('plane', 200, 205, 52, '#ffffff'), text(272, 213, 700, 34, '#ffffff', 'TARJETA DE EMBARQUE', { font: 'Montserrat', variant: 'bold', spacing: 80 }),
      circle(1270, 140, 60, '#0e3b5c'), circle(1270, 850, 60, '#0e3b5c'),
      line(1298, 220, 4, 600, [[0.5, 0], [0.5, 1]], '#c9c2b0', { weight: 4, dash: 'dashed' }),
      text(200, 330, 420, 230, '#14213d', 'MEX', { font: 'Oswald', variant: 'bold', lineHeight: 1 }),
      icon('plane', 640, 400, 120, '#e63946', 90),
      text(800, 330, 420, 230, '#14213d', 'CUN', { font: 'Oswald', variant: 'bold', lineHeight: 1 }),
      text(200, 600, 500, 26, '#5c677d', 'Ciudad de México', { font: 'Raleway', variant: 'medium' }), text(800, 600, 400, 26, '#5c677d', 'Cancún', { font: 'Raleway', variant: 'medium' }),
      box(200, 670, 1060, 2, '#d9d2bf'),
      ...[['PASAJERO', 'ANA TORRES', 200], ['VUELO', 'RX 482', 620], ['SALIDA', '07:45', 860], ['ASIENTO', '14A', 1080]].flatMap(([name, value, x]) => [
        label(x, 700, 360, '#8d99ae', name), text(x, 735, 420, 56, '#14213d', value, { font: 'Oswald', variant: 'semibold', lineHeight: 1 })]),
      label(1370, 230, 360, '#8d99ae', 'PUERTA'), text(1360, 255, 360, 220, '#e63946', 'B12', { font: 'Oswald', variant: 'bold', lineHeight: 1 }),
      label(1370, 540, 360, '#8d99ae', 'ABORDAJE 07:10'), ...barcode(1370, 600, 300, 200, '#14213d'),
    ] },
  { key: 'departures-board', name: 'Tablero de salidas', category: 'Viajes', description: 'Pizarra de aeropuerto con filas de vuelos, hora ámbar, puertas y estados con color.',
    width: 1080, height: 1350, background: '#0a0a0a', objects: [
      text(60, 70, 760, 66, '#ffb000', 'SALIDAS', { font: 'Oswald', variant: 'bold', lineHeight: 1, spacing: 60 }),
      text(60, 150, 760, 20, '#8a8a8a', 'DEPARTURES · TERMINAL 1', { font: 'IBM Plex Mono', spacing: 120 }),
      icon('plane', 910, 70, 110, '#ffb000', 45),
      ...['HORA', 'DESTINO', 'PUERTA', 'ESTADO'].map((name, index) => label([90, 300, 650, 800][index], 205, 200, '#6a6a6a', name)),
      ...DEPARTURES.flatMap(([time, place, gate, status, color], index) => {
        const y = 240 + index * 125
        return [box(60, y, 960, 100, '#161616', { radius: 8 }), box(60, y + 49, 960, 2, '#000000'),
          mono(90, y + 28, 200, 44, '#ffb000', time, { variant: 'bold', lineHeight: 1 }), text(300, y + 22, 340, 46, '#ffffff', place, { font: 'Oswald', variant: 'medium', lineHeight: 1 }),
          mono(650, y + 28, 130, 44, '#ffffff', gate, { variant: 'bold', lineHeight: 1 }), ...chip(800, y + 26, 200, 48, color, status, '#0a0a0a', { font: 'IBM Plex Mono', variant: 'bold', spacing: 0 })]
      }),
      text(60, 1270, 960, 20, '#6a6a6a', 'Verifica tu puerta 40 minutos antes de la salida.', { font: 'IBM Plex Mono' }),
    ] },
  { key: 'postcard-oaxaca', name: 'Postal de viaje', category: 'Viajes', description: 'Postal clásica: escena con sol y cactus a la izquierda; mensaje, estampilla y matasellos a la derecha.',
    width: 1500, height: 1000, background: '#d9c9a8', objects: [
      box(60, 60, 1380, 880, '#f6edd8', { radius: 12, stroke: '#b89f6e', strokeWidth: 3 }),
      ...gradientBands(110, 110, 760, 470, '#f9b572', '#fbe3b0', 14), circle(420, 250, 220, '#fff4d6'),
      oval(40, 480, 520, 260, '#c96f4a'), oval(380, 460, 560, 300, '#a3502e'), box(110, 600, 760, 290, '#7a3a21'),
      box(250, 500, 44, 200, '#3f7d4e', { radius: 22 }), box(206, 560, 30, 90, '#3f7d4e', { radius: 15 }), box(306, 540, 30, 100, '#3f7d4e', { radius: 15 }), box(206, 610, 90, 26, '#3f7d4e', { radius: 13 }), box(280, 590, 56, 26, '#3f7d4e', { radius: 13 }),
      text(140, 130, 700, 120, '#fffaf0', 'Saludos desde', { font: 'Great Vibes', lineHeight: 1 }),
      text(130, 740, 720, 120, '#fffaf0', 'OAXACA', { font: 'Oswald', variant: 'bold', lineHeight: 1, spacing: 160 }),
      line(930, 130, 4, 740, [[0.5, 0], [0.5, 1]], '#b89f6e', { weight: 3 }),
      box(1150, 110, 220, 270, '#c0392b'), box(1166, 126, 188, 238, '#c0392b', { noFill: true, strokeWidth: 3, stroke: '#f6edd8', dash: 'dashed' }),
      icon('sparkle', 1200, 160, 120, '#f6edd8'), text(1150, 300, 220, 22, '#f6edd8', 'CORREO', { font: 'Space Mono', align: 'center', spacing: 120 }),
      ...rings(1040, 290, [190, 140], '#6b5a3a', { weight: 3, opacity: 0.45 }), ...waves(900, 110, 150, 100, 4, '#6b5a3a', { weight: 3, cycles: 3, opacity: 0.4 }),
      text(980, 440, 420, 46, '#3b2e22', 'Querida Ana:', { font: 'Caveat', variant: 'bold', lineHeight: 1 }),
      text(980, 500, 420, 36, '#3b2e22', 'El mole está increíble y el\ncielo no deja de pintarse.\n¡Te traigo un poco!', { font: 'Caveat', lineHeight: 1.2 }),
      ...[690, 760, 830].map(y => box(980, y, 400, 2, '#8d7a55', { opacity: 0.7 })),
    ] },
  { key: 'tropical-paradise', name: 'Paraíso tropical', category: 'Viajes', description: 'Cartel de destino de playa: cielo al atardecer, mar en degradado, palmera y oferta de paquete.',
    width: 1080, height: 1350, background: '#ffd6a5', objects: [
      ...gradientBands(0, 0, 1080, 760, '#ff8f8f', '#ffe9c7', 30), circle(130, 380, 320, '#fff3d4'),
      ...gradientBands(0, 700, 1080, 650, '#2ec4b6', '#0b5f7a', 22), ...waves(0, 720, 1080, 220, 4, '#ffffff', { weight: 4, opacity: 0.5, cycles: 4 }),
      oval(150, 745, 260, 22, '#fff3d4', { opacity: 0.8 }), oval(200, 790, 160, 16, '#fff3d4', { opacity: 0.6 }),
      line(760, 540, 160, 800, samples(20, t => [0.1 + 0.8 * Math.pow(t, 0.8), t]), '#6b4423', { weight: 16 }), ...PALM_LEAVES, circle(776, 548, 30, '#4a2f17'),
      text(70, 80, 700, 20, '#ffffff', 'ESCAPADA DE VERANO', { font: 'Montserrat', variant: 'bold', spacing: 240 }),
      text(60, 800, 760, 230, '#ffffff', 'Paraíso', { font: 'Sacramento', lineHeight: 1 }),
      text(70, 1030, 700, 52, '#ffffff', 'CARIBE MEXICANO', { font: 'Montserrat', variant: 'black', spacing: 120, lineHeight: 1 }),
      ...chip(70, 1170, 560, 84, '#ffffff', 'DESDE $4,990 · 5 NOCHES', '#0b5f7a', { font: 'Montserrat', variant: 'bold', spacing: 20 }),
    ] },
  { key: 'city-guide', name: 'Guía de ciudad', category: 'Viajes', description: 'Portada de itinerario sobre un mapa: calles, río, parque, ruta punteada y paradas con etiqueta.',
    width: 1080, height: 1350, background: '#f2f0e6', objects: [
      box(560, 880, 420, 300, '#cfe3c4', { radius: 60 }), line(-40, 380, 1160, 300, samples(40, t => [t, 0.5 + 0.35 * Math.sin(t * Math.PI * 2 + 1)]), '#bfdcee', { weight: 90 }),
      ...gridLines(0, 0, 1080, 1350, 150, '#d8d4c2', { weight: 14 }), line(0, 0, 1080, 1350, [[0, 0], [1, 1]], '#d8d4c2', { weight: 14 }), line(0, 300, 1080, 900, [[0, 1], [1, 0]], '#d8d4c2', { weight: 10 }),
      line(152, 444, 690, 620, [[0, 0], [0.377, 0.145], [0.725, 0.548], [1, 1]], '#e4572e', { weight: 8, dash: 'dashed', start: 'circle', end: 'diamond' }),
      ...[[110, 360, 'Mercado'], [370, 450, 'Templo'], [610, 700, 'Mirador'], [800, 980, 'Café']].flatMap(([x, y, name]) => [
        icon('map-pin', x, y, 84, '#e4572e'), ...shadowBox(x + 84, y + 14, 190, 56, '#ffffff', { offset: 5, shadow: '#1d3557', stroke: '#1d3557', strokeWidth: 3, radius: 14 }),
        text(x + 84, y + 28, 190, 26, '#1d3557', name, { font: 'Bitter', variant: 'semibold', align: 'center', lineHeight: 1 })]),
      ...shadowBox(60, 60, 720, 270, '#1d3557', { offset: 10, shadow: '#e4572e', stroke: '#1d3557', radius: 24 }),
      text(100, 90, 640, 90, '#ffffff', '48 horas\nen Oaxaca', { font: 'Bitter', variant: 'bold', lineHeight: 1 }),
      text(100, 295, 640, 18, '#f1c40f', 'MERCADOS · TEMPLOS · MEZCAL', { font: 'Space Mono', spacing: 100 }),
      ...chip(60, 1230, 360, 70, '#e4572e', 'GUARDA ESTA RUTA', '#ffffff', { font: 'Montserrat', variant: 'bold' }),
    ] },
  { key: 'story-questions', name: 'Preguntas en historia', category: 'Historias', description: 'Historia vertical tipo caja de preguntas: degradado vivo, tarjeta blanca, campo de respuesta y destellos.',
    width: 1080, height: 1920, background: '#7b2ff7', objects: [
      ...gradientBands(0, 0, 1080, 960, '#7b2ff7', '#f107a3', 30), ...gradientBands(0, 960, 1080, 960, '#f107a3', '#ff9a3c', 30),
      circle(-120, 200, 420, '#ffffff', { opacity: 0.1 }), circle(760, 1300, 500, '#ffffff', { opacity: 0.1 }), circle(800, 120, 200, '#ffffff', { opacity: 0.12 }),
      circle(80, 90, 90, '#ffffff'), text(80, 112, 90, 40, '#7b2ff7', 'T', { font: 'Nunito', variant: 'extrabold', align: 'center', lineHeight: 1 }), text(190, 108, 500, 30, '#ffffff', '@tucuenta', { font: 'Nunito', variant: 'bold' }),
      box(100, 660, 900, 560, '#1a0a3a', { radius: 56, opacity: 0.25 }), box(90, 640, 900, 560, '#ffffff', { radius: 56 }),
      ...chip(130, 610, 270, 64, '#1a0a3a', 'PREGUNTAS', '#ffffff', { font: 'Nunito', variant: 'extrabold', spacing: 100 }),
      text(130, 730, 820, 110, '#1a0a3a', 'Hazme una\npregunta', { font: 'Nunito', variant: 'extrabold', lineHeight: 1 }),
      box(130, 1040, 820, 110, '#f1e9ff', { radius: 55 }), text(180, 1075, 700, 34, '#9b8ab8', 'Escribe aquí…', { font: 'Nunito', variant: 'medium', lineHeight: 1 }),
      icon('sparkle', 800, 560, 90, '#ffffff'), icon('sparkle', 70, 1330, 60, '#ffffff'), icon('sparkle', 920, 1380, 40, '#ffffff'),
      text(80, 1480, 920, 44, '#ffffff', 'Respondo las mejores hoy', { font: 'Nunito', variant: 'bold', align: 'center', lineHeight: 1 }),
    ] },
  { key: 'podcast-echoes', name: 'Portada de podcast', category: 'Redes sociales', description: 'Portada cuadrada con ecualizador en degradado naranja, anillos de sonido y título condensado.',
    width: 1080, height: 1080, background: '#111111', objects: [
      ...rings(540, 400, [820, 680, 540], '#ff6a00', { weight: 2, opacity: 0.3 }),
      ...EQUALIZER.map((height, index) => box(108 + index * 36, 400 - height / 2, 22, height, mix('#ffb347', '#ff3d00', index / 23), { radius: 11 })),
      ...chip(40, 40, 250, 56, '#ff6a00', 'EPISODIO 24', '#111111', { font: 'Space Mono', variant: 'bold' }),
      text(60, 650, 960, 230, '#ffffff', 'ECOS', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1, spacing: 200 }),
      text(60, 920, 960, 28, '#b5b5b5', 'Un podcast sobre ideas que se quedan', { font: 'Raleway', variant: 'light', align: 'center', spacing: 40 }),
      icon('play', 500, 985, 60, '#ff6a00'),
    ] },
  { key: 'challenge-tracker', name: 'Reto de 30 días', category: 'Redes sociales', description: 'Historia vertical con calendario de 30 casillas, días cumplidos, día actual y barra de progreso.',
    width: 1080, height: 1920, background: '#0f1b2d', objects: [
      text(80, 90, 700, 20, '#c6ff3d', 'FITNESS · MARZO', { font: 'Space Mono', spacing: 160 }),
      text(74, 140, 900, 150, '#c6ff3d', 'RETO\n30 DÍAS', { font: 'Montserrat', variant: 'black', lineHeight: 0.9 }),
      text(80, 480, 900, 30, '#9fb0c9', 'Marca cada día completado y no rompas la racha.', { font: 'Montserrat', variant: 'medium' }),
      ...Array.from({ length: 30 }, (_, index) => {
        const x = 80 + (index % 6) * 156, y = 620 + Math.floor(index / 6) * 156, day = index + 1
        return day <= 9 ? [box(x, y, 140, 140, '#c6ff3d', { radius: 28 }), text(x, y + 44, 140, 48, '#0f1b2d', String(day), { font: 'Montserrat', variant: 'black', align: 'center', lineHeight: 1 })]
          : day === 10 ? [box(x, y, 140, 140, '#c6ff3d', { noFill: true, strokeWidth: 5, stroke: '#c6ff3d', radius: 28 }), text(x, y + 44, 140, 48, '#c6ff3d', String(day), { font: 'Montserrat', variant: 'black', align: 'center', lineHeight: 1 })]
            : [box(x, y, 140, 140, '#1c2b45', { radius: 28 }), text(x, y + 44, 140, 48, '#5d7090', String(day), { font: 'Montserrat', variant: 'bold', align: 'center', lineHeight: 1 })]
      }).flat(),
      box(80, 1500, 920, 28, '#1c2b45', { radius: 14 }), box(80, 1500, 276, 28, '#c6ff3d', { radius: 14 }),
      text(80, 1550, 920, 34, '#ffffff', '9 de 30 · ¡sigue así!', { font: 'Montserrat', variant: 'bold' }),
      ...chip(80, 1700, 360, 80, '#c6ff3d', '@TUCUENTA', '#0f1b2d', { font: 'Montserrat', variant: 'black', spacing: 60 }),
    ] },
  { key: 'polaroid-trip', name: 'Recuerdos de viaje', category: 'Viajes', description: 'Collage de tres polaroids inclinadas con alfileres, escenas de colores y pies manuscritos.',
    width: 1080, height: 1350, background: '#e8dcc8', objects: [
      ...dotGrid(30, 30, 18, 22, 60, 5, '#b9a98a', 0.4),
      text(60, 70, 960, 24, '#6b5a3a', 'VIAJE · 2027', { font: 'Space Mono', align: 'center', spacing: 240 }),
      text(60, 120, 960, 100, '#2b3a42', 'Recuerdos de viaje', { font: 'Merriweather', variant: 'black', align: 'center', lineHeight: 1 }),
      ...polaroid(270, 610, -7, [{ kind: 'box', ox: 0, oy: 0, width: 360, height: 360, fill: '#8ecae6' }, { kind: 'circle', ox: 220, oy: 50, width: 90, fill: '#ffd166' }, { kind: 'box', ox: 0, oy: 240, width: 360, height: 120, fill: '#2a9d8f' }], 'Playa del Carmen'),
      ...polaroid(790, 570, 6, [{ kind: 'box', ox: 0, oy: 0, width: 360, height: 360, fill: '#f4a261' }, { kind: 'circle', ox: 130, oy: 90, width: 100, fill: '#fff3d4' }, { kind: 'box', ox: 0, oy: 250, width: 360, height: 110, fill: '#e76f51' }], 'Hierve el Agua'),
      ...polaroid(570, 1085, -3, [{ kind: 'box', ox: 0, oy: 0, width: 360, height: 360, fill: '#a8dadc' }, { kind: 'box', ox: 40, oy: 140, width: 120, height: 220, fill: '#457b9d' }, { kind: 'box', ox: 190, oy: 90, width: 130, height: 270, fill: '#1d3557' }], 'Centro histórico'),
    ] },
  { key: 'airport-wayfinding', name: 'Señalética de aeropuerto', category: 'Viajes', description: 'Letrero 16:9 de orientación: franja negra, puertas, flechas grandes y textos bilingües en amarillo.',
    width: 1920, height: 1080, background: '#ffd400', objects: [
      box(0, 0, 1920, 250, '#111111'), text(100, 70, 1200, 120, '#ffd400', 'PUERTAS · GATES', { font: 'Montserrat', variant: 'black', lineHeight: 1, spacing: 40 }), icon('plane', 1660, 65, 120, '#ffd400', 0),
      ...[['A1 – A12', 'Nacionales · Domestic', 'arrow-right', 0], ['B1 – B20', 'Internacionales · International', 'arrow-up-right', 0], ['Equipaje', 'Recogida · Baggage claim', 'arrow-right', 180]].flatMap(([name, sub, glyph, turn], index) => {
        const y = 300 + index * 260, [ix, iy] = centered(1710, y + 105, 150, 150, turn)
        return [text(100, y + 10, 1300, 140, '#111111', name, { font: 'Montserrat', variant: 'black', lineHeight: 1 }), text(104, y + 176, 1300, 36, '#111111', sub, { font: 'Montserrat', variant: 'medium', lineHeight: 1 }),
          icon(glyph, ix, iy, 150, '#111111', turn), box(100, y + 230, 1720, 8, '#111111')]
      }),
    ] },
]
