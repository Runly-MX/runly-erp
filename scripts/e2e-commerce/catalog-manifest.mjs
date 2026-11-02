// Synthetic commerce catalog for permanent E2E regressions. Every record is
// identified by PREFIX; nothing here names a real product or brand.
//
// pos: 'all'  -> sold wherever the outlet mode allows (default availability)
//      'none' -> disabled for POS everywhere
//      [..]   -> disabled by default and enabled only in those outlets (O.* keys)
// alloc: units assigned per outlet from the product's own stock pool (ledger
//        movements through the stock-allocations API; never raised twice).
export const PREFIX = 'E2E-COMMERCE'
export const SLUG_PREFIX = 'e2e-commerce'
export const EXPECTED_COMPANY_SLUG = 'runly-pruebas-e2e'

export const O = { T: 'tienda', R: 'restaurante', M: 'mixto' }

export const OUTLETS = [
  { key: O.T, name: `${PREFIX} Tienda`, mode: 'RETAIL', purpose: 'POS Tienda / Mostrador' },
  { key: O.R, name: `${PREFIX} Restaurante`, mode: 'RESTAURANT', kitchenKdsEnabled: true, purpose: 'POS Restaurante, Comandero y Cocina' },
  { key: O.M, name: `${PREFIX} Mixto`, mode: 'HYBRID', kitchenKdsEnabled: true, purpose: 'Mostrador y Mesas en una sucursal' },
]
export const TERMINALS = [
  { outlet: O.T, name: `${PREFIX} Caja Tienda` },
  { outlet: O.R, name: `${PREFIX} Caja Restaurante` },
  { outlet: O.M, name: `${PREFIX} Caja Mixta` },
]
export const STATIONS = [
  { key: 'cocina-r', outlet: O.R, name: `${PREFIX} Cocina`, code: 'e2e-cocina-r' },
  { key: 'barra-r', outlet: O.R, name: `${PREFIX} Barra`, code: 'e2e-barra-r' },
  { key: 'cocina-m', outlet: O.M, name: `${PREFIX} Cocina Mixto`, code: 'e2e-cocina-m' },
  { key: 'barra-m', outlet: O.M, name: `${PREFIX} Barra Mixto`, code: 'e2e-barra-m' },
]
export const PAYMENT_METHODS = [
  { name: `${PREFIX} Efectivo`, code: 'e2e-efectivo', kind: 'CASH', purpose: 'Efectivo con cambio' },
  { name: `${PREFIX} Tarjeta externa`, code: 'e2e-tarjeta', kind: 'CARD', requiresReference: true, purpose: 'Terminal bancaria externa, referencia capturada a mano (sin integración bancaria)' },
  { name: `${PREFIX} Transferencia`, code: 'e2e-transferencia', kind: 'TRANSFER', requiresReference: true, purpose: 'Transferencia con referencia' },
]
export const TABLES = [
  ...Array.from({ length: 6 }, (_, i) => ({ outlet: O.R, name: `${PREFIX} Mesa ${i + 1}`, capacity: i < 4 ? 4 : 6 })),
  ...Array.from({ length: 3 }, (_, i) => ({ outlet: O.M, name: `${PREFIX} Mesa M${i + 1}`, capacity: 4 })),
]

export const CATEGORIES = [
  ['bebidas', 'Bebidas'], ['abarrotes', 'Abarrotes'], ['accesorios', 'Accesorios'], ['electronica', 'Electrónica'], ['ropa', 'Ropa y calzado'],
  ['bebidas-preparadas', 'Bebidas preparadas'], ['entradas', 'Entradas'], ['principales', 'Platos principales'], ['postres', 'Postres'], ['solo-web', 'Solo web'],
].map(([key, label]) => ({ key, slug: `${SLUG_PREFIX}-${key}`, name: `${PREFIX} ${label}` }))

const RET = [O.T, O.M]
const FOOD = [O.R, O.M]
const mods = {
  leche: { name: 'Leche', min: 0, max: 1, options: [['Entera', 0], ['Deslactosada', 0], ['Avena', 8]] },
  salsa: { name: 'Salsa', required: true, min: 1, max: 1, options: [['BBQ', 0], ['Picante', 0], ['Limón y pimienta', 0]] },
  termino: { name: 'Término', required: true, min: 1, max: 1, options: [['Medio', 0], ['Tres cuartos', 0], ['Bien cocido', 0]] },
  extras: { name: 'Extras', min: 0, max: 2, options: [['Queso extra', 15], ['Tocino', 20]] },
  hielo: { name: 'Hielo', min: 0, max: 1, options: [['Sin hielo', 0], ['Poco hielo', 0]] },
}

// sku = `${PREFIX}-${code}`; barcode: synthetic 12-digit numbers in a private range (29990000xxxx).
export const PRODUCTS = [
  // ---- Tienda / mostrador ------------------------------------------------------------
  { code: 'BEB-AGUA', name: 'Agua natural 600 ml', cat: 'bebidas', price: 12, barcode: '299900000011', stock: 120, alloc: { [O.T]: 60, [O.M]: 30 }, pos: RET, purpose: 'Escaneo, existencias distintas por sucursal' },
  { code: 'BEB-REFR', name: 'Refresco de cola 355 ml', cat: 'bebidas', price: 18, barcode: '299900000028', stock: 100, alloc: { [O.T]: 40, [O.M]: 20 }, pos: RET, purpose: 'Cantidades y venta repetida' },
  { code: 'BEB-JUGO', name: 'Jugo de naranja 500 ml', cat: 'bebidas', price: 25, barcode: '299900000035', stock: 40, alloc: { [O.T]: 6 }, pos: RET, purpose: 'Existencias bajas (aviso de pocas unidades)' },
  { code: 'BEB-MINERAL', name: 'Agua mineral 355 ml (agotada)', cat: 'bebidas', price: 20, barcode: '299900000042', stock: 0, alloc: {}, pos: RET, purpose: 'Producto agotado: no debe poder venderse' },
  { code: 'ABA-ARROZ', name: 'Arroz 1 kg', cat: 'abarrotes', price: 32, barcode: '299900000059', stock: 80, alloc: { [O.T]: 40, [O.M]: 20 }, pos: RET, tax: { rate: 0, included: true }, purpose: 'Impuesto propio de 0 %' },
  { code: 'ABA-FRIJOL', name: 'Frijol 900 g', cat: 'abarrotes', price: 38, barcode: '299900000066', stock: 60, alloc: { [O.T]: 30 }, pos: RET, purpose: 'Existencias solo en Tienda' },
  { code: 'ABA-ATUN', name: 'Atún en lata', cat: 'abarrotes', price: 28, barcode: '299900000073', pos: RET, purpose: 'Sin control de existencias, con código de barras' },
  { code: 'ABA-GALLETA', name: 'Galletas surtidas', cat: 'abarrotes', price: 22, barcode: '299900000080', stock: 50, alloc: { [O.T]: 25, [O.M]: 10 }, pos: RET, purpose: 'Devolución con reposición de existencias' },
  { code: 'ABA-ACEITE', name: 'Aceite vegetal 1 L', cat: 'abarrotes', price: 54, pos: RET, purpose: 'Producto sin código ni existencias' },
  { code: 'ACC-CABLE', name: 'Cable USB-C 1 m', cat: 'accesorios', price: 89, barcode: '299900000097', stock: 30, alloc: { [O.T]: 20 }, pos: [O.T], purpose: 'Solo disponible en Tienda' },
  { code: 'ACC-FUNDA', name: 'Funda genérica para teléfono', cat: 'accesorios', price: 129, pos: [O.T], purpose: 'Sin existencias controladas' },
  { code: 'ACC-CINTA', name: 'Cinta adhesiva', cat: 'accesorios', price: 18, barcode: '299900000103', pos: RET, purpose: 'Escaneo sin existencias' },
  { code: 'ELE-AUDIO', name: 'Audífonos básicos', cat: 'electronica', price: 249, barcode: '299900000110', stock: 25, alloc: { [O.T]: 15, [O.M]: 5 }, pos: RET, purpose: 'Existencias y precio medio' },
  { code: 'ELE-BATERIA', name: 'Batería externa 10 000 mAh', cat: 'electronica', price: 399, barcode: '299900000127', stock: 12, alloc: { [O.T]: 8 }, pos: [O.T], purpose: 'Precio alto, existencias limitadas' },
  { code: 'ELE-FOCO', name: 'Foco LED 9 W', cat: 'electronica', price: 45, barcode: '299900000134', stock: 80, alloc: { [O.T]: 40, [O.M]: 20 }, pos: RET, purpose: 'Venta por cantidad' },
  { code: 'ROP-CAMISETA', name: 'Camiseta básica', cat: 'ropa', price: 150, type: 'VARIABLE', pos: RET, purpose: 'Variable: talla CH hereda precio, M y G precio propio',
    option: { name: 'Talla', values: ['CH', 'M', 'G'] }, variants: [{ value: 'CH', sku: 'CH', price: null }, { value: 'M', sku: 'M', price: 160, barcode: '299900000141' }, { value: 'G', sku: 'G', price: 175 }] },
  { code: 'ROP-TENIS', name: 'Tenis deportivos', cat: 'ropa', price: 499, type: 'VARIABLE', pos: RET, purpose: 'Variable: número 27 con precio propio',
    option: { name: 'Número', values: ['25', '26', '27'] }, variants: [{ value: '25', sku: '25', price: null }, { value: '26', sku: '26', price: null }, { value: '27', sku: '27', price: 549 }] },
  { code: 'ROP-GORRA', name: 'Gorra talla única', cat: 'ropa', price: 110, stock: 20, alloc: { [O.T]: 10 }, pos: [O.T], purpose: 'Simple con existencias' },
  // ---- Restaurante -------------------------------------------------------------------------
  { code: 'RBE-CAFE', name: 'Café americano', cat: 'bebidas-preparadas', price: 35, pos: FOOD, prep: 'barra', modifiers: [mods.leche], purpose: 'Bebida preparada con modificador opcional' },
  { code: 'RBE-LIMONADA', name: 'Limonada', cat: 'bebidas-preparadas', price: 40, pos: FOOD, prep: 'barra', modifiers: [mods.hielo], purpose: 'Nota de preparación' },
  { code: 'RBE-CERVEZA', name: 'Cerveza artesanal genérica', cat: 'bebidas-preparadas', price: 55, stock: 60, alloc: { [O.R]: 30, [O.M]: 15 }, pos: FOOD, prep: false, purpose: 'Bebida con existencias, sin pasar por Cocina' },
  { code: 'ENT-GUACAMOLE', name: 'Guacamole con totopos', cat: 'entradas', price: 85, pos: FOOD, prep: 'cocina', purpose: 'Entrada simple' },
  { code: 'ENT-SOPA', name: 'Sopa del día', cat: 'entradas', price: 70, pos: FOOD, prep: 'cocina', purpose: 'Entrada con nota' },
  { code: 'ENT-ALITAS', name: 'Alitas 8 piezas', cat: 'entradas', price: 125, pos: FOOD, prep: 'cocina', modifiers: [mods.salsa], purpose: 'Modificador obligatorio' },
  { code: 'PRI-HAMBURGUESA', name: 'Hamburguesa clásica', cat: 'principales', price: 145, pos: FOOD, prep: 'cocina', modifiers: [mods.termino, mods.extras], purpose: 'Obligatorio + extras con precio' },
  { code: 'PRI-PASTA', name: 'Pasta alfredo', cat: 'principales', price: 138, pos: FOOD, prep: 'cocina', purpose: 'Plato principal' },
  { code: 'PRI-PLATILLO', name: 'Platillo del día', cat: 'principales', price: 120, pos: FOOD, prep: 'cocina', purpose: 'Envíos adicionales a Cocina' },
  { code: 'PRI-ENSALADA', name: 'Ensalada César', cat: 'principales', price: 110, pos: FOOD, prep: 'cocina', purpose: 'División de cuenta por partidas' },
  { code: 'POS-FLAN', name: 'Flan napolitano', cat: 'postres', price: 55, pos: FOOD, prep: false, purpose: 'Postre sin preparación' },
  { code: 'POS-PASTEL', name: 'Pastel de chocolate', cat: 'postres', price: 68, stock: 20, alloc: { [O.R]: 10, [O.M]: 5 }, pos: FOOD, prep: false, purpose: 'Postre con existencias por sucursal' },
  // ---- Casos técnicos ---------------------------------------------------------------------------
  { code: 'WEB-SOLO', name: 'Producto solo para la web', cat: 'solo-web', price: 199, published: true, pos: 'none', purpose: 'Publicado en Web y no disponible en POS' },
  { code: 'NOPOS-001', name: 'Producto no disponible en POS', cat: 'solo-web', price: 80, pos: 'none', purpose: 'No publicado ni disponible en POS' },
  { code: 'SRV-EMPAQUE', name: 'Servicio de empaque para regalo', cat: 'accesorios', price: 20, pos: RET, purpose: 'Servicio sin existencias' },
  { code: 'MIX-CAFEGRANO', name: 'Café en grano 250 g', cat: 'abarrotes', price: 120, barcode: '299900000158', stock: 40, alloc: { [O.T]: 20, [O.M]: 10, [O.R]: 10 }, pos: 'all', published: true, purpose: 'Se vende en las tres modalidades; publicado en Web' },
  { code: 'TAK-ENVASE', name: 'Envase para llevar', cat: 'principales', price: 5, pos: FOOD, prep: false, purpose: 'Complemento de pedidos para llevar' },
  { code: 'DIF-PILA', name: 'Pilas AA 4 piezas', cat: 'electronica', price: 45, barcode: '299900000165', stock: 100, alloc: { [O.T]: 60, [O.M]: 30, [O.R]: 0 }, pos: 'all', purpose: 'Existencias distintas por sucursal' },
].map((p) => ({ ...p, sku: `${PREFIX}-${p.code}`, slug: `${SLUG_PREFIX}-${p.code.toLowerCase()}`, fullName: `${PREFIX} ${p.name}`, tracked: Boolean(p.stock !== undefined), stock: p.stock ?? 0, alloc: p.alloc ?? {}, published: p.published ?? false }))

export function validateManifest() {
  const errors = []
  const sku = new Set(), bar = new Set()
  for (const p of PRODUCTS) {
    if (sku.has(p.sku)) errors.push(`SKU repetido ${p.sku}`)
    sku.add(p.sku)
    if (p.barcode) { if (bar.has(p.barcode)) errors.push(`Código repetido ${p.barcode}`); bar.add(p.barcode) }
    if (!CATEGORIES.some((c) => c.key === p.cat)) errors.push(`Categoría desconocida ${p.cat}`)
    const total = Object.values(p.alloc).reduce((n, q) => n + q, 0)
    if (total > p.stock) errors.push(`${p.sku}: asigna ${total} de ${p.stock}`)
    if (p.type === 'VARIABLE' && !p.variants?.length) errors.push(`${p.sku}: sin variantes`)
  }
  return errors
}
