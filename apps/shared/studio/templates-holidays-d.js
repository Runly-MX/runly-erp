// Mexican holiday print templates, batch D: flyers, invitaciones, folletos (tríptico) and cartas
// for Día de Muertos, Navidad, Día de las Madres, San Valentín and Día de la Bandera.
import { badge, box, centered, chip, circle, dotGrid, doubleFrame, flower, icon, line, oval, rings, rule, samples, sunburst, text } from './templates-motifs.js'

const caps = (x, y, width, fill, value, options = {}) => text(x, y, width, 20, fill, value, { font: 'Space Mono', spacing: 100, ...options })
const norm = angle => ((angle % 360) + 360) % 360
const leaf = (cx, cy, width, height, angle, fill) => {
  const rotation = norm(angle), [x, y] = centered(cx, cy, width, height, rotation)
  return oval(x, y, width, height, fill, { rotation })
}
// Stacks paragraphs from y, measuring each block so none overlaps the next.
const flow = (x, y, width, paragraphs, { size = 30, fill = '#2b2b2b', font = 'Lora', variant = 'regular', lineHeight = 1.4, gap = 26, align = 'left' } = {}) => {
  let cursor = y
  const objects = paragraphs.map(value => { const block = text(x, cursor, width, size, fill, value, { font, variant, lineHeight, align }); cursor += block.height + gap; return block })
  return { objects, end: cursor }
}
const folds = fill => [line(550, 40, 2, 1195, [[0.5, 0], [0.5, 1]], fill, { weight: 2, dash: 'dashed', opacity: 0.5 }), line(1100, 40, 2, 1195, [[0.5, 0], [0.5, 1]], fill, { weight: 2, dash: 'dashed', opacity: 0.5 })]

// Papel picado flags hanging from a string; holes are cut in the background color.
const FLAG_COLORS = ['#ff2e93', '#ff8c1a', '#ffd23f', '#19c3b1', '#9b5de5']
const bunting = (y, width, count, background) => {
  const pitch = width / count, flagWidth = pitch - 14
  return [line(0, y - 24, width, 40, samples(20, t => [t, 4 * t * (1 - t)]), '#e8d9b8', { weight: 4 }),
    ...Array.from({ length: count }, (_, index) => {
      const x = Math.round(index * pitch + 7), color = FLAG_COLORS[index % 5]
      return [box(x, y, flagWidth, 170, color), circle(x + flagWidth / 2 - 18, y + 36, 36, background), box(x + 8, y + 90, flagWidth - 16, 6, background), box(x + 8, y + 108, flagWidth - 16, 6, background),
        ...[0, 1, 2].map(step => box(x + 10 + step * ((flagWidth - 20) / 3), y + 152, 22, 22, background, { rotation: 45 }))]
    }).flat()]
}
const candle = (x, y, width, height, color) => [box(x, y, width, height, color, { radius: 6 }), oval(x + width / 2 - 11, y - 38, 22, 38, '#ffd23f'), oval(x + width / 2 - 5, y - 24, 10, 22, '#ff8c1a')]
const holly = (cx, cy, rotation) => [leaf(cx, cy, 130, 48, rotation - 35, '#1f6f4a'), leaf(cx, cy, 130, 48, rotation + 35, '#2a8c5c'), leaf(cx, cy, 130, 48, rotation + 100, '#1f6f4a'),
  circle(cx - 28, cy - 12, 30, '#c1121f'), circle(cx + 2, cy - 18, 30, '#c1121f'), circle(cx - 8, cy + 8, 30, '#a4161a')]
const heartRow = (x, y, count, size, gap, fill, opacity) => Array.from({ length: count }, (_, index) => ({ ...icon('heart', x + index * (size + gap), y, size, fill), opacity }))
const laurel = (cx, cy, radius, fill) => [100, 125, 150, 175, 200, 225, 250].flatMap((angle, index) => [angle, 180 - angle].map(theta => {
  const radians = theta * Math.PI / 180
  return leaf(cx + radius * Math.cos(radians), cy + radius * Math.sin(radians), 46, 18, theta + 90 + (index % 2 ? 35 : -35), fill)
}))
// Waving tricolor made of thin columns that shift along a sine curve.
const waveY = x => Math.round(26 * Math.sin(x / 70))
const waveFlag = (top, bandHeight, width) => Array.from({ length: Math.ceil(width / 15) }, (_, index) => {
  const x = index * 15, shift = waveY(x + 7)
  return [box(x, top + shift, 16, bandHeight, '#006847'), box(x, top + bandHeight + shift, 16, bandHeight, '#ffffff'), box(x, top + bandHeight * 2 + shift, 16, bandHeight, '#ce1126')]
}).flat()

const CARTA_NAVIDAD = flow(140, 600, 995, ['Estimados clientes y amigos:',
  'Al cerrar este año queremos darles las gracias por su\nconfianza y por acompañarnos en cada proyecto. Cada\nconversación y cada reto compartido nos hicieron mejores.',
  'Que esta Navidad llegue con salud, paz y momentos junto a\nquienes más quieren. Les deseamos un Año Nuevo lleno de\nnuevas oportunidades y metas cumplidas.',
  'Nuestras oficinas cerrarán del 24 de diciembre al 1 de enero\ny reanudaremos actividades el 2 de enero a las 9:00 h.', 'Con cariño y gratitud,'])
const CARTA_AMOR = flow(190, 470, 900, ['Querida Sofía:',
  'Desde que llegaste, mis días tienen otro color.'+'\n'+'Gracias por cada risa, por cada abrazo y por'+'\n'+'quedarte conmigo cuando todo se pone difícil.',
  'En este 14 de febrero quiero prometerte algo:'+'\n'+'seguir eligiéndote cada día, con paciencia,'+'\n'+'café caliente y muchas canciones nuestras.', 'Con todo mi amor,'], { size: 42, font: 'Caveat', fill: '#5a2336', lineHeight: 1.25, gap: 34 })
const CIRCULAR = flow(130, 560, 1015, ['Asunto: Ceremonia cívica del Día de la Bandera', 'A los padres de familia y tutores:',
  'Con motivo del Día de la Bandera, la escuela realizará una\nceremonia cívica en el patio principal. Los alumnos\nparticiparán con honores, un coro y un cuadro histórico.',
  'Se solicita puntualidad y asistir con uniforme de gala.\nLas familias pueden acompañarnos en el patio cívico.',
  'Fecha: lunes 24 de febrero · Hora: 8:30 h · Salida: 10:30 h', 'Agradecemos su apoyo para fomentar en nuestros hijos el\namor y el respeto por los símbolos de la Patria.'], { size: 29, font: 'Libre Baskerville', fill: '#1d2b24', lineHeight: 1.45 })

export const HOLIDAYS_D = [
  { key: 'flyer-muertos-festival', name: 'Flyer Festival de las Ánimas (Día de Muertos)', category: 'Flyers', description: 'Flyer carta del Día de Muertos con papel picado, sol de rayos, cempasúchil, programa y velas encendidas.',
    width: 1275, height: 1650, background: '#1b0b2e', objects: [
      ...sunburst(900, 760, 1000, 44, '#2d1450', { weight: 16 }), circle(520, 380, 700, '#ff8c1a', { opacity: 0.16 }),
      ...bunting(60, 1275, 10, '#1b0b2e'),
      caps(80, 270, 1100, '#ffb703', 'CASA DE LA CULTURA · 1 Y 2 DE NOVIEMBRE'),
      text(70, 320, 860, 230, '#ffd23f', 'FESTIVAL\nDE LAS\nÁNIMAS', { font: 'Bebas Neue', lineHeight: 0.88 }),
      ...flower(1040, 560, 300, '#ff8c1a', '#ffd23f', { petals: 12, accent: '#ffb703' }), ...flower(1130, 900, 210, '#ffb703', '#ff8c1a', { petals: 10 }),
      ...[['18:00', 'Ofrenda monumental y altares'], ['19:30', 'Concurso de calaveras literarias'], ['21:00', 'Danza, música y pan de muerto']].flatMap(([time, label], index) => [
        text(80, 1080 + index * 82, 190, 32, '#ff8c1a', time, { font: 'Space Mono', variant: 'bold', lineHeight: 1 }), text(280, 1078 + index * 82, 900, 36, '#fff6e8', label, { font: 'Raleway', variant: 'medium', lineHeight: 1 }), box(80, 1130 + index * 82, 1115, 1, '#ffffff', { opacity: 0.18 })]),
      ...[0, 1, 2, 3, 4, 5, 6].flatMap(index => candle(90 + index * 170, 1420 - (index % 3) * 40, 50, 110 + (index % 3) * 40, index % 2 ? '#fff6e8' : '#ffd9a8')),
      ...chip(80, 1560, 420, 70, '#ff2e93', 'ENTRADA LIBRE', '#ffffff', { font: 'Montserrat', variant: 'black', spacing: 60 }),
    ] },
  { key: 'invitacion-muertos-altar', name: 'Invitación Noche de Ofrenda (Día de Muertos)', category: 'Invitaciones', description: 'Invitación vertical del Día de Muertos con nicho en arco, escalones de altar, velas, retrato y cempasúchil.',
    width: 1050, height: 1500, background: '#f3e6cb', objects: [
      ...doubleFrame(40, 40, 970, 1420, '#b4541a', { gap: 12 }),
      caps(100, 100, 850, '#b4541a', 'TE INVITAMOS A NUESTRA', { align: 'center', spacing: 160 }),
      text(100, 140, 850, 96, '#2a0f3d', 'Noche de\nOfrenda', { font: 'Playfair Display', variant: 'bold', align: 'center', lineHeight: 1.02 }),
      box(205, 420, 640, 780, '#2a0f3d', { radius: 320 }), box(235, 450, 580, 750, '#3b1a55', { radius: 290 }),
      box(425, 560, 200, 260, '#f3e6cb', { radius: 10 }), box(445, 580, 160, 220, '#d9c49a', { radius: 6 }), circle(500, 620, 50, '#9a7a4a'), box(480, 680, 90, 110, '#9a7a4a', { radius: 40 }),
      box(255, 880, 540, 60, '#ff8c1a'), box(285, 940, 480, 60, '#ffb703'), box(315, 1000, 420, 60, '#ff8c1a'), box(345, 1060, 360, 60, '#ffb703'),
      ...flower(300, 860, 110, '#ff8c1a', '#ffd23f'), ...flower(750, 860, 110, '#ff8c1a', '#ffd23f'), ...flower(340, 1130, 120, '#ffb703', '#ff8c1a'), ...flower(710, 1130, 120, '#ffb703', '#ff8c1a'),
      ...candle(330, 700, 36, 150, '#fff6e8'), ...candle(684, 700, 36, 150, '#fff6e8'), ...candle(470, 1010, 30, 90, '#ffd9a8'), ...candle(550, 1010, 30, 90, '#ffd9a8'),
      text(100, 1240, 850, 34, '#2a0f3d', 'SÁBADO 1 DE NOVIEMBRE · 7:00 PM', { font: 'Raleway', variant: 'bold', align: 'center', spacing: 40, lineHeight: 1 }),
      text(100, 1290, 850, 28, '#5a3a2a', 'Plaza Hidalgo · Trae una foto de tu ser querido', { font: 'Lora', variant: 'italic', align: 'center', lineHeight: 1 }), ...rule(325, 1360, 400, '#b4541a'),
      caps(100, 1385, 850, '#b4541a', 'CONFIRMA AL 55 5555 5555', { align: 'center', spacing: 80 }),
    ] },
  { key: 'carta-navidad-empresa', name: 'Carta de felicitación navideña (Navidad)', category: 'Cartas', description: 'Carta carta de Navidad para clientes: membrete verde, acebo en las esquinas, saludo, tres párrafos y firma.',
    width: 1275, height: 1650, background: '#fffdf7', objects: [
      box(0, 0, 1275, 36, '#1f6f4a'), box(0, 36, 1275, 8, '#c1121f'), ...holly(110, 150, 20), ...holly(1165, 150, 160), ...holly(110, 1500, 340), ...holly(1165, 1500, 200),
      circle(140, 90, 70, '#1f6f4a'), icon('sparkle', 156, 106, 38, '#ffffff'), text(230, 100, 560, 38, '#1f6f4a', 'CASA ALBA', { font: 'Montserrat', variant: 'black', lineHeight: 1, spacing: 120 }), caps(230, 148, 560, '#6b6b6b', 'SERVICIOS Y DISEÑO'),
      text(560, 118, 440, 22, '#3d3d3d', 'Ciudad de México, 15 de diciembre de 2027', { font: 'Raleway', align: 'right', lineHeight: 1 }),
      text(140, 270, 995, 150, '#c1121f', 'Felices Fiestas', { font: 'Great Vibes', align: 'center', lineHeight: 1 }), ...rule(437, 470, 400, '#1f6f4a'),
      ...CARTA_NAVIDAD.objects, box(140, CARTA_NAVIDAD.end + 40, 330, 2, '#2b2b2b'), text(140, CARTA_NAVIDAD.end + 54, 500, 40, '#c1121f', 'Ana Torres', { font: 'Great Vibes', lineHeight: 1 }), caps(140, CARTA_NAVIDAD.end + 110, 500, '#6b6b6b', 'DIRECCIÓN GENERAL'),
      box(0, 1600, 1275, 50, '#1f6f4a'), text(0, 1612, 1275, 20, '#ffffff', 'contacto@casaalba.mx · 55 1234 5678', { font: 'Space Mono', align: 'center', lineHeight: 1, spacing: 60 }),
    ] },
  { key: 'flyer-navidad-venta', name: 'Flyer Venta navideña (Navidad)', category: 'Flyers', description: 'Flyer carta de Navidad en rojo con nieve, regalo con moño, insignia de descuento y lista de promociones.',
    width: 1275, height: 1650, background: '#b3202a', objects: [
      ...dotGrid(40, 40, 12, 16, 105, 12, '#ffffff', 0.22),
      text(70, 100, 1135, 170, '#ffffff', 'VENTA\nNAVIDEÑA', { font: 'Montserrat', variant: 'black', lineHeight: 0.9 }),
      box(367, 760, 540, 440, '#ffd23f', { radius: 24 }), box(337, 680, 600, 120, '#ffe58a', { radius: 24 }), box(607, 680, 60, 520, '#1f6f4a'),
      leaf(520, 640, 190, 100, -25, '#1f6f4a'), leaf(754, 640, 190, 100, 205, '#1f6f4a'), circle(607, 610, 60, '#2a8c5c'),
      ...badge(900, 520, 280, '#ffd23f', '-40%', 'HASTA', '#b3202a', '#1f6f4a'),
      ...[['Juguetes y juegos', '2×1'], ['Decoración y luces', '-30%'], ['Tarjetas de regalo', '+10% extra']].flatMap(([label, price], index) => [
        text(90, 1262 + index * 70, 640, 38, '#ffffff', label, { font: 'Raleway', variant: 'bold', lineHeight: 1 }), line(600, 1282 + index * 70, 340, 8, [[0, 0.5], [1, 0.5]], '#ffffff', { weight: 3, dash: 'dotted', opacity: 0.7 }), text(960, 1260 + index * 70, 230, 42, '#ffd23f', price, { font: 'Oswald', variant: 'bold', align: 'right', lineHeight: 1 })]),
      ...chip(70, 1500, 1135, 84, '#ffffff', 'DEL 1 AL 24 DE DICIEMBRE · TIENDA Y EN LÍNEA', '#b3202a', { font: 'Montserrat', variant: 'bold', spacing: 30 }),
    ] },
  { key: 'invitacion-madres-comida', name: 'Invitación Comida del Día de las Madres', category: 'Invitaciones', description: 'Invitación vertical del 10 de mayo con manchas rosas, flores en las esquinas y título en cursiva.',
    width: 1050, height: 1500, background: '#fff1e6', objects: [
      circle(-120, -120, 560, '#ffd6e0', { opacity: 0.7 }), circle(600, 1000, 640, '#ffd6e0', { opacity: 0.7 }),
      ...flower(150, 150, 280, '#e63a6e', '#ffd23f', { accent: '#ff8fab' }), ...flower(360, 90, 190, '#ffb703', '#e63a6e'), ...flower(70, 400, 170, '#ff8fab', '#fff3b0', { accent: '#e63a6e' }), ...flower(950, 230, 230, '#ff8fab', '#ffd23f', { accent: '#e63a6e' }),
      ...flower(900, 1360, 300, '#e63a6e', '#ffd23f', { accent: '#ff8fab' }), ...flower(680, 1430, 200, '#ffb703', '#e63a6e'), ...flower(130, 1350, 240, '#ff8fab', '#fff3b0', { accent: '#e63a6e' }), ...flower(340, 1440, 170, '#e63a6e', '#ffd23f'),
      caps(100, 480, 850, '#b0305a', 'DÍA DE LAS MADRES · 10 DE MAYO', { align: 'center', spacing: 120 }),
      text(100, 540, 850, 120, '#b0305a', 'Una comida\npara mamá', { font: 'Playfair Display', variant: 'italic', align: 'center', lineHeight: 1 }), ...rule(325, 840, 400, '#e63a6e'),
      text(100, 880, 850, 36, '#5a2336', 'DOMINGO 10 DE MAYO · 2:30 PM', { font: 'Raleway', variant: 'bold', align: 'center', spacing: 40, lineHeight: 1 }),
      text(100, 940, 850, 30, '#5a2336', 'Salón Jacarandas, Av. Reforma 120', { font: 'Lora', align: 'center', lineHeight: 1 }), text(100, 990, 850, 30, '#5a2336', 'Vestimenta: colores de primavera', { font: 'Lora', variant: 'italic', align: 'center', lineHeight: 1 }),
      ...chip(285, 1090, 480, 76, '#e63a6e', 'CONFIRMA 55 1234 5678', '#ffffff', { font: 'Montserrat', variant: 'bold', spacing: 20 }),
    ] },
  { key: 'folleto-madres-promos', name: 'Folleto Regalos para mamá (Día de las Madres)', category: 'Folletos', description: 'Tríptico horizontal del Día de las Madres: portada con corazón, interior con tres regalos y cupón en la contraportada.',
    width: 1650, height: 1275, background: '#fff5f0', objects: [
      box(0, 0, 550, 1275, '#e63a6e'), ...dotGrid(40, 40, 5, 12, 100, 10, '#ffffff', 0.2), icon('heart', 175, 170, 200, '#ffffff'),
      text(30, 450, 490, 92, '#ffffff', 'Todo\npara mamá', { font: 'Pacifico', align: 'center', lineHeight: 1.05 }), caps(30, 740, 490, '#ffe1ea', 'PROMOCIONES · 10 DE MAYO', { align: 'center', spacing: 80 }),
      ...flower(120, 1120, 220, '#ffd23f', '#e63a6e'), ...flower(430, 1140, 180, '#ff8fab', '#fff3b0', { accent: '#ffffff' }),
      text(590, 70, 470, 70, '#b0305a', 'Elige su regalo', { font: 'Playfair Display', variant: 'bold', lineHeight: 1 }),
      ...[['Día de spa', 'Masaje, facial y té de la casa.', '$890', '#e63a6e'], ['Ramo de flores', 'Rosas y gerberas con moño.', '$450', '#ffb703'], ['Cena para dos', 'Menú de tres tiempos y postre.', '$1,200', '#2a9d8f']].flatMap(([title, copy, price, color], index) => {
        const y = 190 + index * 340
        return [box(595, y, 460, 300, '#ffffff', { radius: 28, stroke: '#ffd6e0', strokeWidth: 3 }), circle(625, y + 30, 70, color), icon('heart', 645, y + 50, 30, '#ffffff'),
          text(715, y + 40, 330, 40, '#b0305a', title, { font: 'Playfair Display', variant: 'semibold', lineHeight: 1.1 }), text(625, y + 130, 400, 26, '#5a2336', copy, { font: 'Raleway', lineHeight: 1.3 }),
          text(625, y + 215, 400, 60, color, price, { font: 'Oswald', variant: 'bold', lineHeight: 1 })]
      }),
      box(1140, 150, 470, 470, '#ffffff', { noFill: true, strokeWidth: 5, stroke: '#e63a6e', dash: 'dashed', radius: 30 }),
      text(1140, 200, 470, 150, '#e63a6e', '-20%', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }), text(1160, 380, 430, 32, '#b0305a', 'en tu segundo regalo', { font: 'Raleway', variant: 'bold', align: 'center', lineHeight: 1 }),
      caps(1160, 470, 430, '#5a2336', 'CUPÓN VÁLIDO HASTA EL 12 DE MAYO', { align: 'center', spacing: 20 }),
      text(1150, 700, 450, 32, '#b0305a', 'Sucursales', { font: 'Playfair Display', variant: 'bold', lineHeight: 1 }),
      text(1150, 760, 450, 26, '#5a2336', 'Centro · Av. Juárez 45\nPolanco · Masaryk 210\nCoyoacán · Plaza Hidalgo 8', { font: 'Raleway', lineHeight: 1.6 }), caps(1150, 1080, 450, '#e63a6e', 'WWW.TUTIENDA.MX', { spacing: 120 }),
      ...folds('#b0305a'),
    ] },
  { key: 'carta-valentin-amor', name: 'Carta de amor (San Valentín)', category: 'Cartas', description: 'Carta carta de San Valentín con filas de corazones, "Para ti" en caligrafía, texto manuscrito y sello de lacre.',
    width: 1275, height: 1650, background: '#fff6f3', objects: [
      ...heartRow(80, 50, 12, 44, 48, '#e8799a', 0.5), ...heartRow(80, 1556, 12, 44, 48, '#e8799a', 0.5),
      text(100, 150, 1075, 170, '#c2185b', 'Para ti', { font: 'Great Vibes', align: 'center', lineHeight: 1 }), ...rule(437, 360, 400, '#e8799a'), text(700, 400, 440, 22, '#8a4a5e', '14 de febrero', { font: 'Raleway', align: 'right', lineHeight: 1 }),
      ...CARTA_AMOR.objects, text(190, CARTA_AMOR.end + 10, 600, 90, '#c2185b', 'Tu eterno enamorado', { font: 'Great Vibes', lineHeight: 1 }),
      circle(920, 1290, 150, '#a4161a'), circle(935, 1305, 120, '#c1121f', { noFill: true, strokeWidth: 4, stroke: '#7a0f13' }), icon('heart', 962, 1338, 66, '#fff6f3'),
    ] },
  { key: 'folleto-valentin-cena', name: 'Folleto Cena para dos (San Valentín)', category: 'Folletos', description: 'Tríptico horizontal de San Valentín en vino y oro: portada con anillos y corazón, menú de tres tiempos y reservaciones.',
    width: 1650, height: 1275, background: '#4a0d1f', objects: [
      ...rings(275, 430, [440, 340, 240], '#d9b26f', { weight: 3, opacity: 0.55 }), icon('heart', 215, 370, 120, '#e8a0b4'),
      text(30, 720, 490, 130, '#fff1e8', 'Cena\npara dos', { font: 'Cormorant Garamond', variant: 'italic', align: 'center', lineHeight: 0.95 }), caps(30, 1020, 490, '#d9b26f', '14 DE FEBRERO · MENÚ ESPECIAL', { align: 'center', spacing: 60 }),
      text(570, 90, 480, 46, '#d9b26f', 'Menú de tres tiempos', { font: 'Cormorant Garamond', variant: 'semibold', align: 'center', lineHeight: 1 }), ...rule(650, 170, 320, '#e8a0b4'),
      ...[['ENTRADA', 'Carpaccio de betabel\ncon queso de cabra'], ['FUERTE', 'Filete en reducción de vino\ntinto y puré de camote'], ['POSTRE', 'Fondant de chocolate\ncon frambuesas']].flatMap(([course, dish], index) => [
        caps(590, 270 + index * 300, 440, '#e8a0b4', course, { align: 'center', spacing: 180 }), text(590, 315 + index * 300, 440, 40, '#fff1e8', dish, { font: 'Cormorant Garamond', variant: 'medium', align: 'center', lineHeight: 1.2 }), icon('heart', 805, 450 + index * 300, 32, '#d9b26f')]),
      ...doubleFrame(1135, 60, 480, 1155, '#d9b26f', { gap: 10 }), text(1150, 130, 450, 70, '#fff1e8', 'Reserva\ntu mesa', { font: 'Cormorant Garamond', variant: 'italic', align: 'center', lineHeight: 1 }),
      text(1150, 400, 450, 30, '#e8a0b4', 'Incluye copa de bienvenida\ny pétalos en la mesa.', { font: 'Raleway', align: 'center', lineHeight: 1.5 }), ...chip(1210, 640, 330, 74, '#d9b26f', '$1,450 POR PAREJA', '#4a0d1f', { font: 'Montserrat', variant: 'bold', spacing: 10 }),
      text(1150, 800, 450, 30, '#fff1e8', 'Restaurante Casa Rosa\nCalle Olmo 21, Centro\n55 8765 4321', { font: 'Raleway', align: 'center', lineHeight: 1.6 }), ...folds('#d9b26f'),
    ] },
  { key: 'flyer-bandera-ceremonia', name: 'Flyer Ceremonia del Día de la Bandera', category: 'Flyers', description: 'Flyer carta del 24 de febrero con bandera ondeante en tres franjas, programa de la ceremonia y entrada libre.',
    width: 1275, height: 1650, background: '#eef0ea', objects: [
      ...waveFlag(110, 170, 1275), icon('sparkle', 592, 300 + waveY(637), 90, '#006847'),
      caps(80, 705, 1100, '#006847', '24 DE FEBRERO · CEREMONIA CÍVICA', { spacing: 120 }),
      text(70, 790, 1135, 220, '#006847', 'DÍA DE LA\nBANDERA', { font: 'Bebas Neue', lineHeight: 0.9 }), box(80, 1210, 220, 8, '#ce1126'),
      ...[['08:30', 'Honores a la Bandera y lectura de decreto'], ['09:15', 'Coro escolar e Himno Nacional'], ['10:00', 'Cuadro histórico y abanderamiento']].flatMap(([time, label], index) => [
        text(80, 1250 + index * 66, 170, 32, '#ce1126', time, { font: 'Space Mono', variant: 'bold', lineHeight: 1 }), text(270, 1248 + index * 66, 930, 34, '#1d2b24', label, { font: 'Raleway', variant: 'medium', lineHeight: 1 })]),
      ...chip(80, 1500, 700, 80, '#006847', 'ENTRADA LIBRE · PLAZA CÍVICA', '#ffffff', { font: 'Montserrat', variant: 'bold', spacing: 30 }),
    ] },
  { key: 'carta-bandera-circular', name: 'Circular escolar Día de la Bandera', category: 'Cartas', description: 'Carta oficio carta para padres de familia: franja tricolor, membrete con laurel, asunto, párrafos, horario y firma.',
    width: 1275, height: 1650, background: '#fdfdf9', objects: [
      box(0, 0, 425, 30, '#006847'), box(425, 0, 425, 30, '#ffffff'), box(850, 0, 425, 30, '#ce1126'), box(0, 29, 1275, 2, '#c9c9bd'),
      box(0, 0, 26, 550, '#006847'), box(0, 550, 26, 550, '#e9e9df'), box(0, 1100, 26, 550, '#ce1126'),
      ...laurel(210, 170, 62, '#006847'), icon('sparkle', 180, 140, 60, '#ce1126'),
      text(300, 110, 520, 36, '#1d2b24', 'ESCUELA PRIMARIA', { font: 'Libre Baskerville', variant: 'bold', lineHeight: 1, spacing: 60 }), text(300, 160, 520, 36, '#006847', '"Benito Juárez"', { font: 'Libre Baskerville', variant: 'italic', lineHeight: 1 }),
      caps(300, 215, 520, '#6b6b6b', 'CLAVE 09DPR0000A · TURNO MATUTINO', { spacing: 20 }),
      text(830, 120, 315, 28, '#ce1126', 'CIRCULAR No. 14', { font: 'Libre Baskerville', variant: 'bold', align: 'right', lineHeight: 1 }), caps(830, 168, 315, '#6b6b6b', 'CICLO 2026–2027', { align: 'right', spacing: 40 }),
      box(130, 290, 1015, 3, '#006847'), text(130, 330, 1015, 28, '#1d2b24', 'Ciudad de México, a 17 de febrero de 2027', { font: 'Libre Baskerville', align: 'right', lineHeight: 1 }),
      ...CIRCULAR.objects, box(130, CIRCULAR.end + 50, 340, 2, '#1d2b24'), caps(130, CIRCULAR.end + 66, 400, '#1d2b24', 'ATENTAMENTE', { spacing: 120 }), text(130, CIRCULAR.end + 100, 600, 30, '#006847', 'La Dirección', { font: 'Libre Baskerville', variant: 'italic', lineHeight: 1 }),
    ] },
]
