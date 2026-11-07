---
title: Diseño de pantallas y móvil
summary: Cómo hacer pantallas de módulo que se vean y se sientan como Runly — composición, iconos, diseño responsivo, gestos táctiles, funciones del teléfono en la app de Android y dibujo con canvas sin librerías externas.
order: 2.4
---
Un módulo de Runly se usa en escritorio, en el navegador del celular y en la app de Android. La meta es que una pantalla de tu módulo no se distinga de una pantalla de Runly: con jerarquía clara, iconos, estados de carga y vacío, y cómoda con el dedo.

## Cuándo una vista generada y cuándo una pantalla React

| Lo que pide el usuario | Usa |
|---|---|
| Altas, bajas y consulta de registros (catálogo, bitácora administrativa) | Vistas del Constructor: TABLE, FORM, DETAIL, KANBAN, CARDS, CALENDAR, TIMELINE, REPORT |
| Un tablero, un flujo de trabajo, una pantalla para campo o celular, una ficha rica, captura con cámara, firma o croquis | Pantalla React (`CUSTOM`) con el kit de `@runly/ui` ([Pantallas React](/documentacion/desarrolladores/pantallas-react)) |

Las vistas generadas son correctas pero todas lucen igual. Si el pedido habla de cómo se debe *ver* o *usar* la pantalla, hazla en React. Un módulo puede combinar las dos cosas: las vistas generadas para administrar y una o dos pantallas React como entrada principal del menú.

## Composición de una buena pantalla

1. **Encabezado**: `ModulePage` o `PageHeader` con título, descripción corta, icono y las acciones principales (la acción primaria es un `Button` con icono).
2. **Indicadores** cuando aportan algo: `StatStrip` o una fila de `StatCard` (`grid gap-4 sm:grid-cols-2 lg:grid-cols-4`), cada uno con su icono.
3. **Barra de búsqueda y filtros**: `FilterToolbar` con `SearchInput` y `FilterMenu`.
4. **Contenido**: `EntityTable`/`DataTable` en escritorio y tarjetas en celular (ver abajo), o `Card` por secciones en una ficha.
5. **Estados**: `Skeleton` mientras carga, `EmptyState` con icono, texto que explique qué falta y un botón para crear el primero, y `ErrorState` con el mensaje real.

Detalles que se notan:

- Iconos de `lucide-react` en títulos de sección, botones, indicadores, estados vacíos y opciones de menú. Elige el icono por significado en [Iconos](/documentacion/desarrolladores/iconos); no repitas el mismo icono para cosas distintas.
- Estados con `Badge` de color (activo, vencido, en proceso), no texto plano.
- Personas con `PersonAvatar`; montos con `CurrencyField` al capturar y formato de moneda al mostrar; fechas legibles (`6 nov 2026`), nunca ISO.
- Colores solo con los tokens del tema (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`…) para que funcione en modo claro y oscuro.
- Espaciado consistente: `space-y-6 p-4 md:p-6` en la pantalla y `gap-4` en las rejillas.
- Animación con mesura: transiciones de Tailwind (`transition-colors`, `transition-transform`) bastan casi siempre; `motion` existe, pero agrega peso al módulo.

## Diseño responsivo

Diseña primero para un celular de 360 px y después amplía.

| Herramienta | Para qué |
|---|---|
| Prefijos de Tailwind `sm:` (640 px), `md:` (768 px), `lg:` (1024 px) | Cambiar columnas, tamaños y visibilidad por ancho |
| `useIsMobile(breakpoint = 768)` | Cambiar de componente según el ancho (tabla en escritorio y tarjetas en celular, `Dialog` en escritorio y `Sheet` en celular) |
| `useCoarsePointer()` / `useHasHover()` | Saber si el dispositivo es táctil o tiene mouse: activa gestos solo con dedo y acciones al pasar el mouse solo con mouse |
| `useKeyboardOpen()` / `useKeyboardInset()` | Saber si el teclado del teléfono está abierto y cuánto tapa, para que un pie fijo no quede debajo del teclado |
| `FilterToolbar`, `MobileFiltersSheet`, `ChipTabs` | Filtros y pestañas que se acomodan solos en el celular |

Reglas:

- Nada de desplazamiento horizontal de la pantalla. Una tabla ancha en celular se convierte en tarjetas.
- Objetivos táctiles de al menos 44 px de alto (`h-11`) en botones y filas tocables.
- Formularios en `grid grid-cols-1 gap-4 md:grid-cols-2`, con secciones (`FormSection`).
- En modales y hojas, el encabezado y el pie quedan fijos; solo el centro se desplaza.

```jsx
import { useIsMobile, useEntityList, EntityTable, Card, CardContent, Badge } from '@runly/ui'

function Ordenes({ onOpen }) {
  const isMobile = useIsMobile()
  const { data } = useEntityList('orden', { pageSize: 50 })
  if (!isMobile) return <EntityTable entity="orden" onView={onOpen} />
  const rows = data?.data ?? []
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Card key={r.id} className="cursor-pointer" onClick={() => onOpen(r)}>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.folio}</p>
              <p className="truncate text-sm text-muted-foreground">{r.cliente}</p>
            </div>
            <Badge variant="secondary">{r.estado}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

Props exactas de `EntityTable` y `useEntityList` en [Componentes de @runly/ui](/documentacion/desarrolladores/componentes).

## Gestos táctiles

Los mismos gestos que usan Chat, Inventario y Notas están en `@runly/ui`:

| Componente o hook | Gesto | Uso |
|---|---|---|
| `SwipeableRow` | Deslizar a la izquierda muestra hasta 3 acciones; deslizar a la derecha dispara una acción rápida; mantener presionado | Filas de lista en celular. Props: `rightActions` (`[{ key, label, icon, tone, onSelect }]`, `tone`: `default`, `primary` o `danger`), `onFullSwipeRight`, `fullSwipeLabel`, `fullSwipeIcon`, `onLongPress`. Con mouse no hace nada |
| `SwipeBackStack` | Arrastrar desde el borde izquierdo para volver (estilo iOS) | Navegación lista y detalle en celular. Props: `open`, `onBack`, `base`, `detail`; `ref.back()` anima la salida desde un botón |
| `useLongPress({ onLongPress, delay })` | Mantener presionado | Devuelve los manejadores de puntero para esparcir en el elemento: `<div {...longPress}>`. Vibra un poco al dispararse |
| `navigator.vibrate?.(10)` | Vibración corta | Confirmar un gesto. Siempre con `?.`: no existe en todos los navegadores |

Reglas:

- Todo lo que se hace con un gesto también debe poder hacerse con un botón o con el menú `...` (`ActionMenu`): los gestos no se ven.
- No captures gestos horizontales en contenedores que se desplazan en vertical sin fijar el eje (los componentes de arriba ya lo hacen).
- Respeta `prefers-reduced-motion`: Tailwind tiene `motion-reduce:` para quitar animaciones.

## Funciones del teléfono (app de Android)

La app de Android de Runly ya declara los permisos de cámara, micrófono, ubicación, vibración y notificaciones. Tu pantalla usa las APIs normales del navegador: la primera vez, Android le pregunta a la persona y después se recuerda la respuesta. En el navegador del celular funciona igual (requiere HTTPS).

| Necesitas | Usa | Si la persona niega el permiso |
|---|---|---|
| Tomar una foto | `CameraCaptureDialog` (`open`, `onOpenChange`, `onCapture(file)`, `fileName`); `onCapture` recibe un `File` JPEG que subes con `POST /<base>/files` | El diálogo muestra el error; ofrece también `FileUploader` para elegir de la galería |
| Leer un QR o código de barras | `BrowserMultiFormatReader` de `@zxing/browser` sobre un `<video>` | `Alert` con el motivo y un campo para escribir el código a mano |
| Ubicación | `navigator.geolocation.getCurrentPosition` (guárdala en un campo de ubicación del módulo) | Deja el campo vacío y explica cómo activarla |
| Grabar audio | `navigator.mediaDevices.getUserMedia({ audio: true })` + `MediaRecorder`; sube el resultado como archivo | `Alert` con el motivo |
| Avisar a alguien | El servicio `runly.notifications` desde la API del módulo ([Servicios y eventos](/documentacion/desarrolladores/servicios-y-eventos)); Runly lo entrega en la app y en el teléfono | — |
| Adjuntar documentos | `AttachmentsPanel` / `FileUploader` | — |

No disponible para módulos: NFC, Bluetooth, tareas en segundo plano ni ubicación con la app cerrada. Si el pedido lo requiere, dilo claramente y propone la alternativa (escanear un QR en lugar de leer una etiqueta NFC, por ejemplo).

## Dibujo, croquis, firmas y diagramas

La Pizarra de Runly (`runly.canvas`) y Studio no están disponibles para módulos: no tienen servicios ni componentes que tu pantalla pueda usar. Para dibujar dentro de tu módulo **no hace falta ninguna librería**: usa el elemento `<canvas>` del navegador con eventos de puntero, que funcionan con dedo, lápiz y mouse. Para diagramas que no se dibujan a mano (planos sencillos, distribución de lugares, flujos), usa SVG con JSX.

No agregues librerías de dibujo (konva, fabric, tldraw, excalidraw…): solo se pueden importar las de [Librerías disponibles](/documentacion/desarrolladores/librerias).

```jsx
import { useEffect, useRef } from 'react'
import { Button } from '@runly/ui'
import { Eraser, Save } from 'lucide-react'

export function Croquis({ onSave }) {
  const ref = useRef(null)
  const last = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ratio = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * ratio
    canvas.height = canvas.clientHeight * ratio
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = getComputedStyle(canvas).color // color del tema (text-foreground)
  }, [])

  const point = (e) => {
    const r = ref.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: e.pressure > 0 ? 1 + e.pressure * 3 : 2 }
  }
  const down = (e) => { ref.current.setPointerCapture(e.pointerId); last.current = point(e) }
  const move = (e) => {
    if (!last.current) return
    const p = point(e)
    const ctx = ref.current.getContext('2d')
    ctx.lineWidth = p.w
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }
  const up = () => { last.current = null }
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height) }
  const save = () => ref.current.toBlob((blob) => onSave(new File([blob], 'croquis.png', { type: 'image/png' })), 'image/png')

  return (
    <div className="space-y-3">
      <canvas
        ref={ref}
        className="h-80 w-full touch-none rounded-md border border-border bg-card text-foreground"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={clear}><Eraser className="h-4 w-4" />Limpiar</Button>
        <Button type="button" onClick={save}><Save className="h-4 w-4" />Guardar croquis</Button>
      </div>
    </div>
  )
}
```

- `touch-none` es obligatorio: sin él, el dedo desplaza la página en lugar de dibujar.
- Guarda el resultado como archivo del registro (`POST /<base>/files` con `entityId`, ver [API de los módulos](/documentacion/desarrolladores/api-modulos)) o en un campo de imagen. Si necesitas volver a editarlo, guarda además los trazos como JSON en un campo de texto largo.
- El mismo patrón sirve para firmas.

## Antes de entregar una pantalla

- [ ] Empieza con `PageHeader`/`ModulePage`, con icono y acción principal.
- [ ] Tiene estados de carga, vacío (con acción) y error.
- [ ] Se ve bien a 360 px, a 768 px y en escritorio, sin desplazamiento horizontal.
- [ ] En celular, las listas son tarjetas o `SwipeableRow`, y todo gesto tiene un botón equivalente.
- [ ] Solo usa tokens del tema y se ve bien en modo oscuro.
- [ ] Iconos con significado en botones, secciones, indicadores y estados vacíos.
- [ ] Si usa cámara, ubicación o micrófono, maneja el permiso negado.
- [ ] No importa librerías fuera de [Librerías disponibles](/documentacion/desarrolladores/librerias).
