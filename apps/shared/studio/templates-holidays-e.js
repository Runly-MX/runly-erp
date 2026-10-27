// Mexican holiday print templates, batch E: Día del Padre, Día de los Abuelos,
// Año Nuevo, Independencia and Reyes Magos as invitations, flyers, folletos
// (tríptico 1650x1275, three 550px panels) and cartas (Letter 1275x1650).
import { badge, box, centered, chip, circle, confetti, dotGrid, doubleFrame, flower, gradientBands, icon, line, oval, rings, rule, samples, stars, sunburst, checker, starburst, text } from './templates-motifs.js'

const caps = (x, y, width, fill, value, options = {}) => text(x, y, width, 20, fill, value, { font: 'Space Mono', spacing: 100, ...options })
const guides = () => [550, 1100].map(x => line(x - 2, 30, 4, 1215, [[0.5, 0], [0.5, 1]], '#8a8a8a', { weight: 3, dash: 'dashed', opacity: 0.45 }))
const norm = angle => ((angle % 360) + 360) % 360

// Papel picado string: colored flags with a round hole, slits and a scalloped cut in the background color.
const FLAGS = ['#c8102e', '#2fbf8a', '#ffffff', '#ffd23f', '#ff7a00']
const picado = (x, y, width, count, bg) => {
  const step = width / count, w = Math.round(step - 12)
  return [line(x, y - 20, width, 40, samples(16, t => [t, 4 * t * (1 - t)]), '#e8d9b8', { weight: 4 }),
    ...Array.from({ length: count }, (_, index) => {
      const fx = Math.round(x + index * step + 6)
      return [box(fx, y, w, w * 1.3, FLAGS[index % 5]), circle(fx + w * 0.35, y + w * 0.22, w * 0.3, bg), box(fx + w * 0.1, y + w * 0.72, w * 0.8, w * 0.06, bg), box(fx + w * 0.1, y + w * 0.88, w * 0.8, w * 0.06, bg),
        ...[0, 1, 2].map(step2 => box(fx + w * 0.1 + step2 * w * 0.28, y + w * 1.3 - w * 0.1, w * 0.18, w * 0.18, bg, { rotation: 45 }))]
    }).flat()]
}

// Clock face with ticks and two hands near midnight.
const clock = (cx, cy, radius) => {
  const ticks = Array.from({ length: 12 }, (_, index) => {
    const angle = index * 30 - 90, rad = angle * Math.PI / 180, length = index % 3 === 0 ? 46 : 26, width = index % 3 === 0 ? 10 : 6
    const [x, y] = centered(cx + (radius - 34 - length / 2) * Math.cos(rad), cy + (radius - 34 - length / 2) * Math.sin(rad), width, length, norm(angle + 90))
    return box(x, y, width, length, '#0b1437', { rotation: norm(angle + 90) })
  })
  const hand = (length, phi, width, fill) => {
    const rad = phi * Math.PI / 180, [x, y] = centered(cx + (length / 2) * Math.sin(rad), cy - (length / 2) * Math.cos(rad), width, length, norm(phi))
    return box(x, y, width, length, fill, { rotation: norm(phi), radius: width / 2 })
  }
  return [circle(cx - radius, cy - radius, radius * 2, '#f7e7b4'), ...rings(cx, cy, [radius * 2 - 20], '#d4af37', { weight: 12 }), ...ticks, hand(150, -22, 14, '#0b1437'), hand(215, -6, 8, '#b0413e'), circle(cx - 16, cy - 16, 32, '#d4af37')]
}

// Rosca de Reyes: ring with candied fruit and sugar stripes.
const FRUIT = ['#c8102e', '#2f9e44', '#ffd23f', '#fff3e0']
const roscaFruit = (cx, cy, radius) => Array.from({ length: 18 }, (_, index) => {
  const angle = (index / 18) * 360, rad = angle * Math.PI / 180, px = cx + radius * Math.cos(rad), py = cy + radius * Math.sin(rad), kind = index % 4
  if (kind === 0) return circle(Math.round(px - 22), Math.round(py - 22), 44, FRUIT[0])
  if (kind === 2) return circle(Math.round(px - 20), Math.round(py - 20), 40, FRUIT[2])
  const [x, y] = centered(px, py, kind === 1 ? 70 : 60, kind === 1 ? 26 : 14, norm(angle + 90))
  return box(x, y, kind === 1 ? 70 : 60, kind === 1 ? 26 : 14, kind === 1 ? FRUIT[1] : FRUIT[3], { rotation: norm(angle + 90), radius: 8 })
})

const FLAMES = [300, 420, 340, 480, 380, 460, 330, 410, 300].flatMap((height, index) => {
  const x = index * 120 - 30
  return [oval(x, 1500 - height * 0.8, 140, height, '#e8590c'), oval(x + 22, 1500 - height * 0.6, 96, height * 0.8, '#ffb703'), oval(x + 44, 1500 - height * 0.38, 52, height * 0.55, '#fff3b0')]
})

const JAN = Array.from({ length: 31 }, (_, index) => {
  const slot = index + 5, col = slot % 7, row = Math.floor(slot / 7), x = 1150 + col * 64, y = 270 + row * 90
  return index === 0
    ? [circle(x - 2, y - 8, 56, '#ff6f59'), text(x, y, 52, 30, '#ffffff', '1', { font: 'Nunito', variant: 'bold', align: 'center', lineHeight: 1 })]
    : [text(x, y, 52, 30, '#264653', String(index + 1), { font: 'Nunito', variant: 'semibold', align: 'center', lineHeight: 1 })]
}).flat()

const RESOLUTIONS = ['Hacer ejercicio', 'Ahorrar cada quincena', 'Leer 12 libros', 'Viajar a un lugar nuevo', 'Aprender algo distinto', 'Dormir mejor', 'Más tiempo en familia']
const SCHEDULE = [['6:00 PM', 'Feria y antojitos'], ['8:00 PM', 'Mariachi en vivo'], ['10:30 PM', 'Ceremonia del Grito'], ['11:00 PM', 'Fuegos artificiales'], ['12:00 AM', 'Baile popular'], ['1:00 AM', 'Atole y despedida']]
const MENU = [['Pozole rojo', '$80'], ['Chiles en nogada', '$150'], ['Tostadas de tinga', '$45'], ['Elote y esquites', '$35'], ['Agua de jamaica', '$25']]

export const HOLIDAYS_E = [
  { key: 'invitacion-padre-parrillada', name: 'Invitación parrillada del Día del Padre', category: 'Invitaciones', description: 'Invitación vertical del Día del Padre: carbón oscuro, llamas en la base y datos de la comida.',
    width: 1050, height: 1500, background: '#1d1512', objects: [
      ...gradientBands(0, 0, 1050, 1500, '#1d1512', '#3a2217', 24),
      caps(90, 110, 870, '#ffb703', 'DÍA DEL PADRE · INVITACIÓN', { align: 'center', spacing: 160 }),
      text(60, 170, 930, 170, '#fff3e0', 'Parrillada\ncon papá', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 0.92 }),
      text(90, 560, 870, 38, '#f3c98b', 'Celebremos al mejor cocinero y parrillero', { font: 'Lora', variant: 'italic', align: 'center' }),
      ...rule(325, 650, 400, '#ffb703'),
      box(90, 700, 870, 250, '#fff3e0', { radius: 28 }),
      text(90, 735, 870, 56, '#1d1512', 'DOM 15 JUNIO · 2:00 PM', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      text(90, 820, 870, 32, '#5a4030', 'Casa de los Torres · Calle Olmo 21', { font: 'Raleway', variant: 'semibold', align: 'center' }),
      text(90, 870, 870, 28, '#5a4030', 'Lleva tu apetito y tu mejor playera de papá', { font: 'Raleway', align: 'center' }),
      ...chip(300, 990, 450, 72, '#e8590c', 'CONFIRMA CON MAMÁ', '#fff3e0', { font: 'Montserrat', variant: 'black', spacing: 40 }),
      icon('sparkle', 120, 1080, 50, '#ffb703'), icon('sparkle', 880, 1040, 36, '#ffb703'), icon('sparkle', 800, 1110, 28, '#fff3b0'),
      ...FLAMES,
    ] },
  { key: 'flyer-padre-corbata', name: 'Flyer ofertas del Día del Padre', category: 'Flyers', description: 'Flyer vertical de ofertas del Día del Padre: corbata ilustrada, insignias de descuento y fechas.',
    width: 1275, height: 1650, background: '#0f2d4a', objects: [
      ...dotGrid(80, 60, 12, 2, 100, 8, '#1d4a73'),
      text(60, 120, 1155, 130, '#ffffff', 'Papá merece\nlo mejor', { font: 'Playfair Display', variant: 'bold', align: 'center', lineHeight: 1.05 }),
      box(...centered(637, 600, 120, 120, 45), 120, 120, '#9b0d24', { rotation: 45 }), box(577, 650, 120, 480, '#c8102e'), box(...centered(637, 1130, 85, 85, 45), 85, 85, '#c8102e', { rotation: 45 }),
      ...dotGrid(595, 700, 3, 10, 36, 14, '#ffffff').map(dot => ({ ...dot, opacity: 0.85 })),
      ...badge(110, 700, 270, '#ffd23f', '-20%', 'TODO EL MES', '#0f2d4a', '#c8102e'), ...badge(895, 820, 270, '#ffffff', '2×1', 'EN CORBATAS', '#c8102e', '#0f2d4a'),
      text(60, 1290, 1155, 40, '#ffd23f', 'Camisas · Relojes · Herramientas', { font: 'Oswald', variant: 'medium', align: 'center', spacing: 80, lineHeight: 1 }),
      ...chip(337, 1370, 600, 84, '#ffffff', 'DEL 9 AL 15 DE JUNIO', '#0f2d4a', { font: 'Montserrat', variant: 'black', spacing: 60 }),
      box(0, 1520, 1275, 130, '#c8102e'), text(60, 1555, 1155, 56, '#ffffff', 'TIENDA PAPÁ & CO · AV. REFORMA 100', { font: 'Oswald', variant: 'semibold', align: 'center', lineHeight: 1, spacing: 80 }),
    ] },
  { key: 'carta-abuelos-querido', name: 'Carta para los abuelos (Día de los Abuelos)', category: 'Cartas', description: 'Carta tamaño Letter para el Día de los Abuelos: papel crema, flores en las esquinas, tres párrafos y firma.',
    width: 1275, height: 1650, background: '#fbf4e4', objects: [
      ...doubleFrame(40, 40, 1195, 1570, '#d9b26f', { gap: 10, weight: 2 }),
      ...flower(100, 100, 250, '#f2a6b8', '#ffd166', { accent: '#ff8fab' }), ...flower(1175, 100, 250, '#f2a6b8', '#ffd166', { accent: '#ff8fab' }),
      ...flower(100, 1550, 220, '#ffd166', '#e8708f', { accent: '#f2a6b8' }), ...flower(1175, 1550, 220, '#ffd166', '#e8708f', { accent: '#f2a6b8' }),
      text(260, 150, 755, 90, '#c05a76', 'Para mis abuelos', { font: 'Great Vibes', align: 'center', lineHeight: 1 }), ...rule(437, 290, 400, '#d9b26f'),
      text(675, 330, 470, 28, '#7a5c4a', 'Ciudad de México, 28 de agosto', { font: 'Lora', variant: 'italic', align: 'right' }),
      text(130, 410, 900, 64, '#c05a76', 'Queridos abuelos:', { font: 'Dancing Script', variant: 'bold', lineHeight: 1 }),
      text(130, 510, 1015, 32, '#4a3a30', 'Hoy quise escribirles esta carta para decirles lo\nmucho que los quiero. Cada tarde en su casa, entre\nel olor a café y las historias de antes, aprendí\nlo que ningún libro me ha enseñado.', { font: 'Lora', lineHeight: 1.5 }),
      text(130, 770, 1015, 32, '#4a3a30', 'Gracias por cuidarme cuando era pequeño, por los\ndulces escondidos y por cada consejo dicho con\npaciencia. Ustedes son las raíces de nuestra\nfamilia y el lugar donde siempre me siento en casa.', { font: 'Lora', lineHeight: 1.5 }),
      text(130, 1030, 1015, 32, '#4a3a30', 'Prometo visitarlos más seguido y escucharlos con\natención. Que Dios los bendiga y les regale muchos\naños más para seguir abrazándolos.', { font: 'Lora', lineHeight: 1.5 }),
      text(130, 1275, 700, 32, '#7a5c4a', 'Con todo mi cariño,', { font: 'Lora', variant: 'italic' }), text(130, 1320, 600, 90, '#c05a76', 'Tu nieto', { font: 'Great Vibes', lineHeight: 1 }), box(130, 1430, 420, 2, '#c9a98a'),
      icon('heart', 950, 1290, 64, '#e8708f'), icon('heart', 1030, 1350, 40, '#f2a6b8'),
    ] },
  { key: 'invitacion-abuelos-convivio', name: 'Invitación convivio del Día de los Abuelos', category: 'Invitaciones', description: 'Invitación horizontal del Día de los Abuelos: panel turquesa con girasol gigante y datos del convivio.',
    width: 1500, height: 1050, background: '#fff8e7', objects: [
      box(0, 0, 600, 1050, '#2a9d8f'), ...rings(300, 525, [560, 500], '#ffffff', { weight: 3, opacity: 0.3 }), ...flower(300, 525, 430, '#ffb703', '#6b3f1d', { petals: 14, accent: '#ffd166' }),
      caps(660, 110, 780, '#2a9d8f', 'DÍA DE LOS ABUELOS · 28 DE AGOSTO', { spacing: 120 }),
      text(656, 160, 780, 90, '#2a6f66', 'Una tarde\ncon los\nabuelos', { font: 'Merriweather', variant: 'black', lineHeight: 1.1 }), ...rule(660, 520, 360, '#e9c46a'),
      text(660, 560, 780, 54, '#c8553d', 'SÁB 28 AGO · 4:00 PM', { font: 'Oswald', variant: 'bold', lineHeight: 1 }),
      text(660, 630, 780, 34, '#264653', 'Jardín de la Casa Grande', { font: 'Raleway', variant: 'semibold' }),
      text(660, 690, 780, 30, '#5a5a5a', 'Habrá pan dulce, café y música de los de antes.', { font: 'Lora', variant: 'italic', lineHeight: 1.3 }),
      ...checker(600, 840, 30, 3, 30, '#e9c46a', 0.55), ...chip(660, 740, 420, 70, '#2a9d8f', 'RSVP 55 1234 5678', '#ffffff', { font: 'Montserrat', variant: 'bold', spacing: 40 }),
    ] },
  { key: 'invitacion-ano-nuevo-gala', name: 'Invitación cena de Año Nuevo', category: 'Invitaciones', description: 'Invitación de Año Nuevo en azul medianoche con reloj a punto de dar las doce, confeti dorado y datos de la cena.',
    width: 1050, height: 1500, background: '#0b1437', objects: [
      ...gradientBands(0, 0, 1050, 1500, '#0b1437', '#1e2a6b', 30), ...confetti({ x: 20, y: 120, width: 90, height: 380 }, 7, ['#d4af37', '#f7e7b4', '#e8a0bf'], 5), ...confetti({ x: 920, y: 120, width: 90, height: 380 }, 7, ['#d4af37', '#f7e7b4', '#e8a0bf'], 9),
      caps(90, 90, 870, '#d4af37', 'DESPEDIMOS 2027', { align: 'center', spacing: 240 }),
      text(60, 140, 930, 120, '#f7e7b4', 'Cena de\nfin de año', { font: 'Cormorant Garamond', variant: 'semibold', align: 'center', lineHeight: 1 }),
      ...clock(525, 740, 280),
      ...[[110, 560, 30], [900, 540, 40], [160, 940, 24], [880, 960, 34], [940, 760, 20]].map(([x, y, size]) => circle(x, y, size, '#f7e7b4', { noFill: true, strokeWidth: 3, stroke: '#f7e7b4', opacity: 0.6 })),
      text(60, 1100, 930, 46, '#d4af37', 'MIÉ 31 DIC · 9:00 PM', { font: 'Montserrat', variant: 'bold', align: 'center', lineHeight: 1, spacing: 60 }),
      text(60, 1180, 930, 32, '#f7e7b4', 'Salón Estrella · Vestimenta formal', { font: 'Raleway', align: 'center' }),
      ...chip(250, 1300, 550, 76, '#d4af37', 'CONFIRMA ANTES DEL 20 DIC', '#0b1437', { font: 'Montserrat', variant: 'bold', spacing: 20 }),
    ] },
  { key: 'folleto-ano-nuevo-propositos', name: 'Folleto propósitos de Año Nuevo', category: 'Folletos', description: 'Tríptico de Año Nuevo: portada coral, lista de propósitos con casillas y calendario de enero.',
    width: 1650, height: 1275, background: '#fff9f0', objects: [
      box(0, 0, 550, 1275, '#ff6f59'), circle(-100, 800, 460, '#ff8a76', { opacity: 0.6 }), circle(240, 980, 260, '#ffb4a6', { opacity: 0.5 }),
      caps(50, 100, 450, '#ffffff', 'AÑO NUEVO · VIDA NUEVA', { spacing: 80 }), text(40, 160, 480, 190, '#ffffff', '2028', { font: 'Montserrat', variant: 'black', lineHeight: 1 }),
      text(50, 400, 460, 96, '#ffffff', 'Mis\npropósitos', { font: 'Dancing Script', variant: 'bold', lineHeight: 1 }),
      text(50, 760, 440, 30, '#fff3ee', 'Un cuaderno para escribir lo que sí quieres lograr.', { font: 'Lora', variant: 'italic', lineHeight: 1.3 }), icon('sparkle', 400, 1080, 70, '#ffffff'), icon('sparkle', 90, 1130, 40, '#ffffff'),
      caps(600, 90, 450, '#2a9d8f', 'ESTE AÑO VOY A…', { spacing: 100 }),
      ...RESOLUTIONS.flatMap((item, index) => {
        const y = 170 + index * 140
        return [box(600, y, 40, 40, '#2a9d8f', { noFill: true, strokeWidth: 4, stroke: '#2a9d8f', radius: 8 }), text(665, y - 2, 400, 34, '#264653', item, { font: 'Nunito', variant: 'bold', lineHeight: 1 }), box(665, y + 62, 390, 2, '#d9d2c0')]
      }),
      text(1150, 100, 450, 70, '#ff6f59', 'ENERO', { font: 'Oswald', variant: 'bold', lineHeight: 1, spacing: 160 }),
      ...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => text(1148 + index * 64, 210, 52, 24, '#2a9d8f', day, { font: 'Space Mono', variant: 'bold', align: 'center', lineHeight: 1 })), ...JAN,
      text(1150, 830, 450, 50, '#2a9d8f', 'Cada día es una\nnueva oportunidad', { font: 'Dancing Script', variant: 'bold', lineHeight: 1.05 }),
      ...chip(1150, 1100, 330, 70, '#ff6f59', 'FELIZ 2028', '#ffffff', { font: 'Montserrat', variant: 'black', spacing: 60 }), ...guides(),
    ] },
  { key: 'flyer-independencia-verbena', name: 'Flyer Noche Mexicana (Independencia)', category: 'Flyers', description: 'Flyer vertical de la verbena del 15 de septiembre: franjas tricolor, papel picado, fuegos artificiales y menú.',
    width: 1275, height: 1650, background: '#fffaf0', objects: [
      box(0, 0, 1275, 640, '#0b6e4f'), box(0, 640, 1275, 470, '#fffaf0'), box(0, 1110, 1275, 540, '#c8102e'), ...picado(30, 50, 1215, 10, '#0b6e4f'),
      caps(60, 255, 1155, '#ffd23f', 'GRAN VERBENA POPULAR', { align: 'center', spacing: 220 }),
      text(60, 305, 1155, 150, '#ffffff', 'VIVA\nMÉXICO', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 0.9 }),
      text(60, 690, 1155, 140, '#c8102e', 'Noche Mexicana', { font: 'Dancing Script', variant: 'bold', align: 'center', lineHeight: 1 }),
      text(60, 880, 1155, 40, '#0b6e4f', 'SALIDA 15 DE SEPTIEMBRE · 8:00 PM', { font: 'Montserrat', variant: 'bold', align: 'center', lineHeight: 1, spacing: 30 }),
      text(60, 960, 1155, 32, '#555555', 'Plaza de la colonia · Entrada libre', { font: 'Raleway', align: 'center' }),
      ...sunburst(140, 1290, 100, 14, '#ffd23f', { weight: 6 }), ...sunburst(1135, 1270, 90, 12, '#ffffff', { weight: 5 }), ...sunburst(640, 1580, 80, 12, '#ffd23f', { weight: 5, opacity: 0.8 }),
      text(260, 1220, 755, 46, '#ffffff', 'POZOLE · ANTOJITOS\nMARIACHI · FUEGOS ARTIFICIALES', { font: 'Oswald', variant: 'medium', align: 'center', lineHeight: 1.25, spacing: 40 }),
      ...chip(437, 1400, 400, 80, '#ffffff', 'ENTRADA LIBRE', '#c8102e', { font: 'Montserrat', variant: 'black', spacing: 60 }),
    ] },
  { key: 'folleto-independencia-programa', name: 'Folleto programa de Fiestas Patrias', category: 'Folletos', description: 'Tríptico de Independencia: portada verde con papel picado, programa por horas y menú patrio sobre rojo.',
    width: 1650, height: 1275, background: '#fffaf0', objects: [
      box(0, 0, 550, 1275, '#0b6e4f'), ...picado(10, 50, 530, 4, '#0b6e4f'),
      text(40, 330, 480, 140, '#ffffff', 'Fiestas\npatrias', { font: 'Oswald', variant: 'bold', lineHeight: 0.95 }), text(50, 650, 460, 38, '#ffffff', '15 y 16 de septiembre', { font: 'Montserrat', variant: 'medium', lineHeight: 1 }),
      text(40, 760, 480, 84, '#ffd23f', '¡Viva México!', { font: 'Dancing Script', variant: 'bold', lineHeight: 1 }), box(0, 1175, 550, 33, '#ffffff'), box(0, 1208, 550, 67, '#c8102e'),
      text(600, 80, 450, 80, '#0b6e4f', 'PROGRAMA', { font: 'Oswald', variant: 'bold', lineHeight: 1, spacing: 80 }), line(638, 250, 6, 880, [[0.5, 0], [0.5, 1]], '#c8102e', { weight: 6 }),
      ...SCHEDULE.flatMap(([time, what], index) => {
        const y = 250 + index * 150
        return [circle(622, y + 4, 38, '#c8102e'), circle(634, y + 16, 14, '#ffffff'), text(695, y, 380, 30, '#c8102e', time, { font: 'Space Mono', variant: 'bold', lineHeight: 1 }), text(695, y + 44, 380, 32, '#222222', what, { font: 'Montserrat', variant: 'medium', lineHeight: 1.2 })]
      }),
      box(1100, 0, 550, 1275, '#c8102e'), text(1150, 80, 450, 80, '#ffffff', 'MENÚ PATRIO', { font: 'Oswald', variant: 'bold', lineHeight: 1, spacing: 60 }),
      ...MENU.flatMap(([dish, price], index) => {
        const y = 260 + index * 130
        return [text(1150, y, 330, 36, '#ffffff', dish, { font: 'Lora', variant: 'semibold', lineHeight: 1 }), text(1500, y, 100, 36, '#ffd23f', price, { font: 'Oswald', variant: 'bold', align: 'right', lineHeight: 1 }), box(1150, y + 62, 450, 2, '#ffffff', { opacity: 0.4 })]
      }),
      ...chip(1150, 960, 360, 70, '#ffffff', 'ENTRADA LIBRE', '#c8102e', { font: 'Montserrat', variant: 'black', spacing: 60 }), caps(1150, 1070, 450, '#ffd23f', 'ORGANIZA: COMITÉ VECINAL', { spacing: 60 }), icon('sparkle', 1480, 1130, 60, '#ffd23f'), ...guides(),
    ] },
  { key: 'carta-reyes-magos', name: 'Carta a los Reyes Magos', category: 'Cartas', description: 'Carta tamaño Letter a los Reyes Magos del 6 de enero: cielo con estrella, marco dorado, lista de regalos y firma.',
    width: 1275, height: 1650, background: '#f6ead0', objects: [
      ...gradientBands(0, 0, 1275, 330, '#1b1f5e', '#6b4fb3', 24), ...starburst(637, 165, 150, '#ffd23f', { layers: 4 }), circle(607, 135, 60, '#fff6c9'),
      icon('sparkle', 200, 90, 50, '#ffffff'), icon('sparkle', 1020, 120, 40, '#ffffff'), icon('sparkle', 330, 230, 28, '#f7e7b4'), icon('sparkle', 930, 230, 34, '#f7e7b4'), icon('sparkle', 90, 220, 26, '#f7e7b4'),
      ...doubleFrame(50, 350, 1175, 1250, '#d4af37', { gap: 10, weight: 2 }),
      text(100, 380, 1075, 110, '#1b1f5e', 'Carta a los Reyes Magos', { font: 'Great Vibes', align: 'center', lineHeight: 1 }),
      text(130, 520, 1000, 62, '#b0413e', 'Queridos Reyes Magos:', { font: 'Dancing Script', variant: 'bold', lineHeight: 1 }),
      text(130, 620, 1015, 34, '#3a2d4f', 'Me llamo Sofía y este año me porté muy bien: ayudé\nen casa, hice mi tarea y compartí mis juguetes.\nPor eso me atrevo a escribirles esta carta.', { font: 'Kalam', lineHeight: 1.5 }),
      text(130, 830, 1015, 34, '#3a2d4f', 'Si no es mucha molestia, me gustaría pedirles:', { font: 'Kalam', lineHeight: 1.5 }),
      ...['1. Una bicicleta roja', '2. Un libro de dinosaurios', '3. Un juego de pintura'].flatMap((item, index) => [text(180, 910 + index * 70, 800, 38, '#b0413e', item, { font: 'Kalam', variant: 'bold', lineHeight: 1 }), box(180, 962 + index * 70, 760, 2, '#c9b48a')]),
      text(130, 1150, 1015, 34, '#3a2d4f', 'Les dejo agua y pasto para sus camellos, y galletas\npara ustedes. ¡Gracias por venir!', { font: 'Kalam', lineHeight: 1.5 }),
      text(130, 1320, 600, 32, '#6b4fb3', 'Con cariño,', { font: 'Lora', variant: 'italic' }), text(130, 1365, 600, 90, '#1b1f5e', 'Sofía', { font: 'Great Vibes', lineHeight: 1 }),
      ...stars(740, 1500, 44, 20, '#d4af37', 5),
    ] },
  { key: 'invitacion-reyes-rosca', name: 'Invitación para partir la rosca de Reyes', category: 'Invitaciones', description: 'Invitación de Reyes Magos: rosca con frutas cristalizadas sobre azul noche y datos para partirla el 6 de enero.',
    width: 1050, height: 1500, background: '#14284b', objects: [
      ...gradientBands(0, 0, 1050, 1500, '#14284b', '#1f3a5f', 24),
      icon('sparkle', 90, 120, 50, '#ffd23f'), icon('sparkle', 920, 200, 40, '#ffd23f'), icon('sparkle', 160, 330, 28, '#ffffff'), icon('sparkle', 870, 360, 30, '#ffffff'),
      text(60, 80, 930, 130, '#ffd23f', 'Parte la\nrosca', { font: 'Cormorant Garamond', variant: 'bold', align: 'center', lineHeight: 0.95 }),
      circle(205, 460, 640, '#d9893b', { noFill: true, strokeWidth: 110, stroke: '#d9893b' }), ...rings(525, 780, [640], '#f3c98b', { weight: 14, opacity: 0.6 }), ...roscaFruit(525, 780, 322),
      ...starburst(525, 780, 170, '#ffd23f', { layers: 4 }), circle(465, 720, 120, '#fff6c9'), text(445, 757, 160, 44, '#14284b', '6 ENE', { font: 'Oswald', variant: 'bold', align: 'center', lineHeight: 1 }),
      text(60, 1200, 930, 46, '#ffffff', '6 DE ENERO · 5:00 PM', { font: 'Montserrat', variant: 'black', align: 'center', lineHeight: 1, spacing: 60 }),
      text(60, 1275, 930, 32, '#f3c98b', 'Chocolate caliente, tamales y mucha alegría', { font: 'Raleway', align: 'center' }),
      ...chip(250, 1350, 550, 70, '#ffd23f', 'CONFIRMA TU ASISTENCIA', '#14284b', { font: 'Montserrat', variant: 'bold', spacing: 20 }),
      text(60, 1445, 930, 26, '#f3c98b', 'Si te toca el niño, ¡tú invitas los tamales el 2 de febrero!', { font: 'Lora', variant: 'italic', align: 'center' }),
    ] },
]
