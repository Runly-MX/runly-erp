// Starting points composed from the shared motifs in templates-motifs.js.
// Families: Negocios, Eventos, Redes sociales, Educación. No raster images.
import { badge, blob, box, chip, circle, cloud, confetti, doubleFrame, dotGrid, icon, line, rule, samples, stars, stripes, sunburst, text, waves } from './templates-motifs.js'

const kicker = (x, y, width, fill, value, align = 'left') => text(x, y, width, 20, fill, value, { font: 'Space Mono', spacing: 100, align })

export const FAMILY_TEMPLATES = [
  { key: 'product-spotlight', name: 'Producto destacado', category: 'Negocios', description: 'Publicación de producto con disco central, rayos, etiqueta de descuento y botón de compra.',
    width: 1080, height: 1080, background: '#fff4e6', objects: [
      circle(520, 120, 640, '#ffd8b8'), ...sunburst(840, 440, 300, 24, '#fff4e6', { weight: 5, opacity: 0.6 }),
      circle(660, 260, 360, '#ff6b35'), icon('sparkle', 750, 350, 180, '#fff4e6'),
      ...dotGrid(70, 760, 6, 3, 34, 8, '#ff6b35', 0.5),
      ...badge(820, 60, 190, '#2b1b12', '-30%', 'ESTA SEMANA', '#fff4e6', '#ff6b35'),
      kicker(70, 90, 480, '#ff6b35', 'NUEVA COLECCIÓN'),
      text(64, 140, 520, 104, '#2b1b12', 'Hecho\na tu\nmedida', { font: 'Playfair Display', variant: 'semibold', lineHeight: 0.95 }),
      text(70, 520, 420, 26, '#5a4030', 'Piezas únicas con materiales\nde origen local.', { font: 'Lora', variant: 'italic', lineHeight: 1.25 }),
      ...chip(70, 900, 300, 72, '#ff6b35', 'COMPRAR AHORA', '#fff4e6'),
      text(660, 930, 350, 22, '#2b1b12', '@tumarca', { variant: 'medium', align: 'right' }),
    ] },
  { key: 'testimonial', name: 'Testimonio', category: 'Negocios', description: 'Reseña de cliente con comillas grandes, estrellas, marco doble y ondas.',
    width: 1080, height: 1350, background: '#14213d', objects: [
      circle(-200, -200, 640, '#1f3560'), ...waves(0, 1130, 1080, 200, 4, '#1f3560', { weight: 6, cycles: 2.5 }),
      ...doubleFrame(50, 50, 980, 1250, '#fca311'),
      text(100, 120, 300, 300, '#fca311', '“', { font: 'Playfair Display', lineHeight: 1 }),
      text(100, 440, 880, 58, '#ffffff', 'Cambió por completo\nla forma en que\nvendemos.', { font: 'Playfair Display', variant: 'medium', lineHeight: 1.15 }),
      ...stars(100, 730, 44, 12, '#fca311'),
      text(100, 810, 860, 28, '#cfd8ea', 'Desde que lo usamos, los pedidos se duplicaron y el equipo ahorra horas cada semana.', { font: 'Lora', variant: 'italic', lineHeight: 1.35 }),
      circle(100, 1010, 96, '#fca311'), text(100, 1030, 96, 56, '#14213d', 'M', { font: 'Bebas Neue', align: 'center', lineHeight: 1 }),
      text(220, 1018, 700, 32, '#ffffff', 'María Fernández', { variant: 'semibold' }),
      text(220, 1066, 700, 18, '#9fb0d0', 'DIRECTORA · CASA ALBA', { font: 'Space Mono', spacing: 60 }),
    ] },
  { key: 'baby-shower', name: 'Baby shower', category: 'Eventos', description: 'Invitación suave con nubes, destellos, marco dorado y caligrafía.',
    width: 1080, height: 1350, background: '#fdf0f3', objects: [
      ...cloud(120, 150, 1, '#cfe6f0'), ...cloud(740, 220, 0.8, '#cfe6f0'), ...cloud(700, 1070, 1, '#cfe6f0'), ...cloud(120, 1120, 0.7, '#cfe6f0'),
      ...doubleFrame(50, 50, 980, 1250, '#d9b26f', { radius: 40 }),
      icon('sparkle', 480, 120, 120, '#d9b26f'), icon('sparkle', 250, 330, 50, '#f2a6b8'), icon('sparkle', 790, 380, 60, '#f2a6b8'),
      kicker(100, 360, 880, '#d9718d', 'TE INVITAMOS A UN', 'center'),
      text(100, 420, 880, 150, '#5a3a4a', 'Baby\nShower', { font: 'Playfair Display', variant: 'semibold', align: 'center', lineHeight: 0.95 }),
      ...rule(340, 790, 400, '#d9b26f'),
      text(100, 830, 880, 34, '#5a3a4a', 'en honor de la futura mamá', { font: 'Lora', variant: 'italic', align: 'center' }),
      text(100, 880, 880, 96, '#d9718d', 'Lucía', { font: 'Great Vibes', align: 'center', lineHeight: 1 }),
      text(100, 1010, 880, 28, '#5a3a4a', 'SÁBADO 14 DE JUNIO · 4:00 PM', { variant: 'medium', align: 'center' }),
      text(100, 1054, 880, 22, '#8a6a7a', 'Jardín Las Palmas', { align: 'center' }),
      ...chip(380, 1150, 320, 64, '#f2a6b8', 'CONFIRMA', '#5a3a4a'),
    ] },
  { key: 'conference-poster', name: 'Conferencia', category: 'Eventos', description: 'Cartel de congreso con rayos, título condensado y agenda por horas.',
    width: 1080, height: 1350, background: '#0b132b', objects: [
      ...sunburst(900, 280, 760, 36, '#1c2541', { weight: 12 }),
      circle(760, 140, 280, '#5bc0be'), icon('zap', 830, 210, 140, '#0b132b'),
      kicker(70, 80, 640, '#5bc0be', 'CONF · 2027 · CIUDAD DE MÉXICO'),
      text(64, 420, 760, 190, '#ffffff', 'FUTURO\nABIERTO', { font: 'Bebas Neue', lineHeight: 0.88 }),
      box(70, 780, 940, 3, '#5bc0be', { opacity: 0.6 }),
      ...[['09:00', 'Apertura y bienvenida', 'Comité organizador'], ['10:30', 'Datos que cuentan historias', 'Ana Torres'], ['13:00', 'Construir en comunidad', 'Panel abierto'], ['16:00', 'Cierre y networking', 'Terraza norte']]
        .flatMap(([time, title, who], index) => [
          text(70, 820 + index * 100, 160, 26, '#ffd166', time, { font: 'Space Mono' }),
          text(250, 812 + index * 100, 760, 30, '#ffffff', title, { variant: 'medium' }),
          text(250, 854 + index * 100, 760, 18, '#8fa3c4', who),
          box(70, 906 + index * 100, 940, 1, '#ffffff', { opacity: 0.15 })]),
      ...chip(70, 1240, 340, 64, '#ffd166', 'REGISTRO GRATUITO', '#0b132b'),
    ] },
  { key: 'tips-cover', name: 'Portada de consejos', category: 'Redes sociales', description: 'Primera lámina de carrusel: número gigante, ondas y puntos.',
    width: 1080, height: 1350, background: '#2d1b69', objects: [
      ...waves(0, 0, 1080, 380, 5, '#4527a0', { weight: 5 }), ...waves(0, 980, 1080, 370, 5, '#4527a0', { weight: 5, cycles: 2 }),
      kicker(80, 70, 700, '#ffd23f', '@TUMARCA · GUÍA RÁPIDA'),
      text(70, 330, 420, 500, '#ffd23f', '5', { font: 'Bebas Neue', lineHeight: 1 }),
      text(500, 440, 520, 88, '#ffffff', 'consejos\npara\nahorrar', { variant: 'semibold', lineHeight: 1.05 }),
      ...chip(500, 830, 290, 68, '#ffd23f', 'DESLIZA', '#2d1b69'), icon('arrow-up-right', 810, 840, 48, '#ffd23f'),
      ...dotGrid(80, 1120, 8, 3, 36, 9, '#ffd23f', 0.6),
    ] },
  { key: 'quote-card', name: 'Cita destacada', category: 'Redes sociales', description: 'Frase grande sobre papel cálido con doble marco y puntos de acento.',
    width: 1080, height: 1080, background: '#f4efe6', objects: [
      ...blob(640, 640, 520, '#e9dcc6'), ...dotGrid(800, 110, 5, 5, 30, 7, '#c1440e', 0.5),
      ...doubleFrame(60, 60, 960, 960, '#1f1a17', { gap: 12 }),
      text(110, 90, 300, 260, '#c1440e', '“', { font: 'Playfair Display', lineHeight: 1 }),
      text(120, 340, 840, 74, '#1f1a17', 'La creatividad es\ninteligencia\ndivirtiéndose.', { font: 'Playfair Display', variant: 'semibold', lineHeight: 1.1 }),
      ...rule(120, 740, 220, '#c1440e'),
      text(120, 790, 700, 28, '#1f1a17', 'Nombre Apellido', { variant: 'semibold' }),
      text(120, 836, 700, 18, '#6b5b4e', 'CARGO O FUENTE', { font: 'Space Mono', spacing: 80 }),
    ] },
  { key: 'course-cover', name: 'Portada de curso', category: 'Educación', description: 'Diapositiva 16:9 para curso en línea: rayos, disco con destello y temario en etiquetas.',
    width: 1920, height: 1080, background: '#0f172a', objects: [
      ...sunburst(1500, 540, 760, 40, '#1e293b', { weight: 8 }), circle(1200, 240, 600, '#1e293b'), circle(1320, 360, 360, '#38bdf8'), icon('sparkle', 1400, 440, 200, '#0f172a'),
      ...stripes(120, 880, 300, 60, 4, '#f472b6', 0.8),
      kicker(120, 120, 800, '#38bdf8', 'CURSO EN LÍNEA · 8 SEMANAS'),
      text(114, 180, 1000, 140, '#ffffff', 'Diseño que\nvende', { font: 'Playfair Display', variant: 'semibold', lineHeight: 0.95 }),
      text(120, 520, 800, 30, '#cbd5e1', 'Aprende a crear piezas claras,\nbonitas y listas para publicar.', { font: 'Lora', variant: 'italic', lineHeight: 1.3 }),
      ...['M1 · BASES', 'M2 · COLOR', 'M3 · MARCA'].flatMap((label, index) => chip(120 + index * 260, 700, 240, 64, index === 0 ? '#38bdf8' : '#1e293b', label, index === 0 ? '#0f172a' : '#e2e8f0')),
      text(520, 900, 700, 24, '#94a3b8', 'Con tu nombre aquí · Inicia el 3 de marzo'),
    ] },
  { key: 'weekly-schedule', name: 'Horario semanal', category: 'Educación', description: 'Horario de clases por día con bloques de color y encabezado con ondas.',
    width: 1080, height: 1350, background: '#fffaf0', objects: [
      box(0, 0, 1080, 260, '#22333b'), ...waves(0, 170, 1080, 90, 2, '#34505c', { weight: 5 }),
      kicker(70, 62, 800, '#e9c46a', 'SEMESTRE 2027 · GRUPO B'),
      text(64, 100, 900, 92, '#fffaf0', 'Mi horario', { font: 'Playfair Display', variant: 'semibold', lineHeight: 1 }),
      ...[['LUN', 'Matemáticas', '08:00 – 10:00', '#2a9d8f', '#ffffff'], ['MAR', 'Laboratorio', '10:00 – 13:00', '#e9c46a', '#22333b'], ['MIÉ', 'Historia', '09:00 – 11:00', '#e76f51', '#ffffff'],
        ['JUE', 'Inglés', '12:00 – 14:00', '#8ab17d', '#22333b'], ['VIE', 'Taller creativo', '08:00 – 12:00', '#264653', '#ffffff']]
        .flatMap(([day, subject, time, fill, ink], index) => [
          text(70, 310 + index * 180, 160, 64, '#22333b', day, { font: 'Bebas Neue', lineHeight: 1 }),
          box(250, 300 + index * 180, 760, 140, fill, { radius: 24 }),
          text(290, 336 + index * 180, 680, 36, ink, subject, { variant: 'semibold' }),
          text(290, 388 + index * 180, 680, 20, ink, time, { font: 'Space Mono', spacing: 40, opacity: 0.85 })]),
      text(70, 1250, 940, 20, '#6b7a80', 'Edita materias, horas y colores: cada bloque es un objeto independiente.', { font: 'Lora', variant: 'italic' }),
    ] },
]
