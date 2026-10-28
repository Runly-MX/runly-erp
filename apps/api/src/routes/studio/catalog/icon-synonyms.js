import { normalizeText } from './providers/common.js'

// Spanish -> English search terms for the Tabler/Lucide library, whose names and tags are English.
// Keys are accent-free singular words; English queries and the original names keep working untouched.
const RAW = {
  estrella: 'star', casa: 'home house', hogar: 'home', usuario: 'user', persona: 'user person', gente: 'users', flecha: 'arrow', calendario: 'calendar',
  telefono: 'phone', movil: 'phone smartphone', celular: 'phone smartphone', correo: 'mail email', email: 'mail', mensaje: 'message', carta: 'mail letter', 
  configuracion: 'settings', ajustes: 'settings', engranaje: 'settings gear', ajuste: 'settings adjustments', buscar: 'search', busqueda: 'search', lupa: 'search zoom',
  carpeta: 'folder', archivo: 'file', documento: 'file document', imagen: 'photo image', foto: 'photo camera', camara: 'camera', video: 'video', musica: 'music', sonido: 'volume sound',
  corazon: 'heart', favorito: 'heart star bookmark', reloj: 'clock watch', hora: 'clock time', tiempo: 'clock time', alarma: 'alarm bell', campana: 'bell', notificacion: 'bell notification',
  candado: 'lock', bloquear: 'lock', llave: 'key', seguridad: 'shield lock', escudo: 'shield', ojo: 'eye', ver: 'eye', ocultar: 'eye-off', mostrar: 'eye',
  borrar: 'trash delete', eliminar: 'trash delete', basura: 'trash', papelera: 'trash', editar: 'edit pencil', lapiz: 'pencil', copiar: 'copy', pegar: 'clipboard paste', guardar: 'device-floppy save',
  descargar: 'download', subir: 'upload', cargar: 'upload', compartir: 'share', enlace: 'link', vinculo: 'link', imprimir: 'printer', impresora: 'printer',
  menu: 'menu', inicio: 'home', atras: 'arrow-left back', adelante: 'arrow-right forward', arriba: 'arrow-up up', abajo: 'arrow-down down', izquierda: 'left', derecha: 'right',
  cerrar: 'x close', abrir: 'open', agregar: 'plus add', anadir: 'plus add', mas: 'plus', menos: 'minus', suma: 'plus', resta: 'minus', verificar: 'check', correcto: 'check', aceptar: 'check',
  error: 'alert-circle error', alerta: 'alert warning', advertencia: 'alert warning', peligro: 'alert danger', informacion: 'info', ayuda: 'help question', pregunta: 'question help',
  dinero: 'cash money coin', efectivo: 'cash', moneda: 'coin currency', tarjeta: 'credit-card card', banco: 'building-bank bank', pago: 'payment credit-card', factura: 'receipt invoice', recibo: 'receipt',
  carrito: 'shopping-cart cart', compra: 'shopping-cart shopping', tienda: 'store shop', comercio: 'store shop', bolsa: 'bag shopping-bag', regalo: 'gift', etiqueta: 'tag label', precio: 'tag price',
  grafica: 'chart graph', grafico: 'chart graph', estadistica: 'chart stats', barras: 'chart-bar', pastel: 'chart-pie cake', tabla: 'table', lista: 'list', cuadricula: 'grid layout',
  mapa: 'map', ubicacion: 'map-pin location pin', lugar: 'map-pin location', direccion: 'map-pin address', globo: 'world globe', mundo: 'world globe', planeta: 'world planet', internet: 'world wifi',
  coche: 'car', carro: 'car', auto: 'car', automovil: 'car', camion: 'truck', bicicleta: 'bike bicycle', avion: 'plane', tren: 'train', barco: 'ship boat', autobus: 'bus', moto: 'motorcycle',
  edificio: 'building', empresa: 'building briefcase', oficina: 'building briefcase', maletin: 'briefcase', trabajo: 'briefcase', escuela: 'school', hospital: 'hospital', medico: 'stethoscope medical',
  salud: 'heart-rate health', medicina: 'pill medicine', pastilla: 'pill', libro: 'book', cuaderno: 'notebook', nota: 'note notes', notas: 'notes', pizarron: 'presentation', graduacion: 'school graduation',
  comida: 'food meal', cafe: 'coffee', cerveza: 'beer', vino: 'wine glass', manzana: 'apple', pizza: 'pizza', cocina: 'chef-hat kitchen', cubiertos: 'tools-kitchen',
  sol: 'sun', luna: 'moon', nube: 'cloud', lluvia: 'rain cloud-rain', nieve: 'snow snowflake', rayo: 'bolt lightning', fuego: 'flame fire', agua: 'water droplet', gota: 'droplet', arbol: 'tree', planta: 'plant leaf', hoja: 'leaf', flor: 'flower',
  perro: 'dog', gato: 'cat', pajaro: 'bird', pez: 'fish', animal: 'paw', huella: 'paw',
  bateria: 'battery', enchufe: 'plug', energia: 'bolt power', luz: 'bulb light', bombilla: 'bulb', foco: 'bulb', idea: 'bulb idea', computadora: 'device-desktop computer', ordenador: 'device-desktop computer',
  laptop: 'device-laptop laptop', portatil: 'laptop', pantalla: 'screen device-desktop', teclado: 'keyboard', raton: 'mouse', auriculares: 'headphones', microfono: 'microphone', altavoz: 'speaker', bocina: 'speaker',
  wifi: 'wifi', bluetooth: 'bluetooth', servidor: 'server', datos: 'database', codigo: 'code', terminal: 'terminal', bug: 'bug', 
  equipo: 'users group team', grupo: 'users group', amigos: 'users friends', familia: 'users family', cliente: 'user customer', clientes: 'users', empleado: 'user badge', admin: 'user-shield shield', perfil: 'user profile',
  iniciar: 'login', entrar: 'login', salir: 'logout', sesion: 'login logout', cuenta: 'user account', contrasena: 'password lock key', clave: 'key password',
  filtro: 'filter', ordenar: 'sort', orden: 'sort', actualizar: 'refresh', recargar: 'refresh reload', repetir: 'repeat', deshacer: 'arrow-back-up undo', rehacer: 'redo',
  pin: 'pin', fijar: 'pin', chincheta: 'pin', bandera: 'flag', premio: 'award trophy', trofeo: 'trophy', medalla: 'medal', corona: 'crown', diamante: 'diamond', cohete: 'rocket',
  mano: 'hand', pulgar: 'thumb-up', dedo: 'finger', cara: 'face mood', sonrisa: 'mood-smile smile', feliz: 'mood-happy happy', triste: 'mood-sad sad',
  circulo: 'circle', cuadrado: 'square', triangulo: 'triangle', linea: 'line', punto: 'point dot', cruz: 'cross x plus', rombo: 'diamond',
  rojo: 'red', verde: 'green', azul: 'blue', color: 'color palette', paleta: 'palette', pincel: 'brush paint', pintura: 'paint brush', dibujo: 'pencil draw', disenar: 'design pencil', diseno: 'design',
  tijeras: 'scissors cut', cortar: 'scissors cut', herramienta: 'tool tools', herramientas: 'tools', martillo: 'hammer', construccion: 'tool building', reparar: 'tool wrench',
  paquete: 'package box', caja: 'box package', envio: 'truck package', inventario: 'packages box', almacen: 'building-warehouse warehouse', etiquetas: 'tags',
  idioma: 'language', traducir: 'language translate', texto: 'text', letra: 'letter-a text', fuente: 'typography font', negrita: 'bold', cursiva: 'italic', subrayado: 'underline', alinear: 'align',
  pelicula: 'movie', cine: 'movie', jugar: 'player-play play', reproducir: 'play', pausa: 'pause', detener: 'stop', siguiente: 'next skip-forward', anterior: 'previous skip-back',
}
const stem = word => word.length > 4 && word.endsWith('es') ? word.slice(0, -2) : word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word
const SYNONYMS = new Map(Object.entries(RAW).map(([word, english]) => [word, english.split(' ')]))
// Variants a user word may match: itself, its singular form and the English equivalents of either.
export const meaningfulWords = query => {
  const words = String(query ?? '').split(/\s+/).filter(Boolean), kept = words.filter(word => !STOPWORDS.has(normalizeText(word)))
  return kept.length ? kept : words
}
export function expandWord(word) {
  const base = normalizeText(word), singular = stem(base)
  return [...new Set([base, singular, ...(SYNONYMS.get(base) ?? []), ...(SYNONYMS.get(singular) ?? [])])]
}
// Keys that are also English words (menu, video, error...) do not make a query Spanish.
const STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'con', 'sin', 'del', 'por', 'en', 'al', 'y'])
const SPANISH = new Set([...STOPWORDS, 'mi', 'tu', 'su',
  ...[...SYNONYMS].filter(([word, english]) => !english.includes(word)).map(([word]) => word)])
// Lightweight language guess for providers that accept a lang parameter (Pixabay).
export function looksSpanish(query) {
  const text = String(query ?? '')
  if (/[áéíóúñü¿¡]/i.test(text)) return true
  return normalizeText(text).split(/\s+/).filter(Boolean).some(word => SPANISH.has(word) || SPANISH.has(stem(word)))
}
