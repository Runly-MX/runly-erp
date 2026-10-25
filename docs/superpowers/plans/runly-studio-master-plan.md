# Runly Studio: plan maestro consolidado

Fecha: 2026-10-25. Identidad: `runly.studio`, módulo oficial de Runly ERP.

Flujo Git vigente por instrucción posterior del usuario: trabajar directamente en
`main`, sin ramas de tarea ni worktrees, y commitear los cambios propios. Las
referencias posteriores a la rama aislada describen la ejecución histórica inicial.

## Precedencia y conservación de fuentes

Este documento conserva íntegros el plan original, la ampliación de los seis paquetes y la consolidación aceptada, en los anexos A/B/C. Sus órdenes históricas se interpretan con las decisiones vigentes de esta primera sección y con las reglas del repositorio. No se necesita otro plan conceptual antes de implementar.

Orden de autoridad dentro de este plan: consolidación aceptada > ampliación > plan original. Las rutas y capacidades citadas en los anexos son objetivos o referencias que deben contrastarse con código actual.

## Precisiones efectivas

- Reutilización primero, abstracción después y distribución al final. No hay obligación de extraer geometría, colaboración, assets o exportación. Extraer únicamente con consumidores reales, semántica común y pruebas de caracterización. Documentar y continuar si no se justifica ninguna extracción.
- Auditar los seis paquetes, exports, versiones, alias legacy, consumidores, tarballs y CI antes de proponer infraestructura nueva. La matriz admite "Ningún paquete existente; responsabilidad interna de runly.studio".
- Comparar código interno Studio, utilidades internas ERP y paquete graphics independiente. Elegir el paquete solo por necesidad de distribución real y contrato estable. No alterar release scripts ni publicar para facilitar un prototipo.
- Fase 2: persistencia segura, Presence, cursores y propagación básica cuando la infraestructura y ACL lo permitan. La primera vertical puede completarse antes de estas capacidades, pero Fase 2 permanece abierta hasta validarlas.
- Fase 4: concurrencia compleja, recuperación y resolución sofisticada de conflictos. No desarrollar un CRDT propio ni describir revisiones como CRDT.
- Fase 2: dos o tres plantillas originales locales completamente editables. Fase 3: catálogo empresarial, proveedores externos, búsqueda, filtros, caché, licencias y atribución.
- Primera vertical: crear, insertar/modificar texto, formas e imágenes, guardar, reabrir editable y exportar PNG. El resto del MVP se entrega progresivamente; no hay botones ficticios.
- Formato propio Runly, versionado; renderer como adaptador. No persistir exclusivamente Fabric JSON, blobs ni URLs firmadas. Identidad empresarial y propietario son datos del servidor, viewport es personal.
- Evaluar por separado interacción en navegador, exportación en navegador y render automatizado/headless. El servicio servidor no es requisito de la primera vertical.
- Compatibilidad significa comportamientos observables comprobados, con escenarios y límites de cobertura. No significa equivalencia absoluta inferida de un build.
- UI de @runly/ui; API mediante @runly/sdk; código JavaScript y textos en español. Los motores pesados no entran en core/ui ni en el bundle inicial.
- Sin cambios destructivos, migraciones aplicadas modificadas, despliegues, publicación de paquetes o cambios a datos reales. Commits locales por responsabilidad, rama segura y preservación del trabajo ajeno.

## Seguimiento ejecutable

### Fase 0: descubrimiento y arquitectura

- [x] Verificar Git, remotos, commits y cambios locales; aislar rama/worktree.
- [x] Auditar contratos y distribución de los seis paquetes.
- [x] Revisar Canvas, Notes, POS, Canvas Social, Builder, Automatizaciones y Documents; declarar límites de inspección.
- [x] Matriz de responsabilidades y reutilización.
- [x] Baseline de pruebas gráficas, paquetes y Documents; pruebas adicionales de Automatizaciones.
- [x] Spike comparativo con escenas comunes, reapertura y PNG en navegador/headless.
- [x] ADR y documentación de arquitectura/contratos.
- [ ] Completar mediciones repetidas de memoria/FPS y validación de un servicio servidor; no bloquean la vertical.

### Fase 1: reutilización mínima segura

- [x] Decisión documentada: no extraer Canvas/POS/Notes ni crear @runly/graphics.
- [x] Conservar integración vigente Canvas/POS.
- [x] Crear únicamente contrato interno de documento Studio para API/cliente.
- [x] Verificar pruebas dirigidas de regresión y build.
- [x] Validar seis tarballs y consumidor independiente con reinstalación frozen, contratos Node y navegador; sin publicar.

### Fase 2: primera vertical y ampliación progresiva

- [x] Registro oficial, identidad PWA, permisos, ayuda y pantalla lazy.
- [x] Crear documento y tres plantillas editables.
- [x] Editar texto, formas e imágenes originales; mover/escalar/rotar.
- [x] Contrato versionado, acceso empresarial/propietario y auditoría transaccional.
- [x] Guardar, reabrir editable y exportar PNG con comprobación de píxeles.
- [x] Pruebas SQL desechables y UI real con identidad/storage de fixture.
- [ ] Validación instalada con auth y Storage reales en entorno autorizado.
- [ ] Compartidos: modelo de colaboradores, permisos por documento y acceso de colaboradores a originales.
- [ ] Realtime: autorizar canales desde API, revalidación/revocación y propagación sin sobrescribir cambios locales.
- [ ] Pruebas de dos usuarios: cursores, presencia, cambios distintos, conflicto, reconexión y revocación.
- [ ] Completar MVP: tamaños personalizados, pan/centrado, alineación, orden/capas/bloqueo, duplicar/copiar/pegar, undo/redo, atajos y JPG.
- [ ] Bloqueo común de navegación del shell ante cambios pendientes.

### Fase 3: biblioteca y catálogo

- [ ] Contratos de proveedores internos y externos; licencias y términos actuales antes de cada integración.
- [ ] Plantillas sistema/empresa/usuario, aplicación no destructiva y versiones con propietario definido.
- [ ] Búsqueda paginada, filtros, debounce, miniaturas separadas, caché con cuotas/evicción y deduplicación.
- [ ] Importación segura, atribución en exportaciones y fallos de proveedor probados.

### Fase 4: capacidades profesionales

- [ ] Fuentes controladas, tipografía, filtros, recortes/máscaras, guías y alineación avanzada.
- [ ] Evolución explícita del esquema a grupos/capas/multipágina con migraciones de documentos.
- [ ] SVG/PDF con fidelidad contrastada; no prometer PDF vectorial/CMYK antes de comprobarlo.
- [ ] Concurrencia avanzada, recuperación y conflictos con escenarios reproducibles.
- [ ] Presupuestos medidos de memoria, interacción, apertura y exportación.

### Fase 5: ecosistema

- [ ] Contrato Studio > FileAsset > Documents/LMS, sin duplicar el motor de plantillas ni su versionado.
- [ ] Render headless en la cola/worker existente con aislamiento de empresa y límites de recursos.
- [ ] Registrar servicios solo tras validar permisos, actor, idempotencia, auditoría, reintentos y fallos parciales.
- [ ] Probar finalización de curso > un certificado autorizado sin duplicados.
- [ ] Generación masiva y APIs/MCP/MirAI según contratos vigentes.

### Fase 6: IA opcional

- [ ] Evaluar asistencia de composición, texto, fondos, redimensionamiento e imágenes después de estabilizar el editor.
- [ ] Conservar operación sin API de pago obligatoria; credenciales siempre fuera del frontend.

## Puertas de avance y evidencias

La siguiente entrega ejecutable es completar el MVP y diseñar compartir/realtime sobre el contrato existente. La colaboración no puede activarse con un canal público o un topic nuevo sin autorización y revocación verificadas. La publicación de core/sdk es una decisión posterior; los packs locales y el consumidor independiente no publican.

Fuentes de resultados: [auditoría](../../architecture/runly-studio-audit.md), [núcleo compartido](../../architecture/runly-shared-graphics.md), [arquitectura](../../architecture/runly-studio-architecture.md), [ADR](../../architecture/adr-runly-studio-renderer.md), [verificación](../../architecture/runly-studio-verification.md).

## Anexo A: plan original conservado

# RUNLY STUDIO — Auditoría, arquitectura compartida e implementación progresiva

## ROL Y OBJETIVO

Actúa como arquitecto principal de software, especialista en React, motores de gráficos 2D, colaboración en tiempo real, sistemas empresariales multi-tenant, optimización web, diseño gráfico y aplicaciones self-hosted.

Vamos a desarrollar **Runly Studio**, un nuevo módulo oficial de Runly ERP para crear y editar diseños gráficos profesionales: flyers, posters, invitaciones, certificados, anuncios, tarjetas, publicaciones para redes sociales, menús, banners, folletos y material corporativo.

El nombre visible es **Runly Studio** y su identificador técnico será **`runly.studio`**.

Queremos aproximarnos progresivamente a la potencia de Canva, pero sin copiar su interfaz ni depender de servicios SaaS o licencias comerciales obligatorias.

**El primer objetivo NO es construir un clon completo de Canva. Es consolidar una arquitectura gráfica compartida y entregar una primera experiencia real y funcional de Studio.**

No te limites a redactar planes: inspecciona el código actual, toma decisiones fundamentadas, implementa las primeras fases, escribe pruebas y documenta resultados.

## 1. REPOSITORIOS Y ESTADO ACTUAL

El proyecto está distribuido entre la organización `Runly-MX` y la cuenta personal `raulbellosom`.

Repositorios conocidos:

- `Runly-MX/runly-erp` — Monorepo principal; prioridad absoluta.
- `Runly-MX/runly-web` — Landing Astro, posiblemente útil en fases futuras.
- `raulbellosom/canvasocial` — Prototipo previo de editor gráfico colaborativo.
- `raulbellosom/Atlas-Web-Builder` — Editor visual React utilizado por el ecosistema.
- `raulbellosom/Atlas-ERP` — Antecedente histórico; NO asumir que es el código actual.
- `runly-developer-hub` — Buscar su ubicación real y permisos; únicamente relevante para futuras integraciones.
- Cualquier otro repositorio local/remoto relacionado que encuentres.

IMPORTANTE: El 25 de octubre de 2026 se publicaron aproximadamente 49 commits nuevos en `runly-erp`. En la revisión de GitHub el HEAD observado fue:

`d534a8903238e935ebfd033003386a5d17e5dd57`

La comparación con `322bc7ec5d0062148de30cc6e3e90240c2a6ffcc` mostró 49 commits y 216 archivos modificados/agregados/eliminados.

**No trabajes suponiendo que ese SHA sigue siendo el HEAD.**

Antes de modificar nada:

1. Comprueba repositorios locales, remotos y ramas actuales.
2. Ejecuta `git status`, inspecciona los últimos commits y comprueba diferencias con el remoto cuando sea seguro.
3. No sobrescribas trabajo sin confirmar ni descartes cambios locales o de otras sesiones.
4. Identifica el código más reciente y las reglas del repositorio.
5. Analiza los cambios recientes de Automatizaciones y Documentos.
6. Revisa instrucciones `AGENTS.md`, convenciones de IA, pruebas, formateo, límites de archivos y arquitectura.

No hagas `git reset --hard`, force push, limpieza destructiva ni despliegues automáticos.

## 2. AUDITORÍA PROFUNDA OBLIGATORIA

### 2.1 Runly Canvas

Investiga los componentes actuales de `runly.canvas`, especialmente:

- `apps/desktop/src/modules/runly.canvas/engine/Canvas2DRenderer.js`
- `apps/desktop/src/modules/runly.canvas/components/CanvasViewport.jsx`
- `apps/desktop/src/modules/runly.canvas/screens/BoardEditor.jsx`
- `apps/desktop/src/modules/runly.canvas/hooks/useCanvasRealtime.js`
- `apps/desktop/src/modules/runly.canvas/hooks/useCanvasData.js`
- `apps/desktop/src/modules/runly.canvas/hooks/useLibraries.js`
- `apps/desktop/src/modules/runly.canvas/lib/exportPage.js`
- `apps/desktop/src/modules/runly.canvas/lib/realtimeCache.js`
- `apps/api/src/routes/canvas/`
- `packages/sdk/src/domains/canvas.js`

Analiza:

- Modelo Board/Page/Layer/Object.
- Tipos de objetos y geometría.
- Sistema de coordenadas, transformaciones y zoom.
- Herramientas de selección, movimiento, rotación y resize.
- Renderizado y hit-testing.
- Historial y operaciones batch.
- Revisiones y resolución de conflictos.
- Presence, Broadcast y cursores colaborativos.
- Persistencia, versiones y snapshots.
- Subida de imágenes y archivos.
- Bibliotecas personales/empresariales.
- Importación SVG, ZIP y Excalidraw.
- Sanitización, seguridad y aislamiento entre empresas.
- Exportaciones y limitaciones.

**Distingue qué es reutilizable y qué pertenece exclusivamente al editor de diagramas.**

No reemplaces el motor actual sin una justificación técnica y pruebas de compatibilidad.

### 2.2 Runly Notes

Inspecciona:

- `runly.notes/components/CanvasEditor.jsx`
- `runly.notes/lib/SupabaseCanvasSync.js`
- `runly.notes/lib/canvasLayers.js`
- `runly.notes/lib/canvasExport.js`
- `runly.notes/lib/canvasImages.js`
- Su integración con Excalidraw.
- El uso real de Yjs en el editor de texto.

Compara su estrategia de sincronización con la de `runly.canvas`.

No confundas el CRDT del texto de Notas con el sistema de colaboración del lienzo Excalidraw.

Identifica herramientas compartibles sin romper las notas existentes.

### 2.3 Runly POS

Revisa el planificador y su integración con Canvas:

- `runly.pos/components/FloorPlannerStage.jsx`
- `runly.pos/components/FloorOperationalStage.jsx`
- Sus adapters de objetos.
- Los custom drawers del renderer.

Esta integración es una prueba de que el motor de Canvas fue diseñado para soportar consumidores externos.

Preserva esa compatibilidad.

### 2.4 Automatizaciones nuevas

Audita el código más reciente de:

- `runly.automations`
- `runly.core/components/builder/canvas/`
- `runly.core/lib/flowModel.js`
- `runly.core/lib/canvasLayout.js`
- `packages/module-compiler/src/automations.js`
- `packages/module-engine/src/automation-runtime.js`
- `apps/api/src/services/system-automations-service.js`
- `apps/api/src/services/automation-worker-service.js`
- `apps/api/src/services/automation-jobs-service.js`
- `apps/api/src/services/module-services/`
- `apps/worker/src/index.js`

Lee especialmente:

`docs/superpowers/specs/2026-10-25-automation-canvas-and-webhooks-design.md`

El editor de automatizaciones es un workspace de nodos y conexiones; NO asumir que utiliza el renderer de Runly Canvas.

Analiza reutilización de geometría, gestos, viewport, patrones de inspector y componentes.

Más adelante Studio debe poder exponer operaciones automatizables como generar imágenes, aplicar plantillas y exportar diseños.

No agregues acciones al catálogo sin validar contratos, permisos, ámbito empresarial e idempotencia.

### 2.5 Motor nuevo de Documentos

Audita:

- `apps/api/src/routes/documents/document-engine.js`
- `apps/api/src/routes/documents/kinds/kind-registry.js`
- `apps/api/src/routes/documents/document-file-template-service.js`
- `apps/api/src/services/document-templates/`
- `runly.documents`
- Las integraciones actuales de LMS e Inventario.

Lee:

`docs/superpowers/plans/2026-10-25-documents-v2-template-engine.md`

Nuestro objetivo futuro es que Runly Studio pueda generar recursos visuales para Documentos, certificados LMS y otros módulos.

No dupliques el motor de plantillas.

Comprueba qué partes están efectivamente implementadas, qué partes faltan y qué migraciones están pendientes.

### 2.6 Canvas Social

Inspecciona `raulbellosom/canvasocial`.

La inspección previa encontró Fabric.js 6.9.1 en el código, aunque su README menciona Konva.

Revisa:

- Su implementación real de Fabric.js.
- Herramientas de edición.
- Sistema de capas.
- Serialización.
- Renderizado de texto e imágenes.
- Operaciones colaborativas.
- Exportación.
- Estado del código, pruebas y problemas técnicos.

Evalúa patrones reutilizables.

NO migres Appwrite ni uses su modelo de autenticación dentro de Runly.

NO copies código indiscriminadamente.

### 2.7 Atlas Web Builder

Revisa el paquete instalado y el repositorio original.

Identifica patrones genéricos de:

- Componentes visuales.
- Drag and drop.
- Inspectores.
- Manejo de recursos.
- Historial.
- Undo/redo.
- Gestión de plantillas.

Solo extrae o reutiliza componentes si la compatibilidad y propiedad intelectual lo permiten.

### Resultado exigido

Crear:

`docs/architecture/runly-studio-audit.md`

Debe incluir:

1. Arquitectura actual verificada.
2. Repositorios y commits inspeccionados.
3. Inventario de tecnologías.
4. Diagrama de dependencias.
5. Matriz de reutilización.
6. Riesgos de regresión.
7. Dependencias o migraciones pendientes.
8. Decisiones fundamentadas.
9. Alternativas descartadas.
10. Secuencia de implementación.

No describas como existente ninguna capacidad que solo figure en una propuesta o documento histórico.

## 3. DECISIÓN DE ARQUITECTURA GRÁFICA

Queremos separar un núcleo compartido de los renderers especializados.

Arquitectura conceptual:

```
Runly Shared Graphics Infrastructure
 |
 +-- Scene contracts / geometry / transforms
 +-- Assets / metadata / attribution
 +-- Permissions / tenant isolation
 +-- Collaboration / presence / versions
 +-- Serialization / export contracts
 |
 +-- Runly Canvas
 |    +-- Technical Canvas2D renderer
 |
 +-- Runly Studio
 |    +-- Professional graphic editor
 |
 +-- Runly Notes
 |    +-- Excalidraw adapter
 |
 +-- POS / LMS / Documents / future consumers
```

No es obligatorio que todos los consumidores utilicen la misma representación interna o el mismo renderer.

**Evita una abstracción universal innecesaria.**

Separa los conceptos genéricos y establece adaptadores explícitos entre los modelos.

No agregues dependencias de Studio a Canvas, POS o Notas.

### Evaluación Fabric.js

Compara técnicamente:

A. Extender el Canvas2DRenderer actual.

B. Utilizar Fabric.js como renderer especializado para Studio.

Considera:

- Edición de texto.
- Grupos y transformaciones.
- Imágenes, recortes y máscaras.
- SVG.
- Filtros y efectos.
- Rendimiento con muchas capas.
- Exportación a formatos vectoriales/raster.
- Serialización y estabilidad.
- Colaboración multiusuario.
- Tamaño de bundles.
- Mantenimiento futuro.
- Licencia y restricciones de distribución.

Construye un pequeño spike aislado con pruebas representativas si hace falta.

Fabric.js es el candidato preferido para Studio, pero adopta la alternativa con mejor resultado medible.

Documenta la decisión en un ADR.

## 4. FASE 1 — ABSTRACCIÓN SEGURA DEL NÚCLEO COMPARTIDO

Esta es la PRIMERA fase de implementación obligatoria.

Identifica los componentes existentes que pueden compartirse sin alterar su comportamiento.

Candidatos:

- Geometría.
- Transformaciones.
- Viewport.
- Utilidades de selección.
- Contratos de escena.
- Operaciones de objetos.
- Gestión de assets.
- Presencia y colaboración.
- Normalización y serialización.
- Servicios comunes de exportación.

Extrae piezas pequeñas, cohesivas y comprobables.

Puedes crear un workspace package como `@runly/graphics` si aporta un beneficio real, o mantener componentes genéricos en una ubicación compartida existente si encaja mejor con la arquitectura.

No crees un paquete nuevo solamente por organización estética.

Reglas:

1. Usa interfaces explícitas.
2. Evita dependencias circulares.
3. Separa renderer de persistencia.
4. Separa modelo de dominio de elementos gráficos.
5. Evita estados globales compartidos entre documentos.
6. Mantén los imports existentes con adaptadores o reexports cuando sea necesario.
7. Preserva compatibilidad con Canvas y POS.
8. No hagas un refactor completo de Notes.
9. Conserva autenticación, permisos y contratos de API.
10. Mantén pruebas existentes y agrega pruebas de caracterización.

Objetivo verificable:

**Los módulos existentes deben comportarse exactamente igual antes y después de la extracción.**

Crear:

`docs/architecture/runly-shared-graphics.md`

No avances a Studio mientras existan regresiones causadas por la abstracción.

## 5. FASE 2 — BASE REAL DE RUNLY STUDIO

Registrar un módulo oficial con:

- Nombre: `Runly Studio`
- Module key: `runly.studio`
- Categoría: productividad / creatividad, según las convenciones reales del catálogo.
- Interfaz española.
- Navegación dentro del ERP.
- Pantallas lazy-loaded.
- Ayuda integrada.

Reutiliza las convenciones de:

- `apps/api/src/manifests/official/`
- `apps/desktop/src/app/ModuleOutlet.jsx`
- `apps/desktop/src/app/module-screen-resolver.js`
- `packages/sdk`
- `packages/ui`
- Catálogo de permisos y sistema de módulos.

No desarrolles Studio como un módulo RME3 generado automáticamente si eso limita las operaciones gráficas.

Debe ser un módulo oficial con integración compatible con la plataforma modular.

### Pantalla principal

Crear una pantalla de inicio con:

- Crear diseño.
- Diseños recientes.
- Mis diseños.
- Compartidos conmigo.
- Plantillas.
- Borradores.
- Búsqueda.
- Filtros.
- Duplicación y eliminación con permisos.

Comenzar con plantillas locales propias.

### Editor MVP

Implementar un editor visual funcional con:

- Página de tamaño fijo.
- Tamaños comunes y personalizados.
- Zoom, pan y centrar página.
- Inserción de texto.
- Rectángulos, círculos, líneas y otras formas básicas.
- Inserción de imágenes propias.
- Selección de uno o varios objetos.
- Mover, escalar y rotar.
- Alineación básica.
- Capas y orden Z.
- Mostrar/ocultar y bloquear capas.
- Duplicar, eliminar, copiar y pegar.
- Atajos de teclado.
- Undo/redo.
- Guardado.
- Reapertura fiel.
- Exportar PNG y JPG.
- Preparación de contratos para SVG/PDF.

No simules funcionalidades con botones sin comportamiento real.

### Calidad del editor

La experiencia debe sentirse como una aplicación especializada, no como un formulario ERP colocado alrededor de un canvas.

Diseñar:

- Barra superior compacta.
- Herramientas laterales.
- Biblioteca a la izquierda.
- Lienzo centrado.
- Inspector contextual a la derecha.
- Controles de zoom.
- Capas accesibles.
- Estado de guardado.
- Adaptación responsive.

Usa tokens y componentes reales de `@runly/ui`.

No copies el diseño exacto de Canva.

## 6. MODELO DE DATOS

Diseña un formato de documento versionado y portable.

Debe representar:

- Identidad y propietario del documento.
- Empresa.
- Tipo de documento.
- Tamaño, unidad y orientación.
- Páginas.
- Objetos editables.
- Capas y grupos.
- Geometría.
- Estilos.
- Tipografía.
- Referencias a assets.
- Variables dinámicas.
- Metadatos de plantilla.
- Versión del esquema.

Separar el viewport personal del contenido persistido.

Evita almacenar blobs binarios dentro del JSON.

No dependas de URLs firmadas permanentes.

Las imágenes deben referenciar archivos autorizados mediante FileAsset u otro mecanismo existente.

Evalúa si convienen documentos JSON versionados, entidades relacionales o un modelo híbrido.

No reutilices directamente las tablas de Canvas si eso contamina ambos dominios.

### Migraciones

- Solo migraciones forward.
- No editar migraciones ya aplicadas.
- No borrar ni modificar información histórica.
- No ejecutar migraciones contra bases reales sin autorización.
- No realizar `db:reset`, `db:fresh` ni seeds destructivos.
- Ejecutar `prisma generate` cuando corresponda.
- Dejar instrucciones explícitas de despliegue.

Incluir pruebas de aislamiento empresarial y permisos por documento.

## 7. COLABORACIÓN REALTIME

Reutiliza Supabase Realtime y la infraestructura ya probada de Runly.

Requisitos:

- Usuarios presentes.
- Cursores remotos.
- Selecciones remotas.
- Cambios en objetos.
- Cambios de capas.
- Persistencia de operaciones.
- Reconexión.
- Convergencia de estado.
- Resolución de conflictos.
- Revocación de acceso.
- Edición concurrente.

Evalúa reutilizar los contratos y patrones de `useCanvasRealtime` y la sincronización de Notas.

No copies ambos sistemas.

Construye pruebas con dos clientes:

1. Ambos abren el mismo documento.
2. Uno mueve un objeto.
3. El segundo recibe el cambio.
4. Ambos modifican objetos diferentes.
5. Ambos intentan modificar el mismo objeto.
6. Un cliente pierde conexión y vuelve.
7. Se revoca el permiso de un colaborador.
8. Se verifica persistencia después de recargar.

Para texto simultáneo dentro de un objeto, evalúa Yjs u otra estrategia especializada solo si el MVP lo requiere.

No describas un sistema de revisiones por objeto como si fuera un CRDT.

## 8. BIBLIOTECA DE RECURSOS

La biblioteca debe ser un servicio compartible, no una descarga masiva de assets.

Fuentes candidatas:

- Iconify.
- Tabler Icons.
- Openverse.
- Google Fonts.
- Pixabay.
- Unsplash, si sus términos de API permiten el caso de uso.
- Bibliotecas empresariales ya existentes en Canvas.

Verifica licencias, términos, atribuciones y restricciones actuales antes de implementar cada proveedor.

**No asumas que "gratis" significa que se puede redistribuir, almacenar o utilizar comercialmente sin condiciones.**

### Arquitectura

Crear contratos para proveedores de recursos:

- Búsqueda.
- Paginación.
- Miniaturas.
- Metadatos.
- Información de licencia.
- Atribución.
- Resolución del recurso original.
- Disponibilidad.
- Restricciones de almacenamiento y exportación.

Empezar con proveedores que puedan usarse legalmente y sin credenciales de pago obligatorias.

Si una API requiere clave, hacer la integración opcional y configurar la clave del lado del servidor.

Nunca incluir tokens en el frontend.

### Optimización

- Búsqueda bajo demanda.
- Debounce.
- Paginación.
- Virtualización.
- Lazy loading.
- Miniaturas separadas.
- Caché configurable.
- Deduplificación.
- Compresión de vistas previas.
- Límites de memoria.
- Evicción de caché.
- Carga del original únicamente cuando corresponda.

No descargar catálogos completos.

### Fidelidad de imágenes

MUY IMPORTANTE:

No comprimir destructivamente los archivos originales del usuario sin su consentimiento.

Conservar:

- Original.
- Dimensiones.
- Tipo MIME.
- Metadatos necesarios.
- Referencia permanente al recurso autorizado.

Generar miniaturas por separado.

No exportar un diseño para impresión utilizando una miniatura de baja resolución.

Verificar orientación de imágenes, transparencia, perfiles de color cuando corresponda y resolución efectiva.

## 9. PLANTILLAS

Crear un catálogo inicial pequeño pero de buena calidad.

Categorías prioritarias:

- Flyer.
- Poster.
- Invitación.
- Publicación cuadrada.
- Historia vertical.
- Banner horizontal.
- Certificado.
- Tarjeta de presentación.
- Menú.

No insertar imágenes con licencias inciertas.

Usar inicialmente diseños propios basados en:

- Tipografía.
- Formas.
- Gradientes.
- Iconos de licencias compatibles.
- Composiciones gráficas originales.

Las plantillas deben ser documentos nativos editables.

Implementar:

- Metadatos.
- Categorías.
- Miniaturas.
- Búsqueda.
- Aplicación de plantilla.
- Duplicación.
- Distinción entre plantillas del sistema, empresa y usuario.

No exigir descargar todas las plantillas para abrir Studio.

## 10. EXPORTACIÓN PROFESIONAL

Diseña un contrato de exportación independiente del renderer.

Prioridad:

1. PNG.
2. JPG.
3. SVG cuando la representación lo permita.
4. PDF.
5. Exportación multipágina.
6. PDF de alta calidad para impresión.

Evita rasterizar indiscriminadamente cuando el formato admita vectores y texto.

No anuncies PDF vectorial ni CMYK profesional hasta demostrarlo en pruebas.

Diseñar límites seguros:

- Dimensiones.
- Memoria.
- Tamaño de documento.
- Número de objetos.
- Tiempo de procesamiento.
- Cantidad de páginas.

Para exportaciones grandes, utilizar workers existentes y colas, sin bloquear el proceso principal de la API.

No introducir un worker adicional si el actual puede soportarlo correctamente.

## 11. INTEGRACIÓN CON RUNLY DOCUMENTS

Runly Studio no debe sustituir a `runly.documents`.

Studio diseña composiciones visuales.

Documentos administra plantillas documentales y archivos generados.

Establecer contratos para que Studio pueda:

- Generar una imagen desde una plantilla.
- Renderizar contenido con variables.
- Producir recursos para un certificado.
- Adjuntar el resultado a otro módulo.
- Guardar el recurso mediante Files.

Evaluar cómo integrarlo con el `kind-registry` actual sin forzar los diseños de Studio a un formato DOCX/PPTX ni duplicar el sistema de versiones.

Preparar un primer ejemplo de plantilla de certificado con datos simulados.

No consultar información empresarial real desde una plantilla sin autorización.

## 12. INTEGRACIÓN CON AUTOMATIZACIONES

Revisar cuidadosamente el nuevo motor de `runly.automations`.

Diseñar futuros servicios empresariales como:

- `runly.studio:designs.render`
- `runly.studio:templates.apply`
- `runly.studio:exports.create`

Estos nombres son propuestas; alinearlos con las convenciones y contratos reales antes de registrarlos.

Escenario de ejemplo:

Cuando un alumno complete un curso LMS:

1. Se emite el evento autorizado.
2. La automatización selecciona una plantilla.
3. Studio reemplaza variables.
4. Renderiza el certificado.
5. Guarda el resultado en Files.
6. Documentos o LMS lo vincula al registro.
7. Se notifica al usuario correspondiente.

Requisitos:

- Idempotencia.
- Auditoría.
- No ejecutar con permisos superiores a los concedidos.
- Validar pertenencia a la empresa.
- Manejo de reintentos.
- Evitar duplicados.
- Manejo de fallos parciales.
- Colas para operaciones pesadas.

No modificar el compilador de automatizaciones en la primera fase a menos que una integración mínima demostrable lo exija.

Documentar la integración antes de activarla.

## 13. SEGURIDAD

Studio procesará contenido que podría ser malicioso.

Evaluar y cubrir:

- SVG con scripts o referencias externas.
- URLs de imágenes.
- SSRF.
- Archivos excesivamente grandes.
- ZIP bombs.
- Documentos JSON manipulados.
- XSS.
- Acceso cruzado entre empresas.
- Acceso a recursos sin permiso.
- Exposición de URLs firmadas.
- Fugas por canales realtime.
- Exportaciones concurrentes.
- Path traversal.
- Caché compartida entre empresas.
- Datos privados incrustados en plantillas públicas.

Reutiliza servicios de seguridad existentes.

No agregues endpoints públicos sin una necesidad validada.

## 14. RENDIMIENTO

Studio debe funcionar bien en instalaciones self-hosted con recursos modestos.

Principios:

- Edición interactiva principalmente en el cliente.
- Carga lazy del editor.
- Separación de paquetes pesados.
- Assets bajo demanda.
- Operaciones ligeras de sincronización.
- Consultas paginadas.
- Guardado incremental cuando tenga sentido.
- Cache de miniaturas.
- Evitar rerenders React durante cada movimiento del puntero.
- Liberar recursos gráficos y listeners al desmontar.

Crear pruebas con escenas pequeñas, medianas y grandes.

Medir:

- Tiempo de apertura.
- Tiempo de carga de editor.
- Tamaño de JavaScript.
- Memoria.
- FPS durante arrastre.
- Latencia de guardado.
- Tráfico realtime.
- Calidad de exportación.

Definir presupuestos de rendimiento a partir de mediciones reales, no de cifras inventadas.

No incorporar librerías grandes al bundle inicial del ERP.

## 15. UX, ACCESIBILIDAD Y CALIDAD

La aplicación deberá seguir los patrones modernos de Runly.

- Interfaz en español.
- Estilo coherente con `@runly/ui`.
- Temas claro y oscuro.
- Navegación por teclado.
- Controles accesibles.
- Estados vacíos.
- Estados de carga.
- Errores recuperables.
- Confirmaciones para acciones destructivas.
- Diseño adaptable a escritorio y tablet.
- Funciones básicas disponibles en pantallas táctiles.

Evita controles que únicamente funcionen por hover.

Para el editor de diseño, optimiza principalmente la experiencia desktop sin inutilizar la interfaz en pantallas pequeñas.

## 16. ESTRATEGIA DE PRUEBAS

Antes de modificar código, identifica y ejecuta un baseline de las suites afectadas.

Agregar pruebas en cada fase.

### Núcleo gráfico

- Geometría.
- Transformaciones.
- Serialización.
- Operaciones de objetos.
- Adapters.
- Compatibilidad con Canvas y POS.

### Studio

- Crear documento.
- Editar elementos.
- Guardar y reabrir.
- Undo/redo.
- Capas.
- Subida de archivos.
- Permisos.
- Aislamiento por empresa.
- Exportación.

### Realtime

- Dos clientes.
- Ediciones concurrentes.
- Conflictos.
- Reconexión.
- Revocación.

### Biblioteca

- Búsqueda paginada.
- Proveedor no disponible.
- Recursos inválidos.
- Licencias.
- Importación segura.
- Caché.

### Integración

- Canvas no cambia su comportamiento.
- POS no presenta regresiones.
- Notas conserva Excalidraw.
- Automatizaciones existentes funcionan.
- Documents no pierde contratos.
- SDK y manifests siguen siendo válidos.

Usa `node --test`, ESLint, Playwright y los comandos de build existentes que correspondan.

No marques como aprobado algo que no se ejecutó.

Si alguna prueba requiere infraestructura no disponible, declara claramente el bloqueo.

## 17. PLAN DE EJECUCIÓN

Ejecutar en este orden:

### Fase 0 — Descubrimiento y arquitectura

- Auditoría profunda.
- Inventario de repositorios.
- Baseline de pruebas.
- Comparación de motores.
- ADR y arquitectura.
- Identificación de migraciones pendientes.

Entregable: documentación verificable y plan técnico concreto.

### Fase 1 — Núcleo compartido

- Extraer funcionalidades genéricas.
- Crear contratos.
- Implementar adapters cuando sean necesarios.
- Mantener compatibilidad.
- Ejecutar regresión.

Entregable: infraestructura compartida real, probada, sin cambios visuales innecesarios.

### Fase 2 — Runly Studio MVP

- Registro oficial.
- Pantalla de inicio.
- Editor gráfico funcional.
- Documento persistente.
- Herramientas esenciales.
- Guardado y exportaciones iniciales.
- Permisos y pruebas.

Entregable: primer diseño real creado, guardado, reabierto y exportado desde Runly.

### Fase 3 — Biblioteca y plantillas

- Proveedores de recursos.
- Biblioteca compartida.
- Licencias y atribuciones.
- Plantillas originales.
- Optimización y caché.

Entregable: catálogo funcional, sin descarga masiva ni dependencia obligatoria de pago.

### Fase 4 — Capacidades profesionales

- Tipografía avanzada.
- Filtros.
- Recortes y máscaras.
- Alineación avanzada.
- Guías.
- Multipágina.
- Exportación profesional.
- Colaboración avanzada.

Entregable: editor más completo, con calidad visual verificable.

### Fase 5 — Ecosistema empresarial

- Integración con Documents.
- Certificados LMS.
- Variables empresariales.
- Integración con Automatizaciones.
- Generación masiva.
- Services/API/MirAI/MCP según contratos y autorización.

Entregable: diseños gráficos generados automáticamente desde procesos empresariales.

### Fase 6 — IA opcional

Evaluar:

- Asistente de diseño.
- Generación de layouts editables.
- Reescritura de textos.
- Eliminación de fondos.
- Redimensionamiento inteligente.
- Generación de imágenes.

Todas las capacidades de IA deben ser opcionales.

No hacer obligatoria una API de pago.

No implementar la fase 6 antes de tener una base gráfica estable.

## 18. ALCANCE DE ESTA EJECUCIÓN

**Comienza ahora con Fase 0 y Fase 1.**

No te detengas después de redactar documentación: implementa la abstracción segura y verifica su funcionamiento.

Si las Fases 0 y 1 terminan correctamente, continúa con la estructura y una primera vertical funcional de la Fase 2, siempre que no comprometa las regresiones ni requiera modificar una infraestructura productiva.

No intentes completar artificialmente las seis fases en una sola sesión.

Las Fases 3 a 6 deberán quedar como roadmap con tareas técnicas detalladas y dependencias identificadas.

Los entregables de cada fase deben funcionar de manera autónoma y no depender de código sin terminar de la siguiente fase.

Si descubres que una decisión técnica previa es incorrecta, corrígela con evidencia y documenta el cambio.

## 19. DISCIPLINA DE DESARROLLO

Aplicar:

- DRY sin sobreabstracción.
- Funciones y componentes pequeños.
- Responsabilidad única.
- APIs explícitas.
- Buen manejo de errores.
- Refactor seguro.
- Código consistente con las reglas del repositorio.
- Pruebas automatizadas.
- Documentación actualizada.
- Sin mocks permanentes en funcionalidad de producción.
- Sin secretos en código.
- Sin dependencias SaaS obligatorias.

Trabaja en una rama segura dedicada a Studio cuando el estado local lo permita.

No mezcles cambios ajenos de otras sesiones.

Hacer commits coherentes por fase o responsabilidad, con mensajes descriptivos según las convenciones del proyecto.

No subir a `main` directamente ni hacer force push.

No desplegar, aplicar migraciones productivas, reiniciar servicios productivos ni modificar datos reales sin autorización.

No instalar ni cambiar dependencias mayores innecesariamente.

## 20. DOCUMENTOS DE ENTREGA

Crear o actualizar:

- `docs/architecture/runly-studio-audit.md`
- `docs/architecture/runly-shared-graphics.md`
- `docs/architecture/runly-studio-architecture.md`
- `docs/superpowers/plans/runly-studio-master-plan.md`
- ADR de selección de renderer.
- Documentación de contratos compartidos.
- Documentación de pruebas y benchmarks.
- Estado de avance en el seguimiento de tareas existente.

Usar rutas diferentes solamente si las convenciones reales del repositorio lo requieren.

No duplicar innecesariamente documentación.

## 21. CRITERIOS DE ACEPTACIÓN

Consideraré exitosa la primera ejecución cuando:

1. La arquitectura actual esté auditada y documentada con referencias al código.
2. Los nuevos commits de Automatizaciones y Documentos estén considerados.
3. Exista una decisión razonada sobre Fabric.js frente al renderer actual.
4. La primera abstracción reutilizable esté implementada.
5. Canvas continúe funcionando.
6. POS continúe utilizando sus adapters.
7. Notes y Excalidraw no tengan regresiones.
8. Las pruebas relevantes aprueben.
9. Se haya identificado cómo registrar `runly.studio`.
10. Exista una vertical funcional de Studio si el estado técnico permite avanzar sin comprometer lo anterior.
11. Las fases siguientes estén planificadas con entregables verificables.
12. El repositorio quede limpio respecto a tus propios cambios o con pendientes expresamente documentados.

## 22. REPORTE FINAL OBLIGATORIO

Al terminar, entrega:

**A. Hallazgos**
Qué encontraste realmente en cada repositorio.

**B. Arquitectura**
Qué componentes se comparten y cuáles mantienen motores especializados.

**C. Implementación**
Archivos creados/modificados y funcionalidades terminadas.

**D. Compatibilidad**
Qué módulos se verificaron y cuál fue el resultado.

**E. Pruebas**
Comandos ejecutados, cantidades, fallos, omisiones y limitaciones.

**F. Commits**
SHA de los commits generados, rama y estado de sincronización.

**G. Pendientes**
Qué sigue, en qué orden y por qué.

**H. Demostración**
Cómo abrir o probar Studio, si ya existe una vertical funcional.

**I. Riesgos**
Migraciones pendientes, decisiones técnicas abiertas y riesgos de despliegue.

No reportes éxito si existen fallos ocultos.

No afirmes que implementaste algo que únicamente documentaste.

---

## INSTRUCCIÓN FINAL

Empieza inspeccionando el entorno y el código actual.

Toma decisiones técnicas autónomas siempre que estén sustentadas en evidencia.

No necesito una explicación genérica sobre cómo construir un editor de diseño: necesito código implementado y una arquitectura mantenible.

**Prioridad absoluta: aprovechar correctamente la infraestructura existente de Runly, evitar duplicaciones y preparar Runly Studio para crecer hasta convertirse en una herramienta profesional de diseño gráfico integrada al ERP.**

Ejecuta ahora Fase 0 y Fase 1; si ambas quedan verificadas, continúa con el primer flujo completo y funcional de Fase 2.

Procede.


## Anexo B: ampliaci?n conservada

# AMPLIACIÓN OBLIGATORIA — RUNLY STUDIO Y LOS SEIS PAQUETES COMPARTIDOS

Esta instrucción complementa el plan maestro de Runly Studio y tiene prioridad sobre cualquier propuesta de crear nuevos paquetes compartidos sin una auditoría previa.

## 1. Contexto

Runly ya distribuye seis paquetes privados mediante GitHub Packages:

- `@runly/core`
- `@runly/ui`
- `@runly/sdk`
- `@runly/module-engine`
- `@runly/module-compiler`
- `@runly/preview-runtime`

Los nombres internos `@runly/*` se publican mediante alias bajo `@runly-mx/*`.

Audita exhaustivamente sus implementaciones actuales y sus contratos públicos antes de crear infraestructura gráfica nueva.

Consulta especialmente:

- `packages/core/`
- `packages/ui/`
- `packages/sdk/`
- `packages/module-engine/`
- `packages/module-compiler/`
- `packages/preview-runtime/`
- `shared-packages.release.json`
- `scripts/shared-package-release.mjs`
- `scripts/lib/shared-package-release.mjs`
- `scripts/verify-shared-consumer.mjs`
- Las acciones de GitHub responsables de publicarlos.
- Los consumidores reales de estos paquetes.

Revisa también los contratos de compatibilidad `@atlas/*` donde todavía existan.

## 2. Auditoría de responsabilidades

Construye una matriz indicando, para cada funcionalidad de Studio:

1. Qué paquete existente es responsable.
2. Qué contrato o export permite utilizarla.
3. Si ya existe una implementación reutilizable.
4. Si debe extenderse algún paquete.
5. Si debe permanecer dentro de `runly.studio`.
6. Si justifica una biblioteca compartida nueva.

Revisa especialmente:

- Sistema de diseño.
- Componentes visuales.
- Drag-and-drop.
- Formularios e inspectores.
- Temas claro/oscuro.
- Manejo de datos remotos.
- Autenticación y contexto empresarial.
- Servicios y contratos de módulos.
- Integración con automatizaciones.
- Modelo de escenas.
- Geometría y transformaciones.
- Renderizadores.
- Colaboración.
- Assets.
- Exportación.

## 3. Política de reutilización

Priorizar:

- `@runly/ui` para controles y componentes generales.
- `@runly/sdk` para integración con la API.
- `@runly/core` para contratos centrales.
- `@runly/module-engine` para integraciones y contratos RME3.
- `@runly/module-compiler` solo cuando Studio necesite interoperabilidad con módulos compilados.
- `@runly/preview-runtime` para previsualizaciones compatibles con su contrato real.

No agregar Fabric.js, motores gráficos grandes ni dependencias específicas de Studio a `@runly/ui` o `@runly/core`.

Preservar las entradas ligeras y evitar aumentar los bundles de consumidores ajenos al diseño gráfico.

## 4. Decisión sobre un nuevo paquete gráfico

No crear `@runly/graphics` por defecto.

Comparar tres opciones:

A. Código gráfico interno de `runly.studio`.

B. Utilidades compartidas dentro de la estructura actual de Runly ERP.

C. Nuevo paquete `@runly/graphics`.

Elegir C solamente cuando exista una necesidad concreta de consumo independiente y contratos estables.

Si se justifica C:

- Definir exports explícitos.
- Separar partes puras de browser/renderers.
- Definir dependencias y peer dependencies.
- Evitar ciclos entre paquetes.
- Añadir pruebas de consumidores.
- Verificar compatibilidad con pnpm workspaces.
- Revisar publicación bajo `@runly-mx/graphics`.
- Actualizar el catálogo cerrado de paquetes solo mediante un cambio planificado.
- Ajustar manifiestos, release scripts y CI.
- Garantizar instalaciones independientes y lockfiles reproducibles.
- Verificar la distribución sin publicar directamente a producción.

No incluir nuevos paquetes en una publicación real sin autorización.

## 5. Verificación de GitHub Packages

Verificar el proceso existente de versiones inmutables basadas en el SHA completo del commit.

No confundir las versiones internas `0.1.0` con las versiones efectivamente publicadas.

Comprobar:

- Generación de tarballs.
- Resolución de dependencias internas.
- Versiones exactas.
- Alias npm.
- Pruebas de consumidor independiente.
- Compatibilidad con React y Vite.
- Exportaciones de módulos.
- Tamaño y contenido del paquete.
- Exclusión de archivos privados y secretos.
- Impacto de cambios en los seis paquetes existentes.

No alterar el sistema de publicación para facilitar un prototipo.

## 6. Pruebas obligatorias

Los cambios compartidos deben ejecutar las pruebas existentes de sus paquetes afectados.

Cuando cambien contratos distribuidos, validar además los consumidores externos con el mecanismo `verify:shared-consumer` o su equivalente vigente.

No considerar suficiente que el monorepo compile: verificar que las APIs públicas de los paquetes sigan funcionando desde fuera del workspace.

Agregar pruebas de compatibilidad para exports y dependencias cuando corresponda.

## 7. Entregable

Crear una sección específica en el documento de arquitectura:

**"Integración de Runly Studio con los seis paquetes compartidos".**

Incluir:

- Inventario de contratos reutilizados.
- Cambios necesarios por paquete.
- Dependencias nuevas propuestas.
- Decisión sobre `@runly/graphics`.
- Riesgo de romper consumidores.
- Consecuencias para GitHub Packages.
- Plan de publicación y adopción futura.

## 8. Regla definitiva

**Primero reutilización; después abstracción; finalmente distribución.**

No crear APIs públicas prematuramente.

No convertir componentes específicos de Studio en dependencias obligatorias de todo Runly.

La arquitectura debe permitir que Studio crezca sin aumentar innecesariamente el tamaño, complejidad o acoplamiento de los módulos existentes.

Continúa con la Fase 0 y Fase 1 del plan maestro incorporando estas condiciones.


## Anexo C: consolidaci?n aceptada conservada

# RUNLY STUDIO — Consolidación definitiva e inicio de implementación

Acepto las observaciones de tu revisión sobre el plan maestro y su ampliación.

Quiero que incorpores todas esas precisiones y **comiences la ejecución real del proyecto**.

Ya tienes el contexto de ambos documentos, por lo que no necesitas volver a evaluarlos conceptualmente.

## 1. Consolidar los documentos

Conserva el plan original y su ampliación, integrándolos en un único plan maestro dentro del repositorio.

Resuelve explícitamente estos puntos:

**Abstracción mínima**

No es obligatorio extraer geometría, colaboración, assets y exportación. Son candidatos.

Extrae únicamente funcionalidades cuya reutilización esté demostrada y cuya separación no comprometa la arquitectura existente.

Si la auditoría concluye que todavía no existe una extracción conveniente, documenta la decisión y continúa desarrollando Studio sobre los contratos compartidos existentes.

**Colaboración**

- Fase 2: persistencia segura, presencia, cursores y propagación básica de cambios entre usuarios, reutilizando infraestructura existente cuando sea viable.
- Fase 4: colaboración avanzada, edición concurrente compleja, recuperación y resolución sofisticada de conflictos.

No implementar un CRDT propio.

**Plantillas**

- Fase 2: dos o tres plantillas originales, locales y completamente editables.
- Fase 3: catálogo empresarial, proveedores externos, búsqueda, filtros, caché y licencias.

**Primera vertical funcional**

La primera vertical requiere únicamente:

1. Crear un diseño.
2. Insertar y modificar texto, formas e imágenes.
3. Guardar.
4. Reabrir preservando los elementos editables.
5. Exportar PNG correctamente.

El MVP completo puede incorporar progresivamente las demás herramientas.

**Formato portable**

El documento persistente tendrá un contrato propio de Runly, versionado.

El motor gráfico será un adaptador de dicho contrato.

No utilizar la serialización de Fabric.js como único formato canónico sin evaluar sus implicaciones de compatibilidad y evolución.

**Renderizado**

Evaluar por separado:

- Renderizado interactivo en navegador.
- Exportación en navegador.
- Renderizado automatizado o headless en servidor.

La evaluación de Fabric.js debe contemplar los tres escenarios. No es necesario implementar el renderizado de servidor durante la primera vertical.

**Compatibilidad**

El objetivo será preservar los comportamientos observables de Canvas, POS y Notes.

Documentar escenarios verificados, regresiones y límites de cobertura. No afirmar compatibilidad absoluta sin evidencia.

## 2. Auditar los seis paquetes

Inspecciona sus contratos, exports, versiones, dependencias y consumidores.

No presupongas que todos deben modificarse.

Permite explícitamente la decisión:

"Ningún paquete existente; responsabilidad interna de runly.studio".

No crear `@runly/graphics` a menos que la auditoría demuestre una necesidad concreta de distribución y reutilización independiente.

No modificar los scripts de publicación ni publicar paquetes sin autorización.

## 3. Ejecutar desde ahora

Trabaja en este orden:

1. Verificar estado actual del repositorio y últimos commits.
2. Auditar los seis paquetes existentes.
3. Auditar Canvas, Notes, POS, Canvas Social, Automatizaciones y Documents.
4. Crear la matriz de responsabilidades y reutilización.
5. Ejecutar el baseline de pruebas relevantes.
6. Comparar motores gráficos con las mismas escenas y operaciones.
7. Documentar la decisión técnica.
8. Implementar únicamente las extracciones justificadas.
9. Validar regresiones.
10. Comenzar la primera vertical real de `runly.studio`.

No te detengas tras escribir los documentos de arquitectura.

Si no necesitas extraer componentes para desarrollar una primera vertical sólida, continúa directamente con Studio usando los contratos existentes.

## 4. Reglas de implementación

- Mantén los seis paquetes compartidos como infraestructura prioritaria.
- No dupliques componentes de `@runly/ui`.
- Utiliza `@runly/sdk` para las operaciones API.
- Conserva separación empresarial, permisos y auditoría.
- No incrementes innecesariamente el bundle inicial de Runly.
- No hagas cambios destructivos.
- No alteres migraciones previamente aplicadas.
- No hagas despliegues productivos.
- No publiques nuevos paquetes.
- No sobrescribas trabajo de otras sesiones.
- Implementa pruebas para cada cambio importante.
- Sigue las convenciones DRY, límites de archivos, refactor y documentación del repositorio.

Realiza commits locales coherentes en una rama de trabajo segura. No publiques ni integres en `main` sin autorización.

## 5. Resultado esperado

Quiero recibir resultados técnicos y funcionales, no otra propuesta conceptual.

Al concluir esta ejecución, informa:

- Arquitectura verificada.
- Paquetes reutilizados.
- Código compartido extraído, si corresponde.
- Motor gráfico elegido y evidencia.
- Estado de Runly Studio.
- Funcionalidades implementadas.
- Pruebas ejecutadas y resultados.
- Commits generados.
- Bloqueos reales.
- Próxima fase ejecutable.

**Comienza ahora. No vuelvas a solicitar aprobación para decisiones técnicas internas que puedas resolver de forma segura.**

La prioridad es entregar código funcional sin comprometer la estabilidad de Runly.
