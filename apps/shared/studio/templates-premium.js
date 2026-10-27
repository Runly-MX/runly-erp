// Premium starting points: richer compositions built only from the document
// primitives (rectangles, ellipses, text with bundled fonts, Lucide vectors),
// so every piece stays editable. Text is left-aligned (no textAlign in the
// document), compositions are editorial/asymmetric by design.

const rect = (x, y, width, height, fill, rotation = 0) => ({ type: 'rectangle', x, y, width, height, fill, rotation })
const circle = (x, y, size, fill) => ({ type: 'ellipse', x, y, width: size, height: size, fill })
const oval = (x, y, width, height, fill, rotation = 0) => ({ type: 'ellipse', x, y, width, height, fill, rotation })
const text = (x, y, width, fontSize, fill, value, fontFamily = 'Lato') => ({ type: 'text', x, y, width, fontSize, fill, text: value, fontFamily,
  height: Math.ceil(value.split('\n').length * fontSize * 1.2) })
// Thin-line frame (four rects) so shapes behind it stay visible.
const frame = (x, y, width, height, weight, fill) => [rect(x, y, width, weight, fill), rect(x, y + height - weight, width, weight, fill),
  rect(x, y, weight, height, fill), rect(x + width - weight, y, weight, height, fill)]
// Ring = two concentric ellipses (outer color, inner background).
const ring = (x, y, size, weight, fill, background) => [circle(x, y, size, fill), circle(x + weight, y + weight, size - weight * 2, background)]

// Leafy branch: a stem rotated around its top-left corner (like Fabric) with
// leaves placed along it, alternating sides. leaves = [[t 0..1, side ±1]].
const branch = (x, y, length, rotation, leaves, fill = '#7d8f6e') => {
  const angle = rotation * Math.PI / 180, dx = -Math.sin(angle), dy = Math.cos(angle)
  return [rect(x, y, 6, length, fill, rotation), ...leaves.map(([t, side]) => {
    const cx = x + dx * length * t + side * dy * 38, cy = y + dy * length * t - side * dx * 38
    return oval(Math.round(cx - 35), Math.round(cy - 13), 70, 26, fill, rotation + side * 50)
  })]
}

// Lucide icons (ISC), 24×24 geometry.
const LUCIDE = {
  sparkle: { paths: ['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'], filled: true },
  zap: { paths: ['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'], filled: true },
  play: { paths: ['M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z'], filled: true },
  'arrow-up-right': { paths: ['M7 7h10v10', 'M7 17 17 7'], filled: false },
  plane: { paths: ['M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'], filled: false },
  'map-pin': { paths: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0', 'M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0'], filled: false },
  check: { paths: ['M20 6 9 17l-5-5'], filled: false },
  'arrow-right': { paths: ['M5 12h14', 'm12 5 7 7-7 7'], filled: false },
  heart: { paths: ['M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.457 5.457 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5'], filled: true },
}
export const icon = (name, x, y, size, fill, rotation = 0) => ({ type: 'vector', iconId: `lucide:${name}`, x, y, width: size, height: size, fill, rotation,
  geometry: { width: 24, height: 24, paths: LUCIDE[name].paths.map(d => ({ d, fill: LUCIDE[name].filled ? 'color' : 'none', stroke: 'color', strokeWidth: 2, cap: 'round', join: 'round' })) } })

const CONFETTI = [
  [70, 80, 46, 18, '#ffd23f', 24], [250, 40, 22, 22, '#ffffff', 0], [420, 110, 40, 14, '#2ec4b6', -32], [930, 60, 50, 18, '#1b1b3a', 40],
  [990, 230, 24, 24, '#ffd23f', 0], [860, 160, 30, 12, '#ffffff', -12], [40, 380, 28, 28, '#2ec4b6', 0], [30, 640, 52, 16, '#ffd23f', 62],
  [540, 980, 44, 16, '#ffffff', -20], [330, 1000, 22, 22, '#ffd23f', 0], [140, 900, 36, 14, '#1b1b3a', 30], [1010, 520, 20, 20, '#2ec4b6', 0],
]

export const PREMIUM_TEMPLATES = [
  { key: 'gala-night', name: 'Noche de gala', category: 'Invitaciones', description: 'Invitación vertical en negro y dorado con marco fino, anillos y tipografía editorial.',
    width: 1080, height: 1920, background: '#0b0b0f', objects: [
      ...ring(560, 1300, 640, 5, '#c9a54c', '#0b0b0f'), ...ring(680, 1420, 400, 5, '#c9a54c', '#0b0b0f'), circle(800, 1540, 160, '#c9a54c'),
      ...frame(60, 60, 960, 1800, 3, '#c9a54c'), ...frame(84, 84, 912, 1752, 1, '#c9a54c'),
      icon('sparkle', 150, 200, 76, '#c9a54c'), icon('sparkle', 236, 250, 34, '#c9a54c'),
      text(150, 340, 780, 30, '#c9a54c', 'ESTÁS INVITADO A UNA'),
      text(140, 400, 820, 190, '#f5efe0', 'Noche\nde Gala', 'Playfair Display'),
      rect(150, 880, 120, 4, '#c9a54c'),
      text(150, 940, 760, 46, '#f5efe0', 'Sábado 13 de diciembre', 'Playfair Display'),
      text(150, 1010, 760, 32, '#9c968a', '20:00 h · Etiqueta rigurosa\nSalón Imperial, Centro Histórico'),
      text(150, 1700, 720, 26, '#c9a54c', 'CONFIRMA ANTES DEL 5 DE DICIEMBRE', 'Space Mono'),
    ] },
  { key: 'new-drop', name: 'Nuevo drop', category: 'Redes sociales', description: 'Lanzamiento de producto con anillos lima eléctricos, titular gigante y etiqueta de precio.',
    width: 1080, height: 1350, background: '#0a0e27', objects: [
      ...ring(380, 300, 900, 12, '#c6ff3d', '#0a0e27'), ...ring(500, 420, 660, 12, '#c6ff3d', '#0a0e27'), circle(620, 540, 420, '#c6ff3d'),
      icon('arrow-up-right', 650, 570, 360, '#0a0e27'),
      text(70, 70, 640, 26, '#c6ff3d', 'COLECCIÓN 05 / EDICIÓN LIMITADA', 'Space Mono'),
      text(60, 620, 620, 240, '#ffffff', 'NUEVO\nDROP', 'Bebas Neue'),
      circle(810, 1040, 210, '#ff3d7f'), text(852, 1102, 160, 70, '#ffffff', '$899', 'Bebas Neue'),
      text(70, 1230, 640, 28, '#c6ff3d', 'DISPONIBLE EL VIERNES · 10:00', 'Space Mono'),
    ] },
  { key: 'save-the-date', name: 'Save the date', category: 'Invitaciones', description: 'Boda en tonos crema y salvia con arco, ramas dibujadas y nombres manuscritos.',
    width: 1200, height: 1680, background: '#f4eee4', objects: [
      circle(300, 220, 600, '#c8d3bf'), rect(300, 520, 600, 900, '#c8d3bf'),
      ...branch(870, 250, 300, 32, [[0.2, 1], [0.4, -1], [0.6, 1], [0.8, -1]]), circle(872, 222, 18, '#b5838d'), circle(896, 244, 14, '#b5838d'),
      ...branch(320, 1150, 260, -28, [[0.25, -1], [0.5, 1], [0.75, -1]]),
      text(80, 90, 1040, 30, '#5b6b55', 'SAVE THE DATE'),
      text(360, 600, 500, 110, '#3c4a37', 'Ana\n& Luis', 'Pacifico'),
      icon('heart', 760, 880, 44, '#b5838d'),
      rect(360, 920, 80, 3, '#3c4a37'),
      text(360, 960, 500, 52, '#3c4a37', '21 · 03 · 2027', 'Playfair Display'),
      text(360, 1060, 480, 30, '#5b6b55', 'Hacienda Los Olivos\nValle de Guadalupe'),
      text(80, 1560, 1040, 26, '#5b6b55', 'INVITACIÓN FORMAL A CONTINUACIÓN'),
    ] },
  { key: 'black-friday', name: 'Black Friday', category: 'Promociones', description: 'Historia de alto impacto con titulares apilados, bloque rojo y descuento protagonista.',
    width: 1080, height: 1920, background: '#060606', objects: [
      text(60, 120, 980, 260, '#262626', 'BLACK', 'Bebas Neue'), text(60, 400, 980, 260, '#ff2b3d', 'BLACK', 'Bebas Neue'),
      text(60, 680, 980, 260, '#ffffff', 'FRIDAY', 'Bebas Neue'), text(60, 960, 980, 260, '#262626', 'FRIDAY', 'Bebas Neue'),
      icon('zap', 860, 70, 150, '#ff2b3d'),
      rect(60, 1290, 960, 360, '#ff2b3d'),
      text(96, 1300, 600, 330, '#060606', '-70%', 'Bebas Neue'),
      text(680, 1360, 320, 44, '#060606', 'EN TODA\nLA TIENDA', 'Oswald'),
      text(60, 1720, 960, 30, '#ffffff', 'SOLO 28 · 29 · 30 NOV — TUMARCA.COM', 'Space Mono'),
    ] },
  { key: 'tech-summit', name: 'Futuro conectado', category: 'Presentaciones', description: 'Portada de conferencia tecnológica con cuadrícula, orbes violeta y cian y acento mono.',
    width: 1920, height: 1080, background: '#07070d', objects: [
      ...Array.from({ length: 11 }, (_, n) => rect(160 + n * 160, 0, 2, 1080, '#191932')),
      ...Array.from({ length: 6 }, (_, n) => rect(0, 160 + n * 160, 1920, 2, '#191932')),
      circle(1180, -220, 920, '#2a1670'), circle(1380, 180, 620, '#6d28d9'), circle(1560, 420, 300, '#22d3ee'), circle(1700, 560, 80, '#ffffff'),
      icon('sparkle', 1240, 640, 70, '#22d3ee'),
      text(120, 140, 900, 30, '#22d3ee', '// CONFERENCIA ANUAL 2027', 'Space Mono'),
      text(110, 250, 1100, 200, '#ffffff', 'FUTURO\nCONECTADO', 'Oswald'),
      rect(120, 780, 90, 6, '#22d3ee'),
      text(120, 830, 1150, 38, '#a5a6c4', '15–16 de mayo · Ciudad de México · Transmisión global'),
      rect(1360, 880, 440, 104, '#ffffff'), text(1400, 906, 380, 40, '#07070d', 'REGÍSTRATE  →', 'Oswald'),
    ] },
  { key: 'birthday-pop', name: 'Feliz cumple', category: 'Redes sociales', description: 'Cumpleaños vibrante con confeti, letra manuscrita y edad gigante.',
    width: 1080, height: 1080, background: '#ff5a3c', objects: [
      ...CONFETTI.map(([x, y, width, height, fill, rotation]) => width === height ? circle(x, y, width, fill) : rect(x, y, width, height, fill, rotation)),
      circle(600, 600, 440, '#1b1b3a'), ...ring(570, 570, 500, 4, '#ffd23f', '#ff5a3c'), circle(600, 600, 440, '#1b1b3a'),
      text(720, 640, 300, 360, '#ffd23f', '30', 'Bebas Neue'),
      text(80, 210, 900, 150, '#1b1b3a', '¡Feliz\ncumple!', 'Pacifico'),
      text(90, 700, 460, 40, '#1b1b3a', 'Celebremos juntos\nViernes 8 · 21:00 h'),
      text(90, 960, 460, 26, '#ffffff', 'TRAE TU MEJOR SONRISA', 'Space Mono'),
    ] },
  { key: 'tasting-menu', name: 'Siete tiempos', category: 'Menús', description: 'Menú degustación en verde profundo y dorado, numerado y con serif editorial.',
    width: 1050, height: 1485, background: '#0f2a22', objects: [
      circle(720, -160, 420, '#163a2f'), ...frame(50, 50, 950, 1385, 2, '#c8a96a'),
      text(110, 130, 830, 28, '#c8a96a', 'MENÚ DEGUSTACIÓN · OTOÑO'),
      text(105, 190, 840, 120, '#f3ead8', 'Siete\ntiempos', 'Playfair Display'),
      rect(110, 520, 60, 3, '#c8a96a'),
      ...[['Tostada de betabel', 'Queso de cabra, nuez caramelizada y brotes'], ['Crema de elote', 'Aceite de chile pasilla y totopo de maíz azul'],
        ['Pesca del día', 'Mantequilla de limón amarillo y hierbas'], ['Short rib', 'Mole negro de la casa, puré de camote'], ['Tarta de higo', 'Helado de vainilla y miel de agave']]
        .flatMap(([name, detail], n) => [text(110, 580 + n * 150, 80, 40, '#c8a96a', `0${n + 1}`, 'Playfair Display'),
          text(210, 580 + n * 150, 720, 38, '#f3ead8', name, 'Playfair Display'), text(210, 632 + n * 150, 720, 24, '#9fb3a8', detail)]),
      text(110, 1330, 830, 26, '#c8a96a', '$1,450 por persona · Maridaje opcional'),
    ] },
  { key: 'solar-fest', name: 'Solar Fest', category: 'Carteles', description: 'Cartel retro de festival con sol rayado, halos y bloque informativo rosa.',
    width: 800, height: 1120, background: '#1a0b2e', objects: [
      circle(-20, 210, 840, '#2d1047'), circle(40, 270, 720, '#4a1456'), circle(100, 330, 600, '#ff8a3d'), circle(160, 390, 480, '#ffb347'),
      ...[[650, 8], [690, 12], [728, 16], [764, 20], [798, 24], [834, 30], [872, 36]].map(([y, height]) => rect(0, y, 800, height, '#1a0b2e')),
      rect(0, 930, 800, 190, '#ff4f8b'),
      text(50, 50, 720, 170, '#ffd166', 'SOLAR\nFEST', 'Bebas Neue'),
      text(560, 70, 200, 26, '#ffd166', 'VOL. 03', 'Space Mono'),
      text(50, 960, 720, 42, '#1a0b2e', 'ATARDECER · MÚSICA · ARTE', 'Oswald'),
      text(50, 1030, 720, 28, '#1a0b2e', '12 JULIO · PLAYA NORTE · 16:00 H', 'Space Mono'),
    ] },
  { key: 'webinar-cover', name: 'Portada de video', category: 'Banners', description: 'Miniatura de video llamativa en amarillo y negro con botón de reproducción.',
    width: 1280, height: 720, background: '#ffd400', objects: [
      circle(800, 100, 520, '#111111'), circle(960, 260, 200, '#ff2d2d'), icon('play', 1012, 312, 96, '#ffffff'),
      text(60, 70, 760, 150, '#111111', '5 ERRORES\nQUE FRENAN\nTU NEGOCIO', 'Bebas Neue'),
      text(930, 470, 300, 34, '#ffd400', 'EN VIVO · JUEVES', 'Oswald'),
      rect(60, 630, 300, 10, '#ff2d2d'),
    ] },
  { key: 'real-estate', name: 'Tu próximo hogar', category: 'Banners', description: 'Banner inmobiliario sereno con arco terracota, azul profundo y serif elegante.',
    width: 1200, height: 630, background: '#f3ede4', objects: [
      rect(700, 0, 500, 630, '#1f3a4d'), circle(800, 50, 300, '#c86b4a'), rect(800, 200, 300, 430, '#c86b4a'),
      rect(948, 200, 4, 430, '#1f3a4d'), rect(800, 400, 300, 4, '#1f3a4d'),
      text(60, 70, 600, 24, '#c86b4a', 'RESIDENCIAL ALAMEDA'),
      text(55, 120, 640, 76, '#1f3a4d', 'Tu próximo\nhogar te espera', 'Playfair Display'),
      text(60, 330, 560, 26, '#4a5b66', 'Departamentos de 2 y 3 recámaras\ncon terraza y vista al parque.'),
      rect(60, 470, 270, 70, '#c86b4a'), text(90, 488, 230, 28, '#ffffff', 'Agenda tu visita'),
    ] },
]
