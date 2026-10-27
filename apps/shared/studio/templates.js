import { appendObject, blankDocument, validateDocument } from './document.js'
import { iconSource } from './licenses.js'
import { PREMIUM_TEMPLATES } from './templates-premium.js'
import { ILLUSTRATED_TEMPLATES } from './templates-illustrated.js'
import { FAMILY_TEMPLATES } from './templates-families.js'
import { STYLE_TEMPLATES } from './templates-styles.js'

const rect = (x, y, width, height, fill) => ({ type: 'rectangle', x, y, width, height, fill })
const circle = (x, y, size, fill) => ({ type: 'ellipse', x, y, width: size, height: size, fill })
const text = (x, y, width, fontSize, fill, value) => ({ type: 'text', x, y, width, fontSize, fill, text: value,
  height: Math.ceil(value.split('\n').length * fontSize * 1.2) })

// Original starting points built only from the document primitives
// (rectangles, ellipses, text), so every element stays editable.
const DEFINITIONS = [
  { key: 'square', name: 'Lanzamiento', width: 1080, height: 1080, background: '#0f0a1f', objects: [
    circle(620, -160, 620, '#d946ef'), circle(-180, 640, 560, '#7c3aed'),
    rect(80, 80, 180, 52, '#ffffff'), text(104, 92, 140, 24, '#0f0a1f', 'NUEVO'),
    text(80, 300, 900, 104, '#ffffff', 'Lanza tu\nidea al mundo'),
    text(80, 580, 760, 36, '#e9d5ff', 'Una frase breve que invite a descubrir más.'),
    rect(80, 880, 320, 88, '#d946ef'), text(120, 902, 260, 36, '#ffffff', 'Descúbrelo'),
  ] },
  { key: 'poster', name: 'Encuentro creativo', width: 800, height: 1120, background: '#fdf4ff', objects: [
    rect(0, 0, 800, 560, '#1e1b4b'), circle(440, 120, 300, '#f472b6'), circle(520, 200, 300, '#a78bfa'),
    text(56, 150, 520, 80, '#ffffff', 'ENCUENTRO\nCREATIVO'), text(56, 420, 400, 32, '#f9a8d4', '14 · 16 NOV'),
    text(56, 620, 688, 36, '#1e1b4b', 'Charlas, talleres y música en vivo para quienes crean.'),
    rect(56, 900, 688, 4, '#d946ef'), text(56, 940, 688, 28, '#6b21a8', 'Centro Cultural · Entrada libre'),
  ] },
  { key: 'story', name: 'Oferta especial', width: 1080, height: 1920, background: '#111827', objects: [
    circle(-200, -200, 900, '#f97316'), circle(500, 1300, 900, '#db2777'),
    text(90, 620, 900, 140, '#ffffff', 'OFERTA\nESPECIAL'), text(90, 1000, 900, 220, '#fde68a', '-40%'),
    rect(90, 1560, 520, 110, '#ffffff'), text(140, 1588, 440, 44, '#111827', 'Compra ahora'),
  ] },
  { key: 'slides', name: 'Presentación', width: 1920, height: 1080, background: '#f8fafc', objects: [
    rect(0, 0, 760, 1080, '#4c1d95'), circle(420, 640, 600, '#d946ef'),
    text(880, 200, 900, 36, '#7c3aed', 'Q4 · 2026'), text(880, 280, 960, 110, '#0f172a', 'Título de tu\npresentación'),
    text(880, 600, 900, 40, '#475569', 'Subtítulo o nombre de quien presenta'),
  ] },
  { key: 'certificate', name: 'Reconocimiento', width: 1400, height: 1000, background: '#ffffff', objects: [
    rect(40, 40, 1320, 920, '#faf5ff'), rect(40, 40, 24, 920, '#7c3aed'),
    circle(1120, 700, 200, '#d946ef'), circle(1150, 730, 140, '#faf5ff'),
    text(160, 160, 1000, 36, '#7c3aed', 'RECONOCIMIENTO'), text(160, 300, 1080, 96, '#1e1b4b', 'Nombre de la persona'),
    text(160, 480, 900, 36, '#475569', 'Por su participación, compromiso y aporte al equipo.'),
    rect(160, 780, 420, 3, '#1e1b4b'), text(160, 800, 420, 24, '#64748b', 'Firma'),
  ] },
  { key: 'banner', name: 'Anuncio web', width: 1200, height: 630, background: '#ecfeff', objects: [
    circle(780, -120, 520, '#14b8a6'), circle(900, 300, 400, '#0ea5e9'),
    text(64, 180, 700, 72, '#134e4a', 'Tu marca, en grande'), text(64, 360, 640, 30, '#0f766e', 'Mensaje corto para tu sitio o redes.'),
    rect(64, 460, 260, 72, '#0f766e'), text(96, 476, 220, 30, '#ffffff', 'Saber más'),
  ] },
  { key:'quiet',name:'Un momento para ti',category:'Redes sociales',description:'Minimalismo cálido, espacio en blanco y un acento botánico.',width:1080,height:1080,background:'#f2eee5',objects:[
    rect(70,70,940,2,'#244b40'),text(72,95,800,24,'#244b40','BIENESTAR · PEQUEÑOS RITUALES'),circle(650,400,500,'#b9c6aa'),
    rect(720,220,2,520,'#244b40'),text(75,340,800,120,'#244b40','Respira.\nVuelve a ti.'),text(80,780,620,32,'#244b40','Una pausa también es avanzar.'),text(80,970,780,22,'#244b40','TU ESPACIO · TU RITMO'),
  ]},
  {key:'reading',name:'Página abierta',category:'Flyers',description:'Un cartel editorial asimétrico con una columna de información.',width:800,height:1120,background:'#f5f0e5',objects:[
    rect(540,0,260,1120,'#e44734'),text(55,65,450,25,'#262321','CLUB DE LECTURA · EDICIÓN 01'),rect(55,180,80,10,'#262321'),
    text(55,260,470,104,'#262321','UNA\nPÁGINA\nABIERTA'),text(55,760,410,30,'#262321','Historias que se encuentran.\nVen con un libro y una idea.'),
    text(590,80,160,64,'#f5f0e5','24'),text(580,160,180,24,'#f5f0e5','NOVIEMBRE'),rect(580,260,170,2,'#f5f0e5'),text(580,820,170,24,'#f5f0e5','18:00 H\nSALA UNO\nENTRADA LIBRE'),
  ]},
  {key:'invitation',name:'Una noche especial',category:'Invitaciones',description:'Invitación elegante con marco doble, colores vino y crema.',width:1050,height:1485,background:'#f4e9d5',objects:[
    rect(45,45,960,1395,'#722f43'),rect(49,49,952,1387,'#f4e9d5'),rect(65,65,920,1355,'#722f43'),rect(68,68,914,1349,'#f4e9d5'),
    circle(450,165,150,'#722f43'),text(165,400,740,40,'#722f43','ESTÁS INVITADO A COMPARTIR'),text(135,540,800,104,'#722f43','Una noche\nespecial'),
    rect(380,920,290,2,'#722f43'),text(190,990,700,38,'#722f43','SÁBADO · 19:30 H'),text(190,1100,700,30,'#722f43','Jardín del encuentro\nConfirma tu asistencia con nosotros'),
  ]},
  {key:'studio-card',name:'Estudio Norte',category:'Tarjetas',description:'Tarjeta sobria con composición horizontal y tipografía protagonista.',width:1050,height:600,background:'#171c24',objects:[
    rect(55,60,8,480,'#d5b96c'),text(100,90,800,28,'#d5b96c','DISEÑO · ESTRATEGIA · IDEAS'),text(95,200,850,94,'#f8f5eb','ESTUDIO NORTE'),
    rect(100,380,850,2,'#788393'),text(100,440,480,26,'#f8f5eb','Tu nombre\nDirección creativa'),text(670,440,330,24,'#d5b96c','Hablemos de tu proyecto'),
  ]},
  {key:'menu',name:'Mesa del día',category:'Menús',description:'Menú cálido, dos columnas editables y líneas finas de separación.',width:1050,height:1485,background:'#faf4e9',objects:[
    text(90,90,880,100,'#4c382b','MESA DEL DÍA'),text(95,230,800,28,'#95694a','COCINA DE TEMPORADA · HECHA CON CALMA'),rect(90,315,870,3,'#4c382b'),
    text(90,400,420,40,'#4c382b','PARA EMPEZAR'),text(90,480,400,32,'#4c382b','Ensalada del jardín\nCrema de verduras\nPan de la casa'),
    text(560,400,400,40,'#4c382b','PLATOS FUERTES'),text(560,480,400,32,'#4c382b','Pasta de temporada\nArroz con hongos\nVegetales al horno'),rect(90,830,870,2,'#b99979'),
    text(90,920,400,40,'#4c382b','ALGO DULCE'),text(90,1000,420,32,'#4c382b','Fruta fresca\nPastel del día'),text(560,920,400,40,'#4c382b','PARA ACOMPAÑAR'),text(560,1000,400,32,'#4c382b','Agua de la casa\nCafé de especialidad'),
    rect(90,1320,870,3,'#4c382b'),text(90,1360,860,24,'#95694a','Pregunta por los ingredientes y opciones de temporada.'),
  ]},
  {key:'market',name:'Mercado de fin de semana',category:'Promociones',description:'Una promoción alegre con bloques de precio y contraste amarillo/rojo.',width:1080,height:1080,background:'#ffe75a',objects:[
    rect(0,0,1080,100,'#b82d34'),text(70,25,940,34,'#fff8dd','SOLO ESTE FIN DE SEMANA'),text(70,160,940,112,'#b82d34','MERCADO\nDE IDEAS'),
    circle(680,490,340,'#b82d34'),text(720,570,280,98,'#fff8dd','2 × 1'),text(70,580,580,40,'#b82d34','Elige tus favoritos.\nComparte el descubrimiento.'),
    rect(70,920,940,5,'#b82d34'),text(70,960,940,28,'#b82d34','TU MARCA AQUÍ · Consulta condiciones en tienda'),
  ]},
  {key:'ideas',name:'Cinco ideas para crear',category:'Historias',description:'Historia juvenil numerada con formas y ritmo vertical.',width:1080,height:1920,background:'#dceefa',objects:[
    circle(-180,-120,700,'#ff805e'),text(90,90,900,32,'#17364b','GUARDA ESTA IDEA'),text(90,520,900,144,'#17364b','5 ideas\npara crear'),
    rect(90,950,900,130,'#ffffff'),text(120,980,840,38,'#17364b','01  Mira desde otro ángulo'),rect(90,1120,900,130,'#ffffff'),text(120,1150,840,38,'#17364b','02  Combina dos colores'),
    rect(90,1290,900,130,'#ffffff'),text(120,1320,840,38,'#17364b','03  Empieza con una forma'),text(90,1640,900,44,'#17364b','Las demás ideas las pones tú.'),
  ]},
  {key:'annual',name:'Un año en cifras',category:'Banners',description:'Banner empresarial con tres cifras destacadas y una franja editorial.',width:1920,height:1080,background:'#f0f4f8',objects:[
    rect(0,0,90,1080,'#12334c'),text(170,110,1500,34,'#40718f','REPORTE ANUAL · TU EMPRESA'),text(165,220,1600,108,'#12334c','Un año que\nnos mueve'),
    ...[0,1,2].flatMap((n)=>[rect(170+n*550,650,490,260,['#12334c','#27647e','#80aeb7'][n]),text(205+n*550,680,420,94,'#ffffff',['120','98%','24'][n]),text(205+n*550,810,410,30,'#ffffff',['Proyectos compartidos','Compromiso del equipo','Nuevas oportunidades'][n])]),
  ]},
  {key:'classic-certificate',name:'Logros que inspiran',category:'Certificados',description:'Reconocimiento clásico centrado con bandas doradas y amplio margen.',width:1600,height:1100,background:'#fffaf0',objects:[
    rect(0,0,1600,30,'#b99a4b'),rect(0,1070,1600,30,'#b99a4b'),rect(70,70,1460,960,'#b99a4b'),rect(73,73,1454,954,'#fffaf0'),
    text(200,170,1250,76,'#2d3f4b','LOGROS QUE INSPIRAN'),text(280,310,1100,30,'#8c753e','SE OTORGA EL PRESENTE RECONOCIMIENTO A'),text(220,420,1220,100,'#2d3f4b','Nombre de la persona'),
    text(240,620,1120,34,'#5f6260','Por transformar las ideas en acciones y compartir su talento.\nGracias por ser parte de este camino.'),rect(580,880,440,2,'#b99a4b'),text(590,920,440,24,'#8c753e','EQUIPO ORGANIZADOR'),
  ]},
  {key:'night-poster',name:'Frecuencia nocturna',category:'Carteles',description:'Cartel tipográfico en lima y negro con una composición diagonal.',width:800,height:1120,background:'#c9f348',objects:[
    text(50,55,700,24,'#182116','SONIDOS PARA ENCONTRARNOS'),rect(540,-100,90,800,'#182116'),circle(460,500,360,'#182116'),circle(540,580,200,'#c9f348'),
    text(40,240,710,116,'#182116','FRECUENCIA\nNOCTURNA'),rect(50,780,700,4,'#182116'),text(50,835,680,48,'#182116','SÁBADO · 20:00 H'),text(50,970,700,30,'#182116','MÚSICA EN VIVO · FORO ABIERTO'),
  ]},
  ...PREMIUM_TEMPLATES,
  ...ILLUSTRATED_TEMPLATES,
  ...FAMILY_TEMPLATES,
  ...STYLE_TEMPLATES,
]

export const STUDIO_TEMPLATES = Object.freeze(DEFINITIONS.map(({ key, name, width, height,category,description,objects }) => Object.freeze({ key, name, width, height,
  category:category??({square:'Redes sociales',poster:'Flyers',story:'Historias',slides:'Presentaciones',certificate:'Certificados',banner:'Banners'}[key]),
  description:description??'Composición original con texto y formas completamente editables.',version:1,creator:'Runly',source:'original',
  licenses:[...new Set(objects.flatMap(object=>object.type==='vector'?[iconSource(object.iconId)?.license].filter(Boolean):object.fontFamily&&object.fontFamily!=='sans-serif'?['OFL-1.1']:[]))],
})))

export function searchTemplates({ q='',category='all',page=1 }={}) {
  const fold=value=>String(value).toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu,'')
  const query=fold(String(q).trim().slice(0,80))
  const matches=STUDIO_TEMPLATES.filter(row=>(category==='all'||row.category===category)&&fold(`${row.name} ${row.category} ${row.description}`).includes(query))
  const index=Math.max(1,Math.min(1000,Number.parseInt(page,10)||1)),pageSize=12
  return {data:matches.slice((index-1)*pageSize,index*pageSize).map(row=>({...row,document:templateDocument(row.key)})),pagination:{page:index,pageSize,total:matches.length,totalPages:Math.max(1,Math.ceil(matches.length/pageSize))},categories:[...new Set(STUDIO_TEMPLATES.map(row=>row.category))]}
}

export function templateDocument(key) {
  const template = DEFINITIONS.find(item => item.key === key)
  if (!template) return blankDocument()
  const base = blankDocument(template.width, template.height)
  let doc = validateDocument({ ...base, page: { ...base.page, background: template.background } })
  for (const { type, ...object } of template.objects) doc = appendObject(doc, type, object)
  return doc
}
