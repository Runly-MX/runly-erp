---
title: Componentes de @runly/ui
summary: Referencia de los componentes que usan las pantallas de un módulo — props, valores que reciben y devuelven, ejemplos listos para copiar y patrones de diseño responsivo.
order: 2.5
---
Las pantallas de un módulo usan los mismos componentes que el resto de Runly. Importa todo desde `@runly/ui` y los iconos desde `lucide-react` (lista en *Iconos*). Cualquier clase de Tailwind funciona en tus componentes: Runly genera el CSS de tu módulo al instalarlo, con los colores del tema en modo claro y oscuro.

```jsx
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Button, TextField } from '@runly/ui'
import { ClipboardList, Plus } from 'lucide-react'
```

**Reglas rápidas:** nada de `<select>`, `<input>`, `<textarea>` ni `window.confirm/alert/prompt`; toda pantalla empieza con `PageHeader`; usa tokens de color (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`) en lugar de `bg-white` o colores hexadecimales; textos en español y sin emojis. Al subir el ZIP, la **Revisión de diseño** te dice archivo y línea de lo que no cumple.

## Kit de pantallas de módulo

La forma más corta de hacer una pantalla que se vea como Runly. Dentro de una pantalla de tu módulo no necesitas pasar `token`, `companyId` ni `apiBaseUrl`: el kit los toma solo.

```jsx
import { useState } from 'react'
import { ModulePage, EntityTable, EntityForm, Sheet, SheetContent, SheetHeader, SheetTitle, Button } from '@runly/ui'
import { CalendarCheck, Plus } from 'lucide-react'

export default function Visitas() {
  const [editing, setEditing] = useState(null) // null = cerrado, 'new' = crear, id = editar
  return (
    <ModulePage title="Visitas" icon={CalendarCheck} description="Agenda de visitas a clientes"
      actions={<Button onClick={() => setEditing('new')}><Plus /> Nueva visita</Button>}>
      <EntityTable entity="visita" onEdit={(row) => setEditing(row.id)} />
      <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent side="right">
          <SheetHeader><SheetTitle>{editing === 'new' ? 'Nueva visita' : 'Editar visita'}</SheetTitle></SheetHeader>
          <EntityForm entity="visita" recordId={editing === 'new' ? undefined : editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
        </SheetContent>
      </Sheet>
    </ModulePage>
  )
}
```

`entity` es el nombre de la entidad en el Constructor (`visita`). `EntityTable`, `EntityForm` y `EntityDetail` usan las vistas que diseñaste en el Constructor (columnas, secciones, tipos de campo, relaciones y validación), así que se ven y validan igual que el resto del módulo.

### ModulePage

Raíz de cada pantalla: `PageHeader` + contenedor responsivo.

| Prop | Tipo | Qué hace |
|---|---|---|
| `title` | string | Título |
| `description` | string | Texto bajo el título |
| `icon` | componente lucide | Icono junto al título |
| `actions` | ReactNode | Botones del encabezado |
| `onBack` | función | Enlace "Volver" |

### FormSection

Sección con título e icono para agrupar campos, en rejilla responsiva (una columna en celular).

| Prop | Tipo | Qué hace |
|---|---|---|
| `title` | string | Título de la sección |
| `description` | string | Texto bajo el título |
| `icon` | componente lucide | Icono del título |
| `columns` | 1 · 2 · 3 · 4 | Columnas desde tablet (2) |
| `actions` | ReactNode | Botones a la derecha del título |

Un campo puede ocupar toda la fila con `className="md:col-span-2"`.

```jsx
<FormSection title="Datos generales" icon={ClipboardList}>
  <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
  <DatePickerField label="Fecha" value={fecha} onChange={setFecha} />
  <TextareaField label="Notas" className="md:col-span-2" value={notas} onChange={(e) => setNotas(e.target.value)} />
</FormSection>
```

### FieldGrid

La rejilla de `FormSection` sin la tarjeta. Prop `columns` (1–4).

### DetailHeader

Encabezado de la ficha de un registro.

| Prop | Tipo | Qué hace |
|---|---|---|
| `title` / `subtitle` | string | Nombre y dato secundario |
| `icon` | componente lucide | Icono en recuadro |
| `badges` | ReactNode | Etiquetas de estado (`Badge`) |
| `actions` | ReactNode | Botones |

### FilterBar

Filtros en forma de chips (píldoras) para listas con 1 a 3 filtros rápidos de una sola elección. Para más filtros, selección múltiple o móvil usa `FilterMenu`.

| Prop | Tipo | Qué hace |
|---|---|---|
| `filters` | `[{ key, label, options: [{ value, label }] }]` | Filtros (`type: 'daterange'` con `fromKey`/`toKey` para rangos de fecha) |
| `value` | objeto | Valores activos `{ [key]: value }` |
| `onChange` | `(nuevoValor) => void` | Recibe el objeto completo de filtros |

### FilterToolbar

Barra de búsqueda y filtros para listas. En escritorio es una sola fila (buscador, filtros y acciones); en móvil muestra el buscador y un botón "Filtros" (con el número de filtros activos) que abre los filtros en una hoja inferior.

| Prop | Tipo | Qué hace |
|---|---|---|
| `search` | ReactNode | Normalmente un `SearchInput` |
| `filters` | ReactNode | Controles de filtro (`FilterBar`, `DateRangeFilter`, `ToggleFilter`...) |
| `actions` | ReactNode | Acciones de la pantalla. En móvil van en una segunda fila: la última es la principal y ocupa el ancho disponible; las anteriores deben ser solo icono (etiqueta en un `<span className="max-sm:sr-only">` más `aria-label`/`title`) para no desbordar |
| `activeCount` | number | Filtros activos (se muestra en el botón móvil) |
| `onClear` | `() => void` | Limpia todos los filtros |

### ToggleFilter

Interruptor en forma de píldora para filtros de sí/no.

| Prop | Tipo | Qué hace |
|---|---|---|
| `label` | string | Texto |
| `checked` | boolean | Estado |
| `onChange` | `(checked) => void` | Cambio |

### DateRangeFilter

Selector de rango de fechas en forma de chip: atajos (Hoy, Últimos 7 días, Este mes...), calendario con vista previa del rango y botón "Quitar rango". Es el mismo que usa `FilterBar` cuando un filtro es `type: 'daterange'`; úsalo suelto cuando solo necesitas el rango (por ejemplo junto a un buscador).

| Prop | Tipo | Qué hace |
|---|---|---|
| `filter` | `{ key, label, fromKey, toKey }` | `label` es el texto del chip; `fromKey`/`toKey` son las claves donde se escribe cada extremo |
| `value` | objeto | `{ [fromKey]: 'YYYY-MM-DD', [toKey]: 'YYYY-MM-DD' }` (vacío = sin límite) |
| `onChange` | `(nuevoValor) => void` | Recibe el objeto completo, con ambas claves |

```jsx
import { DateRangeFilter } from '@runly/ui'

<DateRangeFilter
  filter={{ key: 'fecha', label: 'Fecha', fromKey: 'desde', toKey: 'hasta' }}
  value={{ desde, hasta }}
  onChange={(v) => { setDesde(v.desde); setHasta(v.hasta) }}
/>
```

### FilterMenu

Un solo botón "Filtros" (con contador de filtros activos) que sustituye una fila de chips de filtro. En escritorio abre un panel con las categorías a la izquierda y las opciones a la derecha; en móvil, una hoja inferior con dos pasos (categorías, luego opciones). `DataTable` ya lo usa por defecto con su prop `filters` (`filtersLayout: 'menu'`).

**Cuándo usarlo:** cuando la lista tiene varios filtros (4 o más), de tipos mezclados (opciones, selección múltiple, interruptores, rangos de fecha) o cuando la pantalla se usa en móvil. Para 1 a 3 filtros rápidos de una sola elección usa las píldoras de `FilterBar` (en `DataTable`: `filtersLayout="pills"`, que solo admite `select`, `combobox` y `daterange`).

| Prop | Tipo | Qué hace |
|---|---|---|
| `filters` | `[{ key, label, type?, options?, icon?, fromKey?, toKey?, allLabel?, description?, value?, onChange? }]` | `type`: `select` (por defecto), `multiselect` (cualquiera de las opciones elegidas), `daterange` (usa `fromKey`/`toKey`), `toggle`, `combobox` (con búsqueda). `icon` (componente lucide) aparece en la lista de categorías y en el chip |
| `filters[].options` | `[{ value, label, icon?, color? }]` | `icon` (lucide) o `color` (punto de color) se muestran junto a cada opción y en el chip cuando hay una sola elegida |
| `value` | objeto plano | `key -> string \| string[] \| boolean`; para rangos, `fromKey`/`toKey` |
| `onChange` | `(nuevoValor) => void` | Recibe el objeto completo con el cambio aplicado |

Con `DataTable`, un filtro que trae su propio `value` y `onChange` es controlado (por ejemplo para filtrar en el servidor); los demás filtran las filas en el cliente comparando `String(row[key])` (en `multiselect`, cualquiera de los valores elegidos) o con `match(row, valor)`. Los chips de `multiselect` muestran todas las opciones ("Tipo: Interno, Contratista").

```jsx
import { CircleCheck, CircleOff, HardHat, Shapes, UserCheck, Users } from 'lucide-react'
import { ActiveFilterChips, FilterMenu } from '@runly/ui'

const filters = [
  {
    key: 'tipo', label: 'Tipo', type: 'multiselect', icon: Shapes,
    options: [{ value: 'interno', label: 'Interno', icon: Users }, { value: 'contratista', label: 'Contratista', icon: HardHat }],
  },
  {
    key: 'estado', label: 'Estado', icon: UserCheck,
    options: [{ value: 'activo', label: 'Activo', icon: CircleCheck }, { value: 'inactivo', label: 'Inactivo', icon: CircleOff }],
  },
  { key: 'fechas', label: 'Fechas', type: 'daterange', fromKey: 'desde', toKey: 'hasta' },
]
<FilterMenu filters={filters} value={value} onChange={setValue} />
<ActiveFilterChips filters={filters} value={value} onChange={setValue} />
```

### Migrar de FilterBar o MobileFiltersSheet a FilterMenu

Cambia `<FilterBar filters value onChange />` por `<FilterMenu filters value onChange />` (misma forma de `value` y `onChange`, así que el estado, los parámetros de la API y los enlaces con filtros no cambian), añade `<ActiveFilterChips />` debajo de la fila y elimina el `MobileFiltersSheet` duplicado: `FilterMenu` ya se adapta al móvil. Puedes darle `icon` a cada filtro y `icon` o `color` a las opciones. Usa `multiselect` solo si el filtro admite varios valores. Con 1 o 2 filtros rápidos de una sola elección, `FilterBar` sigue siendo válido. Las tablas `RunlyTable` basadas en blueprint ya usan `FilterMenu`; en `filters` del blueprint acepta `icon` y opciones con `icon` o `color`.

### ActiveFilterChips

Chips quitables ("Tipo: Alfa", o "Tipo: Alfa, Beta" con varias opciones; con el icono del filtro y de la opción) de los filtros activos de un `FilterMenu`; no muestra nada si no hay filtros activos. Props: `filters`, `value`, `onChange` (los mismos que `FilterMenu`).

### DateRangePanel

Cuerpo del selector de rango (atajos, cajas Desde/Hasta y calendario) que usan `DateRangeFilter` y `FilterMenu`. Props: `from`, `to`, `onChange(from, to)`, `layout` (`side` o `stacked`).

### EntityTable

Tabla paginada con búsqueda y filtros de una entidad, igual a la vista TABLE del Constructor.

| Prop | Tipo | Qué hace |
|---|---|---|
| `entity` | string | Entidad (`visita`) |
| `onCreate` | función | Botón "Crear" |
| `onView` / `onEdit` | `(fila) => void` | Acciones de cada fila |
| `refreshSignal` | number | Cámbialo para recargar |
| `initialFilters` | objeto | Filtros iniciales |

### EntityForm

Formulario para crear (sin `recordId`) o editar un registro, con las secciones y campos del Constructor.

| Prop | Tipo | Qué hace |
|---|---|---|
| `entity` | string | Entidad |
| `recordId` | string | Id a editar; sin él, crea |
| `initialData` | objeto | Valores iniciales (por ejemplo una relación preseleccionada) |
| `onSaved` | `(registro) => void` | Después de guardar |
| `onCancel` | función | Botón "Cancelar" |
| `showFooter` | boolean | Mostrar botones Guardar/Cancelar (true) |

### EntityDetail

Ficha de solo lectura de un registro (secciones, adjuntos). Props: `entity`, `recordId`, `onEdit`, `onBack`, `heroActions`, `mainExtra`, `asideExtra` (contenido propio de la pantalla que se agrega al final de la columna principal o lateral en `layout: 'two-column'`, en vez de una fila de ancho completo debajo del detalle).

### AuditTrail

Historial de cambios de un registro: quién cambió qué y cuándo, con los campos modificados en línea, filtros por tipo y el botón *Ver historial completo* (panel lateral con filtro por persona y paginación). En la ficha generada aparece solo; en un detalle por blueprint agrega la sección `{ type: 'audit', label: 'Historial de cambios', audit: { entityType: '<módulo>.<entidad>' } }`.

```jsx
<AuditTrail apiBaseUrl={apiBaseUrl} token={token} companyId={companyId}
  entityType="visitas.visita" entityId={visita.id}
  changeLabels={{ estado: { label: 'Estado', type: 'select', options: ESTADOS } }} />
```

`changeLabels` es opcional: sin él, los nombres de campo se muestran legibles ("fecha_visita" → "Fecha visita").

### PersonAvatar

Foto de una persona con globo de iniciales cuando no hay foto: `<PersonAvatar name="Ana López" src={persona.avatarUrl} size="sm" />` (tamaños `xs`, `sm`, `md`, `lg`).

### useEntityList

`useEntityList(entity, { page, pageSize, search, filters })` → consulta de TanStack Query con `{ data, pagination }` de la API. Útil para indicadores y pantallas a la medida.

```jsx
const { data, isLoading } = useEntityList('visita', { pageSize: 5 })
const total = data?.pagination?.total ?? 0
const recientes = data?.data ?? []
```

### useEntityRecord

`useEntityRecord(entity, id)` → el registro (`data`) o `undefined` mientras carga.

### useEntityMutations

`const { create, update, disable } = useEntityMutations('visita')` → mutaciones con avisos en español y recarga automática: `create.mutate(valores)`, `update.mutate({ id, values })`, `disable.mutate(id)`.

## Patrones

### Formulario por secciones, responsivo

```jsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Datos generales</CardTitle>
  </CardHeader>
  <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <TextField label="Nombre" required value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
    <SelectField label="Estado" options={ESTADOS} value={form.estado} onValueChange={(v) => set('estado', v)} />
    <DatePickerField label="Fecha" value={form.fecha} onChange={(v) => set('fecha', v)} />
    <TextareaField label="Notas" className="md:col-span-2" value={form.notas} onChange={(e) => set('notas', e.target.value)} />
  </CardContent>
</Card>
```

### Fila de indicadores

```jsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
  <StatCard label="Visitas del mes" value={42} icon={CalendarCheck} />
  <StatCard label="Pendientes" value={7} icon={Clock} />
</div>
```

### Estados de carga, vacío y error

```jsx
if (isLoading) return <Skeleton className="h-40 w-full" />
if (error) return <ErrorState description={error.message} onRetry={refetch} />
if (!rows.length) return <EmptyState icon={ClipboardList} title="Sin visitas" description="Registra la primera." action={{ label: 'Nueva visita', onClick: openForm }} />
```

## Estructura de pantalla

### PageHeader

Encabezado obligatorio de cada pantalla.

| Prop | Tipo | Requerido | Qué hace |
|---|---|---|---|
| `title` | string | Sí | Título de la pantalla |
| `description` | string | | Texto bajo el título |
| `eyebrow` | string | | Texto pequeño sobre el título |
| `actions` | ReactNode | | Botones a la derecha (en celular pasan abajo) |
| `onBack` | función | | Muestra un enlace "Volver" |
| `backLabel` | string | | Texto del enlace (por defecto "Volver") |
| `compact` | boolean | | Versión más baja |
| `loading` | boolean | | Muestra un esqueleto en lugar del título |

```jsx
<PageHeader title="Visitas" description="Agenda de visitas a clientes" actions={<Button onClick={openForm}><Plus /> Nueva visita</Button>} />
```

### Card

Contenedor con borde y fondo del tema. Se arma con `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` y `CardFooter`; todos aceptan `className`.

```jsx
<Card>
  <CardHeader><CardTitle>Resumen</CardTitle><CardDescription>Últimos 30 días</CardDescription></CardHeader>
  <CardContent>...</CardContent>
  <CardFooter className="justify-end"><Button>Guardar</Button></CardFooter>
</Card>
```

### CardHeader

Parte superior de `Card`. Acepta `className` y `children`.

### CardTitle

Título dentro de `CardHeader`. Pon un icono de lucide antes del texto (`className="flex items-center gap-2"`).

### CardDescription

Texto secundario bajo `CardTitle`.

### CardContent

Cuerpo de `Card`. Usa aquí la rejilla del formulario (`grid grid-cols-1 gap-4 md:grid-cols-2`).

### CardFooter

Pie de `Card`, normalmente con acciones (`justify-end`).

### Tabs

Pestañas (Radix). Por defecto se muestran como píldoras animadas. Se compone con `TabsList`, `TabsTrigger` y `TabsContent`.

| Prop (`Tabs`) | Tipo | Qué hace |
|---|---|---|
| `value` / `defaultValue` | string | Pestaña activa |
| `onValueChange` | `(value) => void` | Cambio de pestaña |

```jsx
<Tabs defaultValue="general">
  <TabsList><TabsTrigger value="general">General</TabsTrigger><TabsTrigger value="historial">Historial</TabsTrigger></TabsList>
  <TabsContent value="general">...</TabsContent>
  <TabsContent value="historial">...</TabsContent>
</Tabs>
```

### TabsList

Barra de pestañas dentro de `Tabs`.

### TabsTrigger

Pestaña individual; `value` debe coincidir con su `TabsContent`.

### TabsContent

Contenido de una pestaña.

### ChipTabs y ChipTabPanel

Pestañas controladas en forma de chips de color con indicador deslizante y, opcionalmente, la explicación de la pestaña activa (por defecto en un botón "?" que abre un popover). Úsalas cuando quieras controlar la pestaña (por ejemplo, guardarla en la URL).

| Prop (`ChipTabs`) | Tipo | Qué hace |
|---|---|---|
| `tabs` | `[{ value, label, icon, description, badge }]` | Pestañas; `description` se muestra según `descriptionMode`, `badge` es un contador |
| `value` / `onChange` | string / `(value) => void` | Pestaña activa y cambio |
| `tone` | `teal` (por defecto), `blue`, `violet`, `amber`, `rose` | Color |
| `ariaLabel` | string | Etiqueta accesible |
| `descriptionMode` | `popover` (por defecto), `banner`, `none` | `popover`: botón "?" al final de los chips con icono, título y descripción; `banner`: recuadro siempre visible bajo los chips |
| `showDescription` | boolean | `false` equivale a `descriptionMode="none"` (compatibilidad) |

```jsx
import { ChipTabs, ChipTabPanel } from '@runly/ui'

<ChipTabs
  ariaLabel="Secciones"
  tabs={[{ value: 'general', label: 'General', description: 'Datos básicos.' }, { value: 'historial', label: 'Historial', badge: 3 }]}
  value={tab}
  onChange={setTab}
/>
<ChipTabPanel value="general" active={tab === 'general'}>...</ChipTabPanel>
<ChipTabPanel value="historial" active={tab === 'historial'}>...</ChipTabPanel>
```

## Acciones e indicadores

### Button

| Prop | Tipo | Qué hace |
|---|---|---|
| `variant` | `default` · `secondary` · `outline` · `ghost` · `destructive` · `link` | Estilo |
| `size` | `default` · `sm` · `lg` · `icon` | Tamaño (`icon` = cuadrado para un solo icono, agrega `aria-label`) |
| `disabled`, `onClick`, `type` | | Como en un botón normal |
| `asChild` | boolean | Usa el hijo (por ejemplo un `Link`) como botón |

Los iconos dentro del botón se ajustan solos: `<Button><Plus /> Nueva</Button>`.

### Badge

Etiqueta de estado. `variant`: `default`, `secondary`, `outline`, `success`, `warning`, `destructive`.

```jsx
<Badge variant={visita.estado === 'REALIZADA' ? 'success' : 'warning'}>{visita.estado}</Badge>
```

### StatCard

Tarjeta de indicador.

| Prop | Tipo | Qué hace |
|---|---|---|
| `label` | string | Nombre del indicador |
| `value` | string · number | Valor principal |
| `icon` | componente lucide | Icono (se pasa el componente, no `<Icono />`) |
| `trend` | ReactNode | Texto o etiqueta de variación |
| `loading` | boolean | Esqueleto mientras carga |

### Tooltip

Ayuda al pasar el mouse. Se compone con `TooltipTrigger` y `TooltipContent` (y `TooltipProvider` si no hay uno arriba).

```jsx
<Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label="Duplicar"><Copy /></Button></TooltipTrigger><TooltipContent>Duplicar</TooltipContent></Tooltip>
```

### DropdownMenu

Menú de acciones. Se compone con `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`.

```jsx
<DropdownMenu>
  <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Más acciones"><MoreHorizontal /></Button></DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onSelect={edit}><Pencil /> Editar</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={() => setConfirmOpen(true)} className="text-destructive"><Trash2 /> Desactivar</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

## Campos de formulario

Todos aceptan `label`, `required`, `error` (texto rojo bajo el campo), `hint` (ayuda), `disabled` y `className`.

En el teléfono (pantalla angosta y táctil) los selectores (`SelectField`, `ComboboxField`, `CreatableComboboxField`, `RelationSelectField`) abren sus opciones en una hoja inferior con el `label` como título, en lugar del panel flotante; el buscador no abre el teclado hasta que lo tocas. No hace falta ningún prop.

Icono automático: `TextField`, `NumberField`, `PasswordField` y los selectores (`SelectField`, `ComboboxField`, `CreatableComboboxField`, `RelationSelectField`) muestran un icono representativo a la izquierda aunque no pases `icon`: se deduce del `name` y del `label` (por ejemplo "Correo" → sobre, "Teléfono" → teléfono, "Dirección" → pin, "Puesto" → maletín). Solo ocurre si el campo tiene `label`. Pasa `icon={Otro}` para elegir uno o `icon={null}` para quitarlo.

### TextField

Texto de una línea. Además acepta todas las props de un input (`value`, `onChange`, `type`, `placeholder`, `maxLength`…) y `icon` (componente lucide al inicio).

| Prop | Tipo | Qué hace |
|---|---|---|
| `value` | string | Valor |
| `onChange` | `(event) => void` | **Recibe el evento**: usa `e.target.value` |
| `type` | `text` · `email` · `number` · `password` · `url` | Tipo de dato |
| `icon` | componente lucide · `null` | Icono a la izquierda (automático si se omite; `null` lo quita) |
| `validate` | `(value) => string` | Valida al salir del campo; devuelve el mensaje de error o `''` |

```jsx
<TextField label="Correo" type="email" icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} />
```

### TextareaField

Texto de varias líneas. Igual que `TextField` (`onChange` recibe el evento) más `rows`.

### SelectField

Lista corta de opciones, sin búsqueda.

| Prop | Tipo | Qué hace |
|---|---|---|
| `options` | `[{ value, label }]` o `['A', 'B']` | Opciones (no uses `value: ''`) |
| `value` | string | Valor seleccionado |
| `onValueChange` | `(value) => void` | **Recibe el valor**, no un evento |
| `placeholder` | string | Texto sin selección |

```jsx
<SelectField label="Estado" options={[{ value: 'PROGRAMADA', label: 'Programada' }, { value: 'REALIZADA', label: 'Realizada' }]} value={estado} onValueChange={setEstado} />
```

### ComboboxField

Lista con búsqueda (para listas largas o datos de la API).

| Prop | Tipo | Qué hace |
|---|---|---|
| `options` | `[{ value, label, description? }]` | Opciones |
| `value` / `onChange` | valor · `(value) => void` | Recibe el valor (o un arreglo con `multiple`) |
| `multiple` | boolean | Selección múltiple con chips |
| `onSearchChange` | `(texto) => void` | Búsqueda remota (combínalo con `filter={false}`) |
| `loading`, `loadError`, `onRetry` | | Estados de carga remota |
| `clearable` | boolean | Botón para limpiar |
| `placeholder`, `searchPlaceholder`, `emptyText` | string | Textos |

### CreatableComboboxField

Igual que `ComboboxField` y además permite crear: pasa `onCreate={(texto) => ...}`. Usa `placeholder="Buscar o crear..."`.

### CheckboxField

| Prop | Tipo | Qué hace |
|---|---|---|
| `checked` | boolean | Marcado |
| `onChange` | `(event) => void` | **Recibe el evento**: usa `e.target.checked` |
| `id` | string | Recomendado para accesibilidad |

### SwitchField

Interruptor sí/no.

| Prop | Tipo | Qué hace |
|---|---|---|
| `checked` | boolean | Encendido |
| `onChange` | `(checked) => void` | **Recibe el booleano nuevo** |
| `description` | string | Texto bajo la etiqueta |

### DatePickerField

Fecha con calendario. `value` y `onChange` usan texto `AAAA-MM-DD` (`onChange(undefined)` al limpiar). Para guardar fechas locales nunca uses `toISOString().slice(0, 10)`: trabaja con el texto que entrega el campo.

```jsx
<DatePickerField label="Fecha de visita" value={fecha} onChange={setFecha} required />
```

### PhoneField

Teléfono con lada. Mismas props base que `TextField`.

### SearchInput

Buscador simple para filtrar listas.

| Prop | Tipo | Qué hace |
|---|---|---|
| `value` / `onChange` | string · `(event) => void` | Texto (evento) |
| `onClear` | función | Botón para limpiar |
| `placeholder` | string | Por defecto "Buscar..." |

## Datos

### DataTable

Tabla con orden, búsqueda, filtros y paginación (TanStack Table).

| Prop | Tipo | Qué hace |
|---|---|---|
| `columns` | `[{ accessorKey, header, cell? }]` | Columnas; `cell: ({ row }) => ...` para formato propio |
| `data` | arreglo | Filas |
| `isLoading`, `isError`, `onRetry` | | Estados |
| `filters` | `[{ key, label, options: [{ value, label }] }]` | Filtros de la barra |
| `searchPlaceholder` | string | Texto del buscador |
| `emptyTitle`, `emptyDescription`, `emptyIcon`, `emptyAction` | | Estado vacío |
| `pageSize` | number | Filas por página (10) |
| `getRowId` | `(row) => id` | Id estable de cada fila |
| `viewModes` | `['table','cards']` (o con `'grid'`) | Activa el conmutador Tabla / Tarjetas en la barra (junto al botón Filtros en móvil). Requiere `renderCard`. Sin esta prop la tabla se comporta igual que siempre |
| `renderCard` | `(row, tableRow) => nodo` | Tarjeta de cada fila; con el modo tarjetas se aplican la misma búsqueda, filtros, paginación y estados vacío/error/carga |
| `viewMode` / `onViewModeChange` | string / `(mode) => void` | Modo controlado |
| `viewStorageKey`, `defaultViewMode` | string | Modo no controlado: se guarda en localStorage con esa clave; `defaultViewMode` es el inicial (el primero de `viewModes` si se omite) |
| `cardGridClassName` | string | Clases de la cuadrícula de tarjetas (por defecto 1/2/3 columnas) |

Los filtros de `filters` comparan `String(row[key])` con la opción elegida, o usan `match(row, value)` si lo defines; para valores calculados agrega campos derivados a los datos que pasas.

```jsx
const columns = [
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'estado', header: 'Estado', cell: ({ row }) => <Badge>{row.original.estado}</Badge> },
]
<DataTable columns={columns} data={rows} isLoading={isLoading} emptyTitle="Sin visitas" emptyIcon={ClipboardList} />
```

### RunlyTable

Tabla basada en el blueprint de una entidad del módulo (la misma que usan las vistas TABLE). Úsala cuando quieras la tabla estándar del Constructor dentro de una pantalla propia; para tablas a la medida usa `DataTable`.

### EmptyState

| Prop | Tipo | Qué hace |
|---|---|---|
| `icon` | componente lucide | Icono |
| `title` | string | Título |
| `description` | string | Explicación |
| `action` | `{ label, onClick }` o un botón | Acción principal |
| `variant` | `default` · `compact` | `compact` para espacios pequeños |

### ErrorState

| Prop | Tipo | Qué hace |
|---|---|---|
| `title` | string | Por defecto "Error al cargar" |
| `description` | string | Detalle |
| `onRetry` | función | Muestra "Reintentar" |

### Skeleton

Bloque animado mientras carga. Dale tamaño con `className` (`h-32 w-full`).

## Ventanas

### Dialog

Ventana modal. Se compone con `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` y `DialogFooter`. El encabezado y el pie quedan fijos; solo el contenido se desplaza.

```jsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader><DialogTitle>Nueva visita</DialogTitle><DialogDescription>Completa los datos.</DialogDescription></DialogHeader>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">...</div>
    <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Guardar</Button></DialogFooter>
  </DialogContent>
</Dialog>
```

### Sheet

Panel lateral (o inferior en celular). Igual que `Dialog`, con `SheetContent` (`side="right"`), `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter`. Úsalo para formularios largos o detalles.

### ConfirmDialog

Confirmación de acciones destructivas (en lugar de `window.confirm`).

| Prop | Tipo | Qué hace |
|---|---|---|
| `open` / `onOpenChange` | boolean · función | Visibilidad (con `useState`) |
| `title` | string | Pregunta |
| `description` | string | Consecuencia |
| `detail` | string | Dato resaltado (por ejemplo el nombre) |
| `onConfirm` | función | Acción al confirmar |
| `confirmLabel` / `cancelLabel` | string | Textos de los botones |
| `loading` | boolean | Deshabilita mientras se ejecuta |

## Archivos

### FileUploader

Selector y carga de archivos.

| Prop | Tipo | Qué hace |
|---|---|---|
| `value` / `onChange` | archivo · función | Archivo actual |
| `onUpload` | `(file) => Promise` | Sube un archivo |
| `onUploadMany` | `(files) => Promise` | Sube varios (con `multiple`) |
| `multiple` | boolean | Varios archivos |
| `accept` | string | Tipos (`image/*`, `.pdf`) |

### AttachmentsPanel

Panel de adjuntos de un registro, conectado a los archivos del módulo.

| Prop | Tipo | Qué hace |
|---|---|---|
| `apiBaseUrl`, `token`, `companyId` | | Las props que recibe tu pantalla |
| `recordId` | string | Registro dueño de los adjuntos |
| `config` | objeto | Configuración del campo de archivos de la entidad |
| `context` | `detail` · `form` | Dónde se muestra |

### AdvancedFileViewer

Visor a pantalla completa de imágenes, PDF, video, audio y otros archivos. Las imágenes de archivos de Runly (los que subes con `FileUploader`, `FileAssetField` o `AttachmentsPanel`) muestran un botón **Editar** que abre el editor de imágenes; quien edita elige entre **Guardar copia** y **Reemplazar original**, y el servidor decide con los permisos de tu módulo quién puede hacerlo.

| Prop | Tipo | Qué hace |
|---|---|---|
| `open` / `onOpenChange` | boolean · función | Abre y cierra el visor |
| `files` | arreglo | Archivos con `id`, `originalName`, `mimeType` y `sizeBytes` |
| `activeIndex` / `onIndexChange` | número · función | Archivo actual |
| `onResolveSignedUrl` | `(file) => Promise<string>` | Devuelve la URL para ver el archivo |
| `imageEditing` | boolean | `false` oculta el botón Editar (úsalo en evidencias o archivos que no deben alterarse) |

### ImageEditorDialog

Editor de imágenes a pantalla completa: recortar con proporciones, girar, voltear y enderezar, filtros, ajustes (brillo, contraste, saturación, calidez, viñeta y desenfoque), anotaciones (lápiz, flecha, recuadro y texto) e imágenes añadidas encima. Tiene deshacer y rehacer, comparación con el original (mantener pulsado el botón **Original** o la tecla `\`), y gestos de rueda, pellizco y giro con dos dedos. No cambia nada hasta que guardas.

| Prop | Tipo | Qué hace |
|---|---|---|
| `open` / `onOpenChange` | boolean · función | Abre y cierra el editor |
| `src` | string | URL de la imagen (debe poder leerse desde el navegador, como las URL firmadas) |
| `fileName` / `mimeType` | string | Nombre y tipo de la imagen original |
| `onSave` | `(file) => Promise` | Recibe la imagen editada como copia |
| `onReplace` | `(file) => Promise` | Si lo pasas, aparece **Reemplazar original** con confirmación |
| `saveLabel` | string | Texto del botón de copia (`Guardar copia`) |

Si `onSave` o `onReplace` lanzan un error, el editor se queda abierto para reintentar. Girar, voltear o enderezar mueve las anotaciones y las imágenes añadidas junto con la foto y reinicia el recorte.

### AvatarCropDialog

Encuadre de una foto de perfil: muestra la imagen completa y un círculo que se mueve y cambia de tamaño (arrastre, rueda, pellizco o flechas del teclado), con girar, voltear y enderezar. Devuelve un archivo cuadrado.

| Prop | Tipo | Qué hace |
|---|---|---|
| `open` / `onOpenChange` | boolean · función | Abre y cierra |
| `file` | `File` | Imagen a encuadrar |
| `onConfirm` | `(file) => Promise` | Recibe la foto ya recortada |
| `outputSize` | número | Lado en píxeles (1024) |
| `busy` | boolean | Deshabilita mientras se sube |

## Iconos

### IconGlyph

Dibuja un icono de lucide a partir de su nombre en kebab-case (útil cuando el icono viene de datos).

| Prop | Tipo | Qué hace |
|---|---|---|
| `name` | string | Nombre lucide (`truck`, `file-text`) |
| `className` | string | Tamaño y color (`h-5 w-5 text-primary`) |
| `strokeWidth` | number | Grosor (2) |

### IconLibraryPanel

Selector de iconos con búsqueda en español y categorías. Ponlo dentro de un `Popover` o `Dialog`.

| Prop | Tipo | Qué hace |
|---|---|---|
| `value` | string | Nombre lucide seleccionado |
| `onChoose` | `(name) => void` | Al elegir |
| `color` | string | Color del icono seleccionado |
| `gridClassName` | string | Alto máximo de la rejilla (`max-h-72`) |

## Utilidades

### resolveRecordLabel

`resolveRecordLabel(registro, blueprints?)` devuelve el texto para el título de un registro y **nunca su id**. Primero busca campos de nombre comunes (`nombre`, `name`, `titulo`, `folio`, `codigo`…), luego el campo de título que declare la vista y, después, el primer campo de texto de las vistas de la entidad o la etiqueta de una relación. Si no encuentra nada, devuelve `null`: en ese caso usa el nombre de la entidad ("Calibración").

```jsx
const { blueprints } = useModuleRuntime()
const titulo = resolveRecordLabel(registro, [findEntityBlueprint(blueprints, 'DETAIL', 'calibracion')]) ?? 'Calibración'
<DetailHeader title={titulo} />
```

### buildApiHeaders

`buildApiHeaders(token, companyId, extra?)` arma los encabezados `Authorization` y `X-Runly-Company-Id` para tus `fetch`. Úsalo siempre:

```js
const res = await fetch(`${apiBaseUrl}/visitas/visitas?pageSize=50`, { headers: buildApiHeaders(token, companyId) })
```


## Modales: animación y Enter para enviar

`Dialog` y `Sheet` animan su entrada y salida por defecto (el panel lateral se desliza, el diálogo se desvanece y escala; se respeta `prefers-reduced-motion`). Las utilidades `animate-in`, `fade-in-*`, `zoom-in-*` y `slide-in-from-*` ya están definidas en el tema compartido, así que también puedes usarlas en tus propios componentes con `data-[state=open]:`.

Dentro de un modal, pulsar **Enter** en un campo de texto ejecuta la acción principal del pie (el último botón de variante principal o destructiva dentro de `DialogFooter`/`SheetFooter`), como lo haría un formulario. No se activa en áreas de texto, casillas, selectores ni campos de búsqueda con sugerencias. Para desactivarlo en todo el modal usa `submitOnEnter={false}` en `DialogContent`/`SheetContent`; para excluir un campo o una zona, márcala con `data-no-enter-submit`. Si construyes un pie propio, márcalo con `data-dialog-footer`.
