// Infers a representative lucide icon for a form/detail field from its
// name and label (English keys, Spanish labels), so every input in the app
// shows what it holds without each screen choosing one. Shared by the
// blueprint renderer (field-icons.js) and the base field components
// (TextField, Combobox, ...), which use it when no `icon` prop is passed.
import {
  AlignLeft,
  Award,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Cake,
  CalendarDays,
  Car,
  CircleDot,
  Clock,
  Coins,
  Contact,
  CreditCard,
  DollarSign,
  FileSignature,
  FileText,
  Flag,
  FolderKanban,
  Globe,
  Hash,
  IdCard,
  Image,
  KeyRound,
  Landmark,
  Languages,
  LifeBuoy,
  Mail,
  Mailbox,
  MapPin,
  MapPinned,
  Network,
  Package,
  Palette,
  Percent,
  Phone,
  Receipt,
  Ruler,
  ScanBarcode,
  Share2,
  Tag,
  Tags,
  Truck,
  Type,
  UserRound,
  Users,
  Warehouse,
  Weight,
} from "lucide-react";

// Ordered most-specific first. Matched against space-separated lowercase
// tokens without accents (name "jobTitleId" -> "job title", label
// "Teléfono de emergencia" -> "telefono de emergencia").
const NAME_RULES = [
  [/\b(e ?mail|correo)\b/, Mail],
  [/\b(phone|telefono|celular|mobile|movil|whatsapp|tel)\b/, Phone],
  [/\b(password|contrasena|pin)\b/, KeyRound],
  [/\b(website|web|sitio|url|link|enlace)\b/, Globe],
  [/\b(rfc|curp|nss|tax id|taxid|imss|ine|passport|pasaporte|license|licencia)\b/, IdCard],
  [/\b(sku|barcode|codigo de barras|upc|ean)\b/, ScanBarcode],
  [/\b(code|codigo|folio|clave|reference|referencia|serial|serie|number|numero|plate|placa|placas|vin)\b/, Hash],
  [/\b(job title|puesto|position|cargo|occupation|ocupacion)\b/, BriefcaseBusiness],
  [/\b(department|departamento|area|team|equipo)\b/, Network],
  [/\b(emergency|emergencia)\b/, LifeBuoy],
  [/\b(birth|birthday|nacimiento|cumpleanos)\b/, Cake],
  [/\b(gender|genero|sexo)\b/, Users],
  [/\b(first name|last name|full name|middle name|apellido|apellidos|nombre completo|nombres)\b/, UserRound],
  [/\b(user|usuario|user profile|supervisor|manager|jefe|owner|responsable|assignee|assigned|asignado|employee|colaborador|empleado|seller|vendedor|driver|conductor|chofer)\b/, UserRound],
  [/\b(customer|cliente|contact|contacto|lead|prospecto)\b/, Contact],
  [/\b(company|empresa|razon social|business|negocio|organization|organizacion)\b/, Building2],
  [/\b(supplier|proveedor|vendor)\b/, Truck],
  [/\b(status|estatus|estado|stage|etapa|fase)\b/, CircleDot],
  [/\b(country|pais)\b/, Globe],
  [/\b(state|province|provincia|city|ciudad|municipality|municipio|colonia|neighborhood)\b/, MapPinned],
  [/\b(zip|postal|cp)\b/, Mailbox],
  [/\b(address|direccion|domicilio|street|calle|location|ubicacion|lugar|place|site|sede|sucursal|branch)\b/, MapPin],
  [/\b(warehouse|almacen|bodega)\b/, Warehouse],
  [/\b(vehicle|vehiculo|car|auto)\b/, Car],
  [/\b(contract|contrato)\b/, FileSignature],
  [/\b(bank|banco|clabe|account|cuenta)\b/, Landmark],
  [/\b(payment|pago|method|metodo|card|tarjeta)\b/, CreditCard],
  [/\b(invoice|factura|receipt|recibo|ticket)\b/, Receipt],
  [/\b(percent|percentage|porcentaje|discount|descuento|rate|tasa|iva|margin|margen)\b/, Percent],
  [/\b(currency|moneda|divisa)\b/, Coins],
  [/\b(price|precio|cost|costo|amount|monto|importe|total|subtotal|salary|salario|sueldo|budget|presupuesto|balance|saldo|value|valor)\b/, DollarSign],
  [/\b(quantity|cantidad|qty|stock|existencia|existencias|units|unidades)\b/, Boxes],
  [/\b(unit|unidad|uom|size|tamano|dimension|dimensions|dimensiones|length|largo|width|ancho|height|alto)\b/, Ruler],
  [/\b(weight|peso)\b/, Weight],
  [/\b(date|fecha|day|dia|at|deadline|vencimiento|due)\b/, CalendarDays],
  [/\b(time|hora|duration|duracion|shift|turno|timezone|horario|schedule)\b/, Clock],
  [/\b(brand|marca)\b/, Award],
  [/\b(model|modelo|product|producto|item|articulo)\b/, Package],
  [/\b(project|proyecto)\b/, FolderKanban],
  [/\b(priority|prioridad)\b/, Flag],
  [/\b(source|fuente|origin|origen|channel|canal|medio)\b/, Share2],
  [/\b(language|idioma|lenguaje)\b/, Languages],
  [/\b(color|colour)\b/, Palette],
  [/\b(image|imagen|photo|foto|logo|avatar|picture|cover|portada)\b/, Image],
  [/\b(file|archivo|document|documento|attachment|adjunto)\b/, FileText],
  [/\b(tags|etiquetas)\b/, Tags],
  [/\b(category|categoria|type|tipo|kind|class|clase|clasificacion|group|grupo|segment|segmento)\b/, Tag],
  [/\b(notes|notas|note|nota|description|descripcion|comment|comentario|comentarios|observaciones|observacion|details|detalles|summary|resumen|bio)\b/, AlignLeft],
  [/\b(name|nombre|title|titulo|label|etiqueta|alias)\b/, Type],
];

function toTokens(text) {
  if (typeof text !== "string" || !text.trim()) return "";
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(id|ids)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchRules(text) {
  if (!text) return null;
  for (const [pattern, icon] of NAME_RULES) {
    if (pattern.test(text)) return icon;
  }
  return null;
}

export function inferFieldIcon(field) {
  const name = field?.name ?? field?.key ?? field?.field;
  return matchRules(toTokens(name)) ?? matchRules(toTokens(field?.label));
}

// For base field components: an explicit `icon` (including `null`, the
// opt-out) wins; otherwise infer from name/label only for labeled fields —
// unlabeled inputs are inline/compact controls (table cells, toolbars).
export function autoFieldIcon(icon, { label, name, id } = {}, fallback = null) {
  if (icon !== undefined) return icon;
  if (typeof label !== "string" || !label.trim()) return null;
  return inferFieldIcon({ name: name ?? id, label }) ?? fallback;
}
