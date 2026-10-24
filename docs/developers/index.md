---
title: Desarrollo de módulos en Runly
summary: Guía para extender con código los módulos creados con el Constructor de módulos — pantallas React, API de los módulos, relaciones, enlaces públicos, campos y librerías disponibles.
order: 0
---
Runly permite crear módulos sin código con el **Constructor de módulos** y extenderlos con código cuando hace falta: pantallas propias en React, integraciones con otros módulos o lógica de API.

Esta documentación está pensada para personas desarrolladoras **y para asistentes de IA** (Claude, Cursor, Copilot…). Cada página está disponible también como Markdown y el índice completo para IA está en [`/llms.txt`](https://runly.mx/llms.txt) (todo el contenido en un solo archivo: [`/llms-full.txt`](https://runly.mx/llms-full.txt)).

## Compatibilidad: ERP, Developer Hub y MCP

Estas páginas describen el código del ERP del que se generan. El Developer Hub
puede usar una revisión anterior de los paquetes compartidos. La etiqueta
`0.1.0` de un paquete no basta para demostrar compatibilidad: consulta el
`toolchainId`, la revisión de fuentes y los contratos de la conexión activa.
Los hashes de las copias documentales describen su contenido; no actualizan el
compilador ni las librerías instaladas del Hub.

El motor distingue tipos de módulo CORE, FEATURE, INTEGRATION y WEBSITE; eso no
autoriza a crearlos o publicarlos todos desde cualquier integración. El flujo
MCP crea proyectos `custom.*` dentro de los tenants concedidos. Sus contratos
de entidades, campos, relaciones, conexiones, servicios, eventos y automatizaciones
se consultan con las herramientas de documentación antes de validar y guardar.
Las relaciones externas y los servicios tienen catálogos explícitos: que exista
un módulo empresarial no significa que tenga un contrato accesible al generador.

Compilación, vista previa y ejecución en el ERP son comprobaciones distintas.
El compilador admite vistas de registros CARDS, CALENDAR, TIMELINE y REPORT además
de las vistas de formularios, tablas, detalle, páginas, dashboard y Kanban.
Comprueba por separado `preview.contract.views`: una vista compilable puede no
tener preview en el Hub. CUSTOM requiere además el contrato y flujo de compilación
aislada correspondiente; guardar una definición con extensiones no demuestra que
su código haya sido compilado o ejecutado. No confundas el build declarativo MCP
con el job CUSTOM del portal.

Las librerías y componentes de estas páginas pertenecen al ERP actual. Verifica
los exports y versiones del toolchain conectado antes de usarlos en el Hub.
La API empresarial del ERP y el MCP de Runly Developer son integraciones distintas:
las herramientas de desarrollo no consultan ni modifican automáticamente registros
empresariales. Consulta [MCP](/documentacion/desarrolladores/mcp) para conexión,
permisos y límites; un build, una versión y una solicitud de review no equivalen
a instalación, firma, aprobación o publicación oficial.

## Páginas

- [**Flujo con ZIP y modos de edición**](/documentacion/desarrolladores/flujo-zip): descargar el paquete, modo visual, modo mixto y modo desarrollador, revisión y vista previa antes de aplicar, volver al modo visual.
- [**Pantallas React**](/documentacion/desarrolladores/pantallas-react): vistas `CUSTOM`, registro de componentes, props, llamadas a la API y reglas de diseño.
- [**Componentes de @runly/ui**](/documentacion/desarrolladores/componentes): props, valores y ejemplos de cada componente que usan tus pantallas, y patrones de formulario e indicadores responsivos.
- [**Iconos**](/documentacion/desarrolladores/iconos): iconos de lucide recomendados por uso, con su nombre en español, y la lista completa.
- [**API de los módulos**](/documentacion/desarrolladores/api-modulos): endpoints que genera el Constructor para cada entidad, formatos de respuesta, filtros, errores y archivos.
- [**Relaciones**](/documentacion/desarrolladores/relaciones): relaciones entre entidades del módulo y con módulos del sistema (Flotilla, Inventario, Contactos…), integridad y búsqueda.
- [**Conexiones con módulos del sistema**](/documentacion/desarrolladores/conexiones): agregar campos o registros de tu módulo a las fichas de Inventario, Contactos, RR. HH. y Proyectos, con guardado atómico, búsqueda e integridad al borrar.
- [**Servicios y eventos entre módulos**](/documentacion/desarrolladores/servicios-y-eventos): leer, crear y actualizar registros de Calendario, Archivos, Notificaciones, Contactos, Inventario, Proyectos, Libro de cuentas, Flota y Finanzas personales con autorización del administrador, y reaccionar a lo que pasa en ellos.
- [**Automatizaciones del Constructor**](/documentacion/desarrolladores/automatizaciones): lo mismo sin programar: al guardar un registro o cuando pasa algo en otro módulo, agenda, notifica o registra información.
- [**Catálogo oficial de módulos**](/documentacion/desarrolladores/catalogo): instalar y actualizar módulos firmados desde Módulos > Disponibles, formato del índice y cómo se publica una versión.
- [**Enlaces y páginas públicas**](/documentacion/desarrolladores/enlaces-publicos): compartir una ficha o un formulario con personas sin cuenta; lo que genera el Constructor, `publicResources`, `api/public.js` y reglas de seguridad.
- [**Campos**](/documentacion/desarrolladores/campos): tipos de campo, su columna en la base de datos y su valor en la API.
- [**Librerías disponibles**](/documentacion/desarrolladores/librerias): qué puedes importar en tus componentes, con la versión exacta instalada en Runly, componentes de `@runly/ui` por uso y ejemplos.
- [**Trabajar con IA**](/documentacion/desarrolladores/ia): `AGENTS.md`, `llms.txt`, cómo pedirle cambios a un asistente y qué revisar antes de subir.
- [**Solución de problemas**](/documentacion/desarrolladores/solucion-problemas): errores al revisar, subir, instalar y usar un módulo, con su causa y solución.

## Inicio rápido

1. En Runly abre tu módulo en el **Constructor de módulos** y usa **Modo desarrollador > Descargar ZIP con guía**. El ZIP trae `GUIA_DESARROLLO_RUNLY.md` (personalizada para tu módulo), `AGENTS.md` (instrucciones para asistentes de IA) y la carpeta `docs/` con esta documentación para leerla sin internet.
2. Agrega tus pantallas en `components/` y una vista `views/<nombre>.custom.js` (ver *Pantallas React*).
3. Aumenta la versión en `module.manifest.js`, comprime la carpeta y ábrela con **Subir actualización**: Runly la revisa y muestra una vista previa **sin aplicar nada**.
4. Da clic en **Subir módulo** (o **Aplicar actualización**). Si es la primera vez, instálalo desde el **Catálogo de módulos**.

El ciclo completo, con lo que suele confundir, está en *Flujo con ZIP y modos de edición*.
