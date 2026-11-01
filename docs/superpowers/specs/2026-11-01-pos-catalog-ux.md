# POS + Catálogo — especificación UX/UI

Fecha: 2026-11-01. Base inspeccionada: `1c0fda679`, rama `main`.
Estado: **diseño propuesto, pendiente de aprobación**. Ninguna pantalla se ha modificado en esta entrega.
Fuentes normativas: [auditoría y contratos C0–C8](./2026-11-01-pos-catalog-recovery-master.md) y [plan por etapas](../plans/2026-11-01-pos-catalog-recovery.md).

## 1. Alcance y reglas de esta especificación

Esta especificación define navegación, jerarquía, pantallas, componentes y flujos de Catálogo, POS Tienda, POS Restaurante y Administración. No crea contratos ni modelos: cada pantalla declara el contrato C0–C8 del que depende. Lo que el contrato no cubre aparece en §13 como discrepancia para Codex, y la interfaz no lo resuelve con cálculos locales ni con endpoints supuestos.

Reglas que la interfaz no rompe:

- Montos, impuestos, cambio, saldo, disponibilidad, stock, moneda y estado de impresión **vienen del servidor**. La UI sólo da formato. Mientras no llega la respuesta (o el replay), el estado mostrado es «Procesando», nunca «Cobrado».
- Cada intento lógico de escritura genera **una** `Idempotency-Key` al pulsar la acción; «Reintentar» reutiliza esa clave. Una edición del formulario crea un intento nuevo.
- Toda escritura de orden envía `expectedVersion`. Ante `ORDER_VERSION_CONFLICT`, la UI refresca la orden y pide confirmar de nuevo; no reenvía automáticamente.
- La selección de sucursal y terminal se guarda por usuario+empresa, se valida contra C0 al cargar y nunca se elige «la primera» de forma implícita (H13, H14).
- Las query keys de TanStack Query incluyen `companyId` y `outletId`.
- Las pantallas se conectan sólo cuando su contrato tiene evidencia de disponibilidad (plan §1). Antes de eso se pueden construir con fixtures detrás de un gate, sin reemplazar las rutas productivas.

Fuera de alcance: rediseñar Canvas o el Floor Planner, cambiar `@runly/ui` para corregir defectos monetarios, facturación fiscal/CFDI, procesamiento bancario, recetas/BOM y CRM.

## 2. Dirección visual

### 2.1 Dos superficies, una identidad

Runly ya tiene una identidad administrativa (PageHeader, SectionCard, RunlyTable, acento `--brand-primary`). El rediseño usa dos superficies con los mismos tokens:

| Superficie | Dónde | Carácter |
|---|---|---|
| **Gestión** | Catálogo, Administración POS, Órdenes, Cortes | Igual al resto de Runly: PageHeader, secciones, tablas, formularios con guardado explícito. Densidad normal. |
| **Operación** | Tienda, Comandero, Caja, Cocina | Pantalla completa dentro del shell, sin formularios administrativos, controles táctiles grandes, total y estado siempre visibles, cifras tabulares. La barra lateral de la app se colapsa automáticamente en estas rutas a partir de 768 px y se oculta en teléfono. |

La superficie de Operación no lleva PageHeader de gestión. Usa una **barra de operación** fija de 56 px (`PosOperationBar`, §4.2) con contexto (sucursal · terminal · sesión), estado de conexión y un menú de acciones de puesto. Así se cumple la regla «toda pantalla empieza con PageHeader» en espíritu: la barra es el encabezado de la superficie operativa y se documenta como su equivalente en `rme3-runtime-capabilities.md` cuando exista.

### 2.2 Tokens y lenguaje visual

- Color: sólo tokens vigentes (`--brand-primary`, `--brand-primary-foreground`, `hsl(var(--background|foreground|muted|muted-foreground|border|ring))`) y variantes de `Badge` (`success`, `warning`, `destructive`, `secondary`, `outline`). No se agregan colores fijos. El acento naranja se reserva para **la acción principal de cada pantalla** (Cobrar, Enviar a cocina, Guardar producto), nunca para decoración.
- Estado operativo con color + icono + texto, nunca color solo: Disponible / Agotado / No disponible en esta sucursal; Libre / Ocupada / Por cobrar / Reservada; Pendiente / En preparación / Lista / Entregada.
- Cifras: `font-variant-numeric: tabular-nums` (`tabular-nums` de Tailwind) en precios, totales, cantidades y temporizadores. Moneda siempre visible junto al total (`$1,250.00 MXN`).
- Forma: botones `rounded-xl` como `Button` actual; campos y controles `rounded-md` como máximo; filas seleccionadas con relleno plano, sin anillo, brillo ni píldora.
- Diálogos: tamaño `md` o mayor, `DialogHeader` con icono, cuerpo como children, pie fijo. Sólo se desplaza el cuerpo. En teléfono los diálogos usan `mobileVariant="sheet"`.
- Tema claro y oscuro con los mismos tokens. En Cocina, el modo oscuro es el predeterminado sugerido (pantallas montadas y luz de cocina), con preferencia por dispositivo.

### 2.3 Tamaños táctiles

`Button` hoy mide 36 px en escritorio (`h-9`). En la superficie de Operación todo objetivo mide **al menos 44 × 44 px**, y las acciones de venta 56 px:

| Elemento | Altura mínima |
|---|---|
| Botón de acción principal (Cobrar, Enviar, Confirmar pago) | 56 px, ancho completo del panel |
| Botones secundarios, chips de categoría, stepper de cantidad | 44 px |
| Tarjeta de producto | 96 px de alto, ≥ 120 px de ancho |
| Fila de carrito | 56 px |
| Teclado numérico de cobro | teclas de 64 px |

Esto se resuelve con un tamaño nuevo `size="touch"` en `Button` (§4.1), no con clases sueltas en cada pantalla.

## 3. Arquitectura de navegación

### 3.1 Experiencias por puesto

POS conserva sus rutas públicas actuales (`/app/m/runly.pos/pos/*`) y sus permisos de navegación. Las experiencias dependen de `capabilities` de C0 y del modo de la sucursal:

| Entrada de menú | Ruta actual | Modo de sucursal | Experiencia |
|---|---|---|---|
| Caja | `/pos/caja` | RETAIL | **Tienda** (venta rápida + cobro) |
| Caja | `/pos/caja` | RESTAURANT | **Caja restaurante** (cuentas abiertas + mostrador + cobro) |
| Caja | `/pos/caja` | HYBRID | Selector de experiencia en la barra: «Mostrador» / «Mesas»; misma sesión |
| Comandero | `/pos/comandero` | RESTAURANT, HYBRID | **Mesero** (mesas → pedido → envío) |
| Cocina | `/pos/cocina` | RESTAURANT, HYBRID | **KDS** |
| Órdenes | `/pos/orders` | todos | Historial, detalle, devolución, reimpresión |
| Administración | `/pos/admin` | todos | Ajustes agrupados (§10) |

Reglas:

- En una empresa sin sucursales RESTAURANT/HYBRID no se muestran Comandero ni Cocina en el menú, y Administración oculta los grupos de restaurante. Depende de D11 (modo por sucursal) para resolverse por sucursal; mientras tanto se usa el modo global legible.
- `PosHomeRedirect` envía al puesto principal según capacidades: `charge` → Caja; sólo `comandas` → Comandero; sólo cocina → Cocina; sólo admin → Administración.
- El Floor Planner sale del menú principal. Se abre desde Administración › Restaurante y cocina › «Plano del salón (opcional)», con permiso `pos.floor.manage` o `pos.admin.update`.

Catálogo conserva Productos, Categorías e Inventario. Inventario cambia de nombre visible a **«Existencias»** para no confundirse con `runly.inventory` (bienes físicos); la ruta se conserva.

### 3.2 Selección de contexto (C0)

Pantalla `PosContextGate`, previa a cualquier puesto operativo:

1. Carga `GET /pos/v2/context` con la selección guardada (usuario+empresa).
2. Si C0 devuelve `selectedOutletId`/`selectedTerminalId` válidos, entra directo.
3. Si no, muestra tarjetas grandes de sucursal (nombre, modo con icono) y después de terminal. Con una sola opción visible se muestra igual, preseleccionada, y requiere un toque de confirmación. Nunca entra sin una elección explícita.
4. 404 de la selección guardada: la borra, muestra `Alert` «La caja guardada ya no está disponible» y vuelve al paso 3.
5. Cambio de empresa: limpia selección, carrito local y caché antes de pedir C0 otra vez.

Sin terminales autorizadas: `EmptyState` «No tienes cajas asignadas» con el texto del permiso faltante y, si `pos.admin.read`, botón «Configurar cajas».

## 4. Inventario de componentes

### 4.1 `@runly/ui` existentes que se reutilizan

| Componente | Uso |
|---|---|
| `PageHeader`, `SectionCard`, `RunlyTable`/`DataTable`, `FilterToolbar`, `ActiveFilterChips`, `Pagination` | Superficie de Gestión (Catálogo, Órdenes, Administración, Cortes) |
| `EmptyState`, `ErrorState`, `NotFoundState`, `LoadingState`, `Skeleton` | Todos los estados vacíos, error, inexistente y carga |
| `Dialog`, `Sheet`, `PeekSheet`, `ConfirmDialog` | Cobro, variantes, modificadores, devoluciones, cierres; `PeekSheet` para el carrito en teléfono |
| `SearchInput`, `ChipTabs`, `SegmentedControl` | Búsqueda, categorías, lista/cuadrícula, experiencia HYBRID |
| `NumberStepper`, `NumberField` | Cantidades, fondo de caja, conteo |
| `TextField`, `TextareaField`, `SelectField`, `ComboboxField`, `CreatableComboboxField`, `CheckboxField`, `Switch` | Formularios de Gestión |
| `ChoiceCardGroup` | Selección de sucursal/terminal, tipo de producto, método de pago |
| `Badge`, `StatStrip`, `StatCard` | Estados operativos, resúmenes de sesión y catálogo |
| `SwipeableRow` | Acción rápida «Quitar» en carrito táctil (con alternativa visible, no sólo gesto) |
| `ProductImageManager` (Catálogo), `AttachmentsPanel`, `FileUploader` | Imágenes y archivos del producto |
| `Toast`, `OfflineIndicator`, `ConflictDialog` | Confirmaciones, conexión, conflicto de versión |
| `FormSaveBar`, `UnsavedChangesBar` | Guardado de ficha de producto y ajustes |
| `Tabs` | Secciones de ficha de producto y Administración |

### 4.2 Componentes nuevos

Genéricos (van a `@runly/ui`, se documentan en `rme3-runtime-capabilities.md`):

| Componente | Responsabilidad | Notas |
|---|---|---|
| `Button size="touch"` / `"touch-lg"` | 44 px / 56 px, texto `text-base` | Extensión de `buttonVariants`, sin componente nuevo |
| `ScanInput` + `useScanWedge` | Campo «Buscar o escanear»: distingue lector tipo teclado (ráfaga + Enter) de escritura humana; Enter en código exacto llama `onScan(code)`, escritura normal llama `onSearch(text)` con debounce | Extraer la lógica genérica de `runly.inventory/components/scan/ScanSearchField.jsx` y `lib/scan-kiosk.js`; inventario pasa a consumirla. Preserva ceros iniciales (C1). Fuente de datos por prop, sin acoplar a inventario. |
| `MoneyText` | Formato de importe string decimal + moneda, `tabular-nums`, tamaños | No convierte a Number para operar; sólo formatea |
| `NumericKeypad` | Teclado 3×4 táctil con atajos de billetes configurables | Emite string decimal; acepta teclado físico |
| `StatusPill` | Icono + texto + tono para estados operativos | Envoltorio de `Badge` con mapa de estados; evita colores sueltos |
| `ModeGate` | Renderiza hijos según `capabilities` / modo | Fuente única de visibilidad por capacidad |

Del módulo POS (`apps/desktop/src/modules/runly.pos/components/`), porque sólo POS los usa:

| Componente | Reemplaza / extiende | Contrato |
|---|---|---|
| `PosOperationBar` | Cabecera actual de `PosTerminalScreen` | C0, C8 |
| `PosContextGate` | Selector inline de sucursal/terminal de `PosTerminalScreen` | C0 |
| `SellableGrid` + `SellableCard` | `ProductGrid.jsx` | C1 (paginado, búsqueda, categorías, disponibilidad) |
| `VariantPickerSheet` | Nuevo | C1 variantes |
| `CartPanel` + `CartLine` | `OrderPanel.jsx` (parte Tienda) | C2 |
| `ChargeSheet` | `PaymentDialog.jsx` | C3 |
| `SaleCompleteView` | Toast «Recibo reenviado» | C3, C7 |
| `ReceiptPreview` + `PrintStatus` | Nuevo | C7 |
| `RefundSheet` | Nuevo | C4 |
| `SessionOpenSheet` / `SessionCloseSheet` / `CashMovementSheet` | `SessionOpenDialog`, `SessionCloseDialog`, `CashMovementDialog` | C8 |
| `TableBoard` (lista/cuadrícula) | `TableMap.jsx` como vista principal | C6 |
| `TicketComposer` | `ComandaScreen.jsx` | C2, C6 |
| `SeatSplitSheet` | `SplitBillDialog.jsx` | C3 allocations, C6 seat-totals |
| `KitchenTicketCard` / `KitchenBoard` | `KitchenStationBoard.jsx` | C6 |

Del módulo Catálogo:

| Componente | Reemplaza / extiende | Contrato |
|---|---|---|
| `ProductQuickCreateSheet` | Alta actual en pantalla de lista | `/catalog/products` actual |
| `VariantGrid` | `VariantMatrix.jsx` (tabla HTML, H28) | `/catalog/.../variants` actual; usa `DataTable` |
| `OutletAvailabilityPanel` | Nuevo | C1 admin `pos-availability` (D10) |
| `CommercialTaxField` | Nuevo | C1 admin `commercial-tax` |
| `StockBalancesPanel` + `StockAllocationSheet` | Sección «Inventario» + `StockMovementModal` | C5 |

Se retiran al conectar cada etapa, no antes: `PaymentDialog` (envía recibido como amount, H02), los selects inline de contexto, la etiqueta «Mesa completa» en Tienda y la tabla HTML de variantes.

## 5. Experiencia A — Catálogo

Superficie de Gestión. El objetivo es que un negocio pequeño dé de alta un producto vendible en menos de un minuto, y que los campos avanzados existan sin estorbar.

### 5.1 Esenciales y avanzados

| Esencial (siempre visible) | Avanzado (sección plegada o pestaña) |
|---|---|
| Nombre, precio, categoría, imagen principal, activo | SKU, código de barras, costo, peso/dimensiones |
| Disponible en POS (con resumen por sucursal) | Variantes y opciones |
| Impuesto (heredado de POS, editable) | Control de existencias y movimientos |
| | Publicación web: slug, SEO, vista previa, galería |
| | Atributos personalizados |
| | Preparación, estación y modificadores (sólo si hay restaurante) |

Las secciones avanzadas aparecen plegadas con un resumen en una línea («Sin variantes», «Existencias no controladas», «No publicado en web») y se abren con un toque. Una sección queda abierta por defecto si tiene datos.

### 5.2 Listado de productos (`CatalogProductsScreen`)

- `PageHeader` «Productos» con acción principal «Nuevo producto» y secundaria «Importar» si existe hoy.
- `SearchInput` busca por nombre, SKU y código de barras (D03). `ScanInput` en el mismo campo permite escanear para abrir la ficha.
- Filtros (`FilterToolbar` + `ActiveFilterChips`): categoría (`categoryId`, H05), estado (activo/inactivo), venta POS (disponible / no disponible en sucursal X, D03), web (publicado / no publicado), existencias (agotado / bajo / sin control).
- Vista tabla (escritorio) y tarjetas (teléfono/tableta vertical) con `ViewModeSwitch`. Columnas: imagen, nombre + SKU, categoría, precio con moneda, `StatusPill` POS, `StatusPill` web, existencias (o «Sin control»).
- Paginación real del servidor; el total visible es el `total` de la respuesta.
- Estados: `EmptyState` sin productos con CTA «Crear el primero»; `EmptyState` de búsqueda sin resultados con «Limpiar filtros»; `ErrorState` con reintento.

### 5.3 Alta rápida (`ProductQuickCreateSheet`)

`Sheet` lateral (escritorio) o `sheet` inferior (teléfono). Campos: nombre, precio, categoría (`CreatableComboboxField`, «Buscar o crear...»), foto opcional (cámara o archivo), interruptor «Vender en POS» (todas las sucursales por defecto, D10). Acciones: «Guardar» y «Guardar y abrir ficha». La moneda se muestra en el campo de precio y viene de la configuración comercial (H12); si la moneda de Catálogo y la de POS difieren, el sheet muestra `Alert` de advertencia y no permite activar POS hasta resolverlo en Administración (depende de C1/H12).

Stock inicial no aparece en alta rápida. Se registra después desde Existencias como ajuste auditado (C5).

### 5.4 Ficha de producto (`CatalogProductDetailScreen`)

`DetailHero` con imagen, nombre, precio, `StatusPill` POS y web, y `DetailActionBar` (Guardar, Duplicar, Desactivar con `ConfirmDialog`). Pestañas (`Tabs`), en este orden:

1. **General**: información básica, imagen, categoría, precio, impuesto (`CommercialTaxField`: «16 % incluido en el precio», heredado o propio).
2. **Venta**: `OutletAvailabilityPanel` (lista de sucursales con `Switch` y estado heredado «Sigue la configuración general»), identificadores (SKU, códigos de barras), y, si hay restaurante, preparación/estación/modificadores con los paneles existentes (`ProductStationsPanel`, modificadores).
3. **Variantes**: sólo si `productType = VARIABLE`, o botón «Convertir a producto con variantes» con el `ConfirmDialog` actual. Opciones con `VariantOptionsEditor` y combinaciones en `VariantGrid`.
4. **Existencias**: sólo si el control está activo; si no, `EmptyState` «No se controlan existencias» + `Switch` para activarlo.
5. **Web**: publicado, slug, SEO, vista previa en Google, galería. Separado explícitamente de Venta con el texto «Publicar en el sitio web no afecta la venta en POS».

El cuerpo actual de 863 líneas se divide por pestaña (un archivo por pestaña) para cumplir el límite de tamaño.

### 5.5 Variantes (`VariantGrid`)

`DataTable` con una fila por combinación: valores de opción, SKU, código de barras, precio (vacío = hereda del producto), activo, existencias (si control). Edición en línea con `TextField`/`NumberField` y guardado por fila. En teléfono, cada combinación es una tarjeta que abre un `Sheet` de edición. Acciones masivas: «Aplicar precio a seleccionadas», «Activar/Desactivar». La disponibilidad por sucursal se hereda del producto en v1 (C1); la UI lo dice en la cabecera de la tabla en lugar de ofrecer un interruptor por variante.

### 5.6 Categorías (`CatalogCategoriesScreen`)

Se mantiene la pantalla actual con portada (`CategoryCoverUploader`). Cambios: orden manual con `SortableList` (el orden se ve también en los chips de POS, si el contrato lo admite, D21), contador de productos por categoría y `ConfirmDialog` al desactivar una categoría con productos.

### 5.7 Existencias y movimientos

`StockBalancesPanel` (C5) en la pestaña Existencias y en la pantalla Existencias:

- Tabla por sucursal + fila destacada **«Sin asignar (saldo anterior)»** para `LEGACY_UNALLOCATED`. Si esa fila tiene saldo, `Alert` accionable «Asigna estas unidades a una sucursal para venderlas en POS» con botón «Asignar» → `StockAllocationSheet` (sucursal, cantidad entera, motivo obligatorio).
- «Ajustar existencias» → sheet con sucursal, tipo (entrada/salida/ajuste), cantidad entera, motivo obligatorio. Sustituye el PATCH directo de stock (H25).
- Movimientos: `DataTable` con fecha, sucursal, tipo, origen (Venta POS #folio / Devolución / Ajuste manual / Asignación), cantidad con signo, actor. El origen enlaza a la orden si el usuario puede verla (D17).
- Pantalla Existencias (lista global): filtros por sucursal, agotados, bajo umbral, sin asignar; tarjetas `StatStrip` arriba (artículos controlados, agotados, unidades sin asignar).

### 5.8 Estados de Catálogo que la UI debe representar

| Situación | Representación |
|---|---|
| Producto activo, no publicado, vendible en POS | `StatusPill` POS «Disponible» + web «No publicado». Caso normal, sin advertencias. |
| Publicado pero no disponible en la sucursal | POS «No disponible en Centro» |
| Moneda distinta a la de POS | `Alert` warning en ficha; POS «Bloqueado: moneda distinta» |
| Stock controlado con todo el saldo sin asignar | Existencias «Sin asignar»; POS «No vendible hasta asignar» |
| Producto VARIABLE sin variantes activas | POS «Sin combinaciones activas» |

## 6. Experiencia B — POS Tienda

Superficie de Operación. Recorrido: abrir caja → buscar/escanear → (variante) → ajustar cantidad → cobrar → ticket → siguiente venta. Sin mesas, comensales, cocina ni planos.

### 6.1 Layout por tamaño

Horizontal ≥ 1024 px (tableta horizontal, terminal, escritorio):

```
+----------------------------------------------------------------------+
| Centro · Caja 1 · Sesión abierta 09:02      [en línea]   [Menú ...]  |  PosOperationBar
+---------------------------------------------+------------------------+
| [ Buscar o escanear ......................] |  Venta actual      (3) |
| [Todos][Bebidas][Panadería][Abarrotes] ...  |  Café americano  M     |
|                                             |   [-] 2 [+]   $90.00   |
|  +--------+ +--------+ +--------+ +------+  |  Pan dulce             |
|  | img    | | img    | | img    | | img  |  |   [-] 1 [+]   $18.00   |
|  | Café   | | Té     | | Pan    | | ...  |  |                        |
|  | $45.00 | | $38.00 | | $18.00 | |      |  |  Subtotal     $108.00  |
|  +--------+ +--------+ +--------+ +------+  |  IVA incluido  $14.90  |
|  ...                                        |  Total   $108.00 MXN   |
|                     [ Cargar más ]          |  [ Suspender ][Vaciar] |
|                                             |  [   COBRAR $108.00  ] |
+---------------------------------------------+------------------------+
```

- Catálogo ~62 %, carrito ~38 % (mín. 360 px). Carrito fijo; sólo su lista se desplaza; total y Cobrar siempre visibles.
- Vertical 768 × 1024: catálogo arriba, carrito como `PeekSheet` inferior con la franja «3 artículos · $108.00 MXN · Cobrar».
- Teléfono 390 × 844: mismo patrón con `PeekSheet`; la cuadrícula pasa a 2 columnas; la barra de operación se compacta (sucursal/terminal en el menú). Uso secundario: la prioridad son tabletas horizontales y terminales.

### 6.2 Búsqueda, categorías y escaneo

- El foco inicial y el foco tras cada venta van a `ScanInput`. Un lector tipo teclado funciona sin tocar la pantalla: el campo captura la ráfaga aunque el foco esté en el catálogo, salvo si un diálogo de captura numérica está abierto.
- Escaneo → `GET /pos/v2/scan`:
  - Una coincidencia disponible: se agrega (o suma 1 si ya está en la venta), con retroalimentación visual corta en la línea y sonido opcional.
  - Coincidencia no disponible: `Toast` destructivo con `unavailableReason` en español; no se agrega.
  - `ambiguous: true`: `Sheet` «Este código corresponde a varios productos» con la lista; el cajero elige; nada se agrega solo.
  - Sin coincidencias: `Toast` «Código 0750… no encontrado» con acción «Buscar por nombre».
- Escritura humana → `GET /pos/v2/sellables?search=` con debounce, conservando categoría activa.
- Categorías: `ChipTabs` horizontales desplazables desde `GET /pos/v2/categories`; «Todos» es la primera.
- Paginación: «Cargar más» al final (y carga automática al acercarse, con el botón como alternativa accesible). Nunca se presenta un lote parcial como «todos» (H08).

### 6.3 Tarjeta de producto

Imagen (o inicial sobre fondo neutro), nombre (2 líneas máx.), precio con moneda. Variable: «Desde $45.00» y un icono de opciones. No disponible: tarjeta atenuada con `StatusPill` y motivo, no tocable para agregar; tocarla muestra el motivo. Stock bajo (si `trackStock`): «Quedan 3». Sin hover para operar: el toque agrega, una pulsación larga o botón de detalle (⋯ visible) abre información.

### 6.4 Variantes (`VariantPickerSheet`)

Toque en producto VARIABLE → sheet con grupos de opción como `SegmentedControl`/chips grandes (Tamaño: Chico · Mediano · Grande). Las combinaciones no disponibles se atenúan con motivo. Precio y disponibilidad de la combinación elegida vienen de `GET /pos/v2/sellables/:id/variants`. Acción «Agregar · $52.00» deshabilitada hasta completar la selección. Nunca se agrega el padre (H07).

### 6.5 Carrito (`CartPanel`)

- Línea: nombre, opciones de variante, `NumberStepper` táctil, importe de línea. Tocar la línea abre `LineEditSheet` simplificado: cantidad con `NumericKeypad`, nota, «Aplicar descuento» (sólo si `capabilities.discount`, C2), «Quitar».
- Cantidad entera para artículos con control de stock; decimal (hasta 3) sólo si no hay control (C5).
- Los totales mostrados son los de la última `OrderDTO`. Mientras una escritura está en curso, la línea muestra un indicador sutil y el total queda marcado «Actualizando»; el botón Cobrar se deshabilita hasta tener la versión vigente.
- Cuándo se crea la orden: al agregar la primera línea se crea la orden RETAIL (`POST /pos/v2/orders` con `experience: "RETAIL"`, `fulfillmentType: "TAKEAWAY"`) y cada cambio es un comando de línea con `expectedVersion`. No existe carrito local que se «sincronice» en lote (plan §5: nada de `Promise.all` de líneas).
- Vaciar venta: `ConfirmDialog`. Con pagos aplicados no se puede vaciar ni cancelar: la UI ofrece «Devolver anticipo» (C4, `REFUND_REQUIRED`).
- Suspender / reanudar: depende de D01. Mientras no haya contrato, el botón no aparece.

### 6.6 Cobro (`ChargeSheet`)

`Dialog` `lg` en tableta/escritorio, sheet a pantalla completa en teléfono. Pie fijo con la acción.

```
+-----------------------------------------------+
| (icono) Cobrar venta #A-1042           [ X ]  |
+-----------------------------------------------+
| Por cobrar               $108.00 MXN          |
|                                               |
| Método   [ Efectivo ] [ Tarjeta ] [ Transf. ] |
|                                               |
| Importe a aplicar        [  108.00  ]         |
| Efectivo recibido        [  200.00  ]         |
|  [$108][$150][$200][$500]   (exacto + billetes)|
|  +---+---+---+                                |
|  | 7 | 8 | 9 |   Cambio estimado   $92.00     |
|  | 4 | 5 | 6 |                                |
|  | 1 | 2 | 3 |                                |
|  | . | 0 | ⌫ |                                |
+-----------------------------------------------+
| [ Cancelar ]        [ CONFIRMAR PAGO $108.00 ]|
+-----------------------------------------------+
```

- «Importe a aplicar» se precarga con `remainingAmount` y sólo se reduce para pagos parciales. «Efectivo recibido» sólo existe en métodos CASH. Son dos controles distintos (H02, C3).
- «Cambio estimado» es una vista previa de formato; la cifra definitiva es `changeAmount` de la respuesta y es la que se muestra en la confirmación.
- Tarjeta/Transferencia: sin recibido ni cambio; campo «Referencia» obligatorio si el método lo exige. Texto fijo: «Registra un pago ya realizado en la terminal bancaria».
- Botones de billetes: exacto + denominaciones configurables por empresa (preferencia local en v1).
- Confirmar → estado «Procesando» que bloquea el diálogo (sin cerrar con fondo/Escape). Respuestas:
  - Éxito con orden pagada → `SaleCompleteView`.
  - Éxito parcial → vuelve al diálogo con nuevo «Por cobrar» y la lista de pagos aplicados.
  - Error de red o timeout → «No sabemos si el pago se registró» con «Reintentar» (misma clave, recupera el resultado si hubo commit). No hay botón que genere un intento nuevo con el mismo formulario.
  - `INSUFFICIENT_STOCK` → no se cobró; se muestra qué línea falla y se ofrece ajustar.
  - `ORDER_VERSION_CONFLICT` → refresca y pide confirmar con el total vigente.

### 6.7 Confirmación y ticket (`SaleCompleteView`)

Reemplaza el panel del carrito (no un toast): marca de éxito, total, método, **Cambio: $92.00** en tamaño grande si aplica, folio. Acciones: «Imprimir ticket», «Ver ticket», «Nueva venta» (acción principal, también con Enter). `PrintStatus` muestra el estado del job C7 con texto honesto: «Enviado a la impresora» (SUBMITTED), «No se pudo imprimir» (FAILED, con «Reintentar» y «Ver ticket»), nunca «Impreso» sin confirmación de hardware. Reimprimir desde Órdenes marca «Copia». Con impresión automática configurada, el job se crea al entrar a la vista y el estado se muestra igual.

`ReceiptPreview` renderiza el documento del recibo (D07) y permite imprimir con el diálogo del navegador o Bluetooth si el host tiene `bluetooth-print`.

### 6.8 Apertura y cierre de caja (C8)

- Sin sesión abierta: la superficie muestra `SessionOpenSheet` como estado principal (no modal sobre una venta): fondo inicial con `NumericKeypad`, notas, «Abrir caja». Sin `capabilities.openSession`: `EmptyState` «La caja está cerrada. Pide a un encargado que la abra».
- Menú de la barra: «Entrada de efectivo», «Salida de efectivo» (motivo obligatorio), «Cerrar caja».
- `SessionCloseSheet` en dos pasos: (1) conteo de efectivo con `NumericKeypad` sin mostrar el esperado (conteo ciego, preferencia configurable D22); (2) resumen con desglose del servidor (fondo, ventas en efectivo, entradas, salidas, entregas de meseros, devoluciones, esperado, contado, diferencia con `StatusPill`). «Confirmar cierre» con `ConfirmDialog`. La vista previa dice «Vista previa: aún no cerrada» hasta la respuesta.
- No se permite cerrar con una venta en curso en esa terminal: se pide completarla o vaciarla.

### 6.9 Devolución (C4)

Desde Órdenes › detalle de venta › «Devolver» (sólo `capabilities.refund`). `RefundSheet`:

1. Elegir líneas y cantidades (máximo vendido − devuelto) con `NumberStepper`; por línea, `Switch` «Regresar a existencias» (activo por defecto si hubo salida de stock; deshabilitado si `stockStatus` es `NOT_APPLIED`/`LEGACY_UNKNOWN`, con explicación).
2. Reparto a pagos originales: el servidor propone el importe; la UI muestra pago, método y máximo devolvible; referencia externa obligatoria para tarjeta/transferencia.
3. Motivo obligatorio, sesión destino (la abierta de la terminal; si no hay, se pide abrir caja).
4. Confirmar → recibo de devolución con el mismo `SaleCompleteView` adaptado («Devolución completada · Entregar $50.00 en efectivo»).

Anticipo en orden abierta: mismo sheet sin líneas, sólo importe hasta `netPaidAmount`.

## 7. Experiencia C — POS Restaurante

Cuatro puestos separados por permisos. Cobrar y preparar nunca comparten pantalla.

### 7.1 Mesero / Comandero (teléfono primero)

Flujo: sucursal (C0, explícita) → mesas → pedido → enviar a cocina → (cobrar sólo si `allowTableCharge` y turno propio).

**Mesas (`TableBoard`)** — `GET /pos/v2/tables`, sin requerir plano:

- `SegmentedControl` «Lista / Cuadrícula / Plano» (Plano sólo si existe salón con layout y el dispositivo es ≥ 768 px). La preferencia se recuerda por dispositivo.
- Filtros `ChipTabs`: Todas · Libres · Ocupadas · Mis mesas (D12) · Por cobrar.
- Tarjeta/fila de mesa: nombre grande, capacidad, `StatusPill`, y si está ocupada: comensales, tiempo abierta, total, mesero, indicador «Platillos listos» (D12).
- Botón flotante «Para llevar» crea una orden RESTAURANT sin mesa (TAKEAWAY/PICKUP).

```
Teléfono 390 px
+------------------------------+
| Centro ▾          [en línea] |
| [Todas][Libres][Mías][Cobrar]|
| (Lista)(Cuadrícula)          |
| +------+ +------+ +------+   |
| | M1   | | M2   | | M3   |   |
| | Libre| |4 · 38'| |Lista |   |
| |  4p  | |$640  | |$210  |   |
| +------+ +------+ +------+   |
| ...                          |
|               [+ Para llevar]|
+------------------------------+
```

**Pedido (`TicketComposer`)**:

- Cabecera: mesa, comensales (editable antes del primer envío), total con moneda.
- Pestañas en teléfono: «Menú» y «Pedido (n)». En tableta, dos columnas como Tienda.
- Menú: mismo `SellableGrid` con búsqueda y categorías (C1); `VariantPickerSheet` y `ModifierSheet` existentes para opciones y modificadores obligatorios.
- Asiento: `SeatChips` encima del pedido para asignar la línea al comensal activo (opcional; «Compartido» por defecto).
- Líneas en dos grupos visibles: **«Por enviar»** (editables) y **«Enviado a cocina»** (sólo lectura, con estado por línea del KDS). Una línea enviada no se edita: «Agregar otra» para extras; «Anular» con motivo sólo con `orders.cancel` y antes del primer pago (C6 void-preparation).
- Acción principal: «Enviar a cocina (n)» con sólo las líneas por enviar (C6 kitchen-dispatches). Respuesta con `skippedLineIds` sin estación: `Alert` «Se registraron sin ticket de cocina: entrégalas manualmente». `PREPARATION_STATION_REQUIRED`: error con enlace para administración.
- Secundarias en menú: «Cambiar de mesa», «Pedir cuenta» (marca por cobrar si el contrato lo soporta, D23), «Cobrar» (si capacidad).

### 7.2 Caja restaurante

Tableta horizontal o escritorio. Dos zonas:

- Izquierda: «Cuentas abiertas» (`GET /pos/v2/orders?status=OPEN`, D05) con mesa/para llevar, mesero, total, saldo, tiempo; filtro «Por cobrar». Pestaña «Mostrador» abre la experiencia de venta rápida RESTAURANT TAKEAWAY (mismo `SellableGrid` + `CartPanel`).
- Derecha: detalle de la cuenta seleccionada con líneas agrupadas por asiento, totales, pagos aplicados (generales y por asiento) y acciones «Cobrar todo», «Dividir», «Imprimir pre-cuenta» (D24).

**Dividir (`SeatSplitSheet`)** — C6 seat-totals + C3 allocations: tarjetas por asiento con total, pagado y saldo; «Cobrar asiento» abre `ChargeSheet` con `allocations` de sus líneas. Un asiento con saldo cero muestra «Pagado» y no ofrece cobrar. Pagos sin asignar aparecen como «Pago general» con «Asignar» (comando `payment-allocations`). No hay botones de «dividir en partes iguales» sin asignación de líneas.

Recepción de cortes de meseros: menú de la barra › «Turnos de meseros» (`WaiterShiftsPanel` actual adaptado a C8 waiter-shifts): lista de turnos abiertos con efectivo esperado, «Recibir» → importe entregado con `NumericKeypad`, diferencia visible, `ConfirmDialog`.

### 7.3 Cocina (KDS)

Pantalla montada en horizontal, también tableta. `GET /pos/v2/kitchen/tickets` con actualización en tiempo real y recuperación por polling (D06).

- Selector de estación en la barra (persistido por dispositivo), con «Todas».
- Columnas Pendiente · En preparación · Lista. Entregadas se ocultan tras unos segundos con «Ver entregadas».
- `KitchenTicketCard`: mesa o «Para llevar #12», mesero, minutos desde envío (con tonos de advertencia configurables), líneas con cantidad grande, opciones, modificadores y notas resaltadas. Un envío adicional de la misma orden llega como tarjeta propia marcada «Extra».
- Interacción: tocar una línea la avanza al siguiente estado; botón de tarjeta «Todo listo». Sin arrastrar como único método. Deshacer el último toque durante 5 s (D20).
- Línea anulada: tachada con motivo, sin acción.
- Sin conexión: banda superior «Sin conexión: los cambios no se están guardando» y los toques se bloquean (no hay cola offline en v1).

### 7.4 Administración de restaurante

En Administración › Restaurante y cocina (§10): mesas simples (crear/renombrar/capacidad sin plano, C6 `POST /pos/v2/tables`), estaciones, preparación por producto, modificadores, reservas, cobro en mesa (`allowTableCharge`) y, al final, «Plano del salón (opcional)» que abre el Floor Planner existente sin cambios.

## 8. Negocio mixto (HYBRID)

- Misma sucursal, misma sesión de caja, un solo saldo. La barra de Caja muestra `SegmentedControl` «Mostrador / Mesas». Mostrador crea órdenes `experience: RETAIL`; Mesas abre la Caja restaurante. La elección se recuerda por terminal en el dispositivo (D18).
- Comandero y Cocina aparecen como en Restaurante.
- Catálogo muestra preparación/estación en la pestaña Venta.
- Una orden nunca cambia de experiencia. Al cambiar de experiencia con una venta de mostrador en curso, la UI pide terminarla o vaciarla.

## 9. Flujos completos por tipo de negocio

### 9.1 Tienda (RETAIL)

1. Administración: crear sucursal (modo Tienda), terminal, métodos de pago, impuesto y moneda.
2. Catálogo: alta rápida de productos; activar control de existencias en los que lo requieran; asignar saldo «sin asignar» a la sucursal.
3. Cajero entra a Caja → `PosContextGate` → abre caja con fondo.
4. Escanea o busca → elige variante si aplica → ajusta cantidades → (descuento autorizado).
5. Cobrar → efectivo recibido → confirmación con cambio → ticket.
6. Nueva venta (foco de regreso al escáner).
7. Devolución desde Órdenes cuando aplique.
8. Entradas/salidas de efectivo durante el turno; cierre con conteo y resumen.

### 9.2 Restaurante (RESTAURANT)

1. Administración: sucursal (modo Restaurante), terminales, estaciones, mesas simples, modificadores, cobro en mesa sí/no.
2. Catálogo: productos con preparación y estación.
3. Caja abre sesión.
4. Mesero elige sucursal → mesa libre → comensales → toma pedido con modificadores y asientos → envía a cocina.
5. Cocina avanza líneas hasta Lista; el mesero ve «Platillos listos» y entrega.
6. Extras: nuevas líneas y nuevo envío; sólo el extra llega a cocina.
7. Cuenta: Caja cobra (todo o por asiento) o el mesero cobra en mesa si está permitido; ticket.
8. Fin de turno del mesero: Caja recibe la entrega; cierre de caja.

### 9.3 Mixto (HYBRID)

Pasos de restaurante más: en Caja, «Mostrador» para ventas rápidas sin mesa ni cocina (o con envío a cocina para preparados para llevar desde la experiencia restaurante), todo en la misma sesión y el mismo corte.

## 10. Experiencia D — Administración

`PosSettingsScreen` (837 líneas, pestañas General/Sucursales/Estaciones/Pagos/Modificadores) se reorganiza en una pantalla con índice lateral (`SectionIndex`) en escritorio y lista de grupos en teléfono. Un archivo por grupo.

| Grupo | Contenido | Visible |
|---|---|---|
| Negocio y sucursales | Sucursales con su modo (Tienda/Restaurante/Mixto, D11), datos, activas | Siempre |
| Dispositivos y cajas | Terminales por sucursal, impresora asignada, impresión automática, denominaciones rápidas | Siempre |
| Pagos e impuestos | Métodos de pago (referencia obligatoria), moneda (sólo lectura si hay ventas, H12), impuesto por defecto e «incluido en precio» | Siempre |
| Productos y disponibilidad | Resumen de productos no vendibles por sucursal, moneda distinta o saldo sin asignar, con enlaces a Catálogo | Siempre |
| Restaurante y cocina | Mesas simples, estaciones, preparación, modificadores, reservas, cobro en mesa, plano opcional | Sólo con al menos una sucursal RESTAURANT/HYBRID |
| Opciones avanzadas | Propinas (deshabilitado con «Aún no se calcula», C2), permisos de descuento/devolución (enlace a roles), conteo ciego | Siempre, plegado |

`PosSessionsScreen` y `PosOrdersScreen` quedan en Gestión: tablas con `PageHeader`, filtros por sucursal/estado/fecha, `NotFoundState` para registros inexistentes, y detalle de orden con pagos, devoluciones, recibos y su `PrintStatus`. Moneda histórica desconocida: `Alert` «Moneda no registrada: sólo consulta» y acciones monetarias deshabilitadas.

## 11. Estados transversales

### 11.1 Errores de contrato → mensaje y acción

| Código | Mensaje (es) | Acción en UI |
|---|---|---|
| `VALIDATION_ERROR` | `fieldErrors` en cada campo | Foco al primer campo con error |
| `FORBIDDEN` (403) | «No tienes permiso para esta acción» | Ocultar acción tras refrescar C0 |
| `NOT_FOUND` (404) | «Ya no existe o no pertenece a esta empresa» | `NotFoundState`; en contexto, volver a `PosContextGate` |
| `ORDER_VERSION_CONFLICT` | «La orden cambió en otro dispositivo» | Refrescar y pedir confirmar |
| `INSUFFICIENT_STOCK` | «No hay existencias suficientes de X» | Marcar línea, ofrecer ajustar |
| `CURRENCY_MISMATCH` | «Este producto usa otra moneda» | No agregar; enlace a ajustes si admin |
| `IDEMPOTENCY_CONFLICT` | «Este intento ya se usó con otros datos» | Descartar intento y empezar de nuevo |
| `IDEMPOTENCY_REQUIRED` (428) | Error interno de cliente | Reportar; nunca mostrar como fallo del cajero |
| `INVALID_TRANSITION` | «Esta acción ya no aplica al estado actual» | Refrescar |
| `REFUND_REQUIRED` | «Tiene pagos aplicados: devuelve el anticipo antes de cancelar» | Abrir `RefundSheet` en modo anticipo |
| `PREPARATION_STATION_REQUIRED` | «Falta estación de preparación para X» | Enlace a Administración |
| Red / timeout / 500 | «No sabemos si se guardó» | «Reintentar» con la misma clave |

El `requestId` se muestra en el detalle del error («Copiar código de soporte»), nunca en el mensaje principal.

### 11.2 Conexión

`OfflineIndicator` en la barra de operación. Sin conexión no se permite iniciar escrituras (no hay cola offline para dinero en v1): botones deshabilitados con el motivo. Al reconectar se refrescan C0, orden activa y tickets.

### 11.3 Carga

`Skeleton` con la forma final (tarjetas, filas); nunca spinners de página completa en Operación tras la primera carga.

## 12. Accesibilidad, teclado y lector

- Ninguna operación esencial depende de hover, gesto o arrastre. `SwipeableRow` y pulsación larga siempre tienen equivalente visible.
- Orden de foco: búsqueda → categorías → catálogo → carrito → Cobrar. Diálogos atrapan el foco y lo devuelven al disparador.
- Atajos en Tienda (escritorio/terminal): `/` o `F2` buscar, `F4` cobrar, `Enter` confirmar en diálogos, `Esc` cerrar (excepto con pago en proceso), `+`/`-` cantidad de la línea enfocada. Mostrados en el menú de la barra.
- Lector de códigos: modo teclado (HID) vía `useScanWedge`; cámara en teléfono vía la capacidad existente (`ScanCamera` de inventario extraído a `ScanInput`).
- Contraste AA en ambos temas; estados con texto e icono; `aria-live="polite"` para total y estado de cobro, `assertive` para errores de cobro.
- Objetivos ≥ 44 px y separación ≥ 8 px entre acciones destructivas y principales.

## 13. Discrepancias para Codex

Necesidades funcionales que C0–C8 no cubren. La UI no las implementa hasta que el contrato se amplíe o se descarten.

| ID | Necesidad | Contrato afectado | Propuesta mínima |
|---|---|---|---|
| D01 | Suspender y reanudar una venta de mostrador | C2 | Confirmar que una orden RETAIL OPEN puede quedar sin pagos y listarse: agregar filtros `terminalId` y `experience` a `GET /pos/v2/orders`. Sin esto, el botón «Suspender» no se muestra. |
| D03 | Búsqueda por SKU/código de barras y filtro por disponibilidad POS en el listado administrativo de Catálogo | `/catalog/products` actual, C1 | Igualar búsqueda del listado admin a C1 e incluir `barcode` en la proyección; filtro `posAvailable` + `outletId`. |
| D05 | Lista de cuentas abiertas legible en Caja | C2 lista | Agregar a la lista `tableName`, `waiterName`, `guestCount`, `openedAt` (sólo lectura). |
| D06 | Actualización en vivo de KDS, mesas y cuentas | C6 | Nombrar canal/evento realtime existente y payload mínimo (ID + version) para refetch por ID. |
| D07 | Vista previa de ticket en pantalla | C7 | Definir `payload` estructurado (encabezado, líneas, totales, pagos, cambio, folio, copia) además del formato de transporte para Bluetooth. |
| D10 | Ver la disponibilidad POS de todas las sucursales a la vez | C1 admin `pos-availability` | `GET` sin `outletId` devuelve baseline + lista de sucursales con `enabled` e `inherited`. Aclarar cómo se presenta el `availableInPos` por variante ya existente si v1 hereda del producto. |
| D11 | Modo Tienda/Restaurante/Mixto por sucursal editable | C0 (lectura existe) | Comando para actualizar `mode` de sucursal y regla para el modo global legado. |
| D12 | Resumen de mesa ocupada (total, comensales, tiempo, mesero, platillos listos) y filtro «Mis mesas» | C6 tables | Agregar `activeOrder: {total, guestCount, openedAt, waiterId, waiterName, readyLineCount}` a `GET /pos/v2/tables`. |
| D17 | Origen legible en movimientos de stock | C5 | Confirmar que el listado de movimientos expone `outletId`, `sourceType`, `sourceId`, folio y actor. |
| D18 | Experiencia predeterminada por terminal en HYBRID | C0 | Opcional: `defaultExperience` en terminal. Mientras tanto, preferencia local por dispositivo. |
| D20 | Deshacer un toque equivocado en KDS | C6 tickets | Permitir retroceso de un paso (READY→IN_PREPARATION, IN_PREPARATION→PENDING) con auditoría y ventana corta, o confirmar que no se permite. |
| D21 | Orden manual de categorías visible en POS | C1 categories | Confirmar campo de orden y que `GET /pos/v2/categories` lo respeta. |
| D22 | Conteo ciego al cerrar caja | C8 | Confirmar que `expected-cash` puede no consultarse antes del conteo y si la preferencia es de empresa. |
| D23 | «Pedir cuenta» (mesa por cobrar) | C6 | Estado de mesa o marca de orden para «cuenta solicitada», o confirmar que no aplica en v1. |
| D24 | Pre-cuenta impresa antes de cobrar | C7 | Documento no fiscal de orden OPEN con el mismo mecanismo de print jobs, o fuera de v1. |
| D25 | Códigos de error `REFUND_REQUIRED` y `PREPARATION_STATION_REQUIRED` | Convenciones | Añadirlos a la lista estable de códigos 409 de §5 de la especificación maestra. |

Límites de v1 aceptados por la UI sin pedir cambio: descuento sólo por línea (no por orden), disponibilidad por sucursal heredada a variantes, sin propinas calculadas, sin cola offline de pagos, sin procesamiento bancario.

## 14. Estado de integración por pantalla

Escala: **Diseño** (propuesto / aprobado) · **Frontend** (implementado con fixtures) · **Integrado** (contrato real con evidencia) · **Navegador** (390 × 844, 768 × 1024, 1024 × 768, escritorio, claro y oscuro) · **Táctil** (dispositivo real). Hoy todas las pantallas están en «Diseño propuesto» y el resto en «No».

| Pantalla / componente | Contratos | Etapa | Diseño | Frontend | Integrado | Navegador | Táctil |
|---|---|---|---|---|---|---|---|
| `PosContextGate` + `PosOperationBar` | C0, C8 | 3 | Propuesto | No | No | No | No |
| Tienda: catálogo, búsqueda, escaneo, variantes | C1 | 3 | Propuesto | No | No | No | No |
| Tienda: carrito | C2 | 3 | Propuesto | No | No | No | No |
| `ChargeSheet` + `SaleCompleteView` | C3, C7 | 3 | Propuesto | No | No | No | No |
| Apertura, movimientos, cierre de caja | C8 | 3 | Propuesto | No | No | No | No |
| `RefundSheet` | C4 | 3 | Propuesto | No | No | No | No |
| Órdenes (historial, detalle, reimpresión) | C2, C4, C7 | 3, 5 | Propuesto | No | No | No | No |
| Mesero: `TableBoard` | C0, C6 | 4 | Propuesto | No | No | No | No |
| Mesero: `TicketComposer` + envío | C1, C2, C6 | 4 | Propuesto | No | No | No | No |
| Caja restaurante + `SeatSplitSheet` | C2, C3, C6 | 4 | Propuesto | No | No | No | No |
| Turnos de meseros | C8 | 4 | Propuesto | No | No | No | No |
| KDS | C6 | 4 | Propuesto | No | No | No | No |
| Administración agrupada | C0, C1, C6, D11 | 5 | Propuesto | No | No | No | No |
| Catálogo: listado | actual + D03 | 2, 5 | Propuesto | No | No | No | No |
| Catálogo: alta rápida | actual, C1 | 2, 5 | Propuesto | No | No | No | No |
| Catálogo: ficha por pestañas | actual, C1 | 2, 5 | Propuesto | No | No | No | No |
| `VariantGrid` | actual | 5 | Propuesto | No | No | No | No |
| `OutletAvailabilityPanel` + `CommercialTaxField` | C1 admin, D10 | 2, 5 | Propuesto | No | No | No | No |
| `StockBalancesPanel` + asignación + movimientos | C5, D17 | 2, 5 | Propuesto | No | No | No | No |
| Componentes `@runly/ui` nuevos (§4.2) | ninguno | 3 | Propuesto | No | n/a | No | No |

Una pantalla no avanza de columna por compilar. «Integrado» exige que Codex haya publicado el contrato con fixture, schema, SDK y pruebas (especificación maestra §8). «Táctil» exige prueba en tableta o teléfono real con el recorrido completo.

## 15. Secuencia de implementación visual

1. **Ahora (sin contratos):** aprobación de esta especificación. Posible trabajo independiente del backend, si se aprueba: `Button size="touch"`, `MoneyText`, `NumericKeypad`, `StatusPill`, extracción de `ScanInput`/`useScanWedge` desde inventario (inventario sigue funcionando igual), y `VariantGrid` sobre la API actual de variantes (cierra la tabla HTML de H28). Nada de esto toca dinero ni rutas POS.
2. **Tras etapa 1 (C0, C2, C3, C4, C8 disponibles):** `PosContextGate`, `PosOperationBar`, sheets de sesión y `ChargeSheet` con fixtures detrás de gate; la Caja productiva no cambia hasta el gate de etapa 2.
3. **Tras etapa 2 (C1, C5):** Catálogo (listado, alta rápida, ficha por pestañas, disponibilidad, impuesto, existencias) y `SellableGrid`/`VariantPickerSheet`.
4. **Etapa 3:** Tienda completa conectada, `SaleCompleteView`/`ReceiptPreview` (C7), devoluciones, Órdenes. Retiro de `PaymentDialog` legado.
5. **Etapa 4 (C6):** Mesero, Caja restaurante, división, turnos, KDS. Floor Planner pasa a Administración.
6. **Etapa 5:** Administración agrupada y visibilidad por modo de sucursal.
7. **Etapa 6:** evidencia en navegador por tamaño y tema, y en dispositivo táctil, por cada fila de §14.

## 16. Verificación de esta entrega

Documento de diseño; no se modificó código ni se ejecutaron pruebas. Lecturas: especificación maestra y plan del 2026-11-01, manifiestos `runly.catalog`/`runly.pos` en `apps/api/src/manifests/official/core-modules.js`, pantallas y componentes en `apps/desktop/src/modules/runly.pos/` y `runly.catalog/`, inventario de `packages/ui/src/components/` (incluidos `Button`, `Badge`, `Dialog`, `PeekSheet`), `runly.inventory/components/scan/ScanSearchField.jsx`, `docs/ai-context/rme3-runtime-capabilities.md` y `docs/mobile/RUNLY_NATIVE_HOST.md` (impresión Bluetooth).
