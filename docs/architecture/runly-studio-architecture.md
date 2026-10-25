# Runly Studio: arquitectura de la primera vertical

## Flujo implementado

El módulo oficial se registra en `manifests/official/studio.js` y el catálogo de core-modules; ModuleOutlet carga StudioScreen con React.lazy. La ruta es `/app/m/runly.studio/`, con `?design=<id>` para reabrir. No se modifica el resolver genérico de rutas.

StudioScreen ofrece creación en blanco, tamaños predefinidos/personalizados, tres plantillas propias y una lista paginada de diseños propios/compartidos. El workspace usa tres regiones: herramientas, página desplazable con zoom e inspector contextual con una lista de elementos accesible por teclado. El usuario puede insertar/modificar texto, formas e imágenes y confirmar la eliminación de elementos. El guardado es explícito; un adaptador de navegación opt-in protege este editor mientras está sucio, incluido el shell y el cambio manual de empresa.

El editor mantiene interacción Fabric fuera del estado React durante arrastres. React recibe cambios comprometidos y texto/selección; no se usa un store global de documentos. La carga de originales es asíncrona y un error de imagen impide dar por exportado un diseño incompleto.

El contrato y las rutas están descritos en [infraestructura compartida](runly-shared-graphics.md). La [auditoría](runly-studio-audit.md) contiene la sección **Integración de Runly Studio con los seis paquetes compartidos**, sus exports, matriz y consecuencias de publicación.

## Persistencia y seguridad

`studio_design` conserva identidad, empresa, propietario, revisión, JSON canónico y fechas. Las funciones del servicio viven dentro de su factory y reciben prisma. Se usa SQL parametrizado, sin accessor Prisma de una tabla de módulo ni cambios a schema.prisma.

Cada mutación y su AuditLog están en la misma transacción. El UPDATE compara revisión en la propia sentencia, de modo que dos clientes no pueden confirmar la misma revisión. No se describe este mecanismo como CRDT ni como colaboración en tiempo real.

La nueva tabla tiene RLS y no concede acceso a anon/authenticated. Los endpoints autenticados aplican permisos y filtran por empresa/propietario en cada consulta. El JSON no decide pertenencia empresarial ni puede indicar URLs arbitrarias para imágenes. No se incorpora fetch de URLs remotas en servidor, importación SVG/ZIP, HTML, proveedores de recursos ni endpoints públicos.

Las pruebas del servicio usan el cliente Prisma generado, PrismaPg y PostgreSQL desechable. El fixture UI sigue disponible para regresiones rápidas. La suite `scripts/verify-studio-supabase.mjs` usa además GoTrue, Storage, REST, Realtime, Kong y PostgreSQL reales, la API completa y un build del frontend, en un proyecto Compose desechable. No intercepta Auth/Files/Storage. Su configuración procede del instalador, con secretos nuevos, puertos loopback y volúmenes propios; no usa env files de una instalación.

## Recuperación e historial local

DesignEditor conserva borradores canónicos por empresa/usuario/diseño en este navegador, recuperables durante siete días. Un 409 permite revisar la versión actual y guardar el trabajo como un diseño independiente; no actualiza la revisión de base para pisar el servidor. Los errores temporales permiten reintento explícito. La copia se elimina después de un guardado confirmado sin cambios posteriores. Los borradores son almacenamiento local de datos del usuario, sujeto a cuota y limpieza del navegador; no son un respaldo en servidor.

El adaptador mantiene hasta 50 pasos y un presupuesto de 8 MB de strings UTF-16 de escenas, sin guardar bitmaps en el historial. Las transformaciones entran por object:modified; no por cada movimiento del puntero. Undo/redo prepara los objetos antes de sustituir la escena para no perder la actual ante un error de imagen. Incluye duplicado, clipboard de elementos dentro del editor, orden, bloqueo y visibilidad. Los atajos se limitan a la región del editor y respetan los controles de texto nativos. El historial se reinicia al reabrir o recuperar un documento; no se persiste como parte del diseño.

## Motor y exportación

Se selecciona Fabric 6.9.1 para edición de Studio, manteniendo Canvas2DRenderer para diagramas y POS. La evidencia y alternativas están en [el ADR](adr-runly-studio-renderer.md). No se añade Fabric a core, ui, sdk ni a API/worker.

PNG y JPG se generan en navegador con las dimensiones exactas de la página y originales autorizados. JPG usa el fondo opaco canónico y calidad 70/90/100 %, por defecto 90 %. Antes de codificar se vuelven a resolver y comprobar los originales secuencialmente: una URL/bitmap cacheados no bastan como autorización vigente. El canvas auxiliar de salida se libera tras codificar; el máximo es 4096 × 4096. Las pruebas también se ejecutan en Chrome headless, lo que demuestra viabilidad de esa ruta, no una API de render servidor disponible. Un servicio futuro debe resolver archivos con identidad empresarial, fuentes instaladas y límites de CPU/memoria dentro de la cola existente; fabric/node requiere evaluar dependencias nativas por separado.

## Identidad visual y composición

El nombre visible es **Studio**: manifiesto, catálogo/dashboard, navegación,
accesos, pantalla inicial/editor y títulos de ayuda. La clave `runly.studio`,
permisos `studio.*`, rutas e identidad PWA permanecen estables. El nombre largo
Runly Studio se conserva en documentación y contexto técnico. La descripción
corta es «Diseño gráfico y edición multimedia». `PenTool` utiliza Lucide, ya
presente en Runly; se añadió a la whitelist del motor, sin otra dependencia.
El color `#D946EF` es un hex admitido directamente y alimenta tarjetas, menú,
tema del módulo e iconos/PWA. Cursores y selecciones usan fucsia con variantes
de contraste de los tokens existentes. `apps/shared/studio/identity.js` es la fuente
de esos metadatos. El normalizador común de runtime/catálogo proyecta esa identidad
también sobre respuestas antiguas o cacheadas de instalaciones existentes; PWA
aplica la misma presentación al leer. No requiere sync ni escrituras en la base.
Solo cambia metadatos visibles del módulo exacto `runly.studio`: no añade módulos
ni navegación filtrada y conserva estado, rutas, permisos y datos instalados.

El contrato sigue en v2, con lectura de v1. `resizeDocument` valida el resultado
antes de mutar: conserva objetos incluso fuera de página; el escalado optativo
usa el mínimo de las razones de anchura/altura, anclado al origen y sin deformar.
Para texto escala `scaleX/scaleY`, conservando tamaño tipográfico y geometría base.
Las cotas del contrato siguen vigentes: se rechaza un escalado que las exceda.
Tamaño y fondo son una acción de historial; no hay DPI ni unidades físicas nuevas.

La alineación emplea `getBoundingRect` de Fabric y traslada objetos sin modificar
su rotación ni escala. Excluye bloqueados/ocultos; distribuye separaciones visuales
con tres o más objetos. Cada operación es un paso reversible. La multiselección
permite traslación/alineación, con escala/rotación conjuntas bloqueadas para evitar
introducir skew que v2 no puede representar. Los objetos individuales conservan
sus tiradores. Se estabiliza el ruido de coma flotante al leer grupos temporales;
seleccionar no debe modificar coordenadas canónicas.

El viewport usa scroll/CSS y coordenadas del documento. Ajustar, centrar, zoom
5–400 %, Ctrl/Cmd + rueda y Mano/Espacio no generan historial ni datos persistidos.
Zoom conserva el punto bajo el cursor o el centro cuando el espacio de scroll lo
permite. ResizeObserver recalcula el ajuste activo. Espacio no captura inputs ni
el editor de texto de Fabric; Mano admite puntero/táctil y el scroll sigue disponible.

Runly usa BrowserRouter declarativo: `useBlocker` del data router no es compatible.
`useStudioNavigation` adapta push/replace/go solo mientras este editor está sucio,
restaura los métodos al desmontar/guardar y trata Back/Forward nativo reponiendo
el índice antes de preguntar. El puente recibe popstate antes de que BrowserRouter
se monte: un listener instalado por el editor lazy llega demasiado tarde y el
router podría desmontarlo antes de preguntar. Fuera del editor sucio es un no-op;
la prueba de navegador cubre guardar/reabrir, cancelar/confirmar links y Back/Forward.
El cambio manual de empresa consulta un puente
opt-in; sin guard es síncrono y no cambia la conducta de otros módulos. Los cambios
de empresa forzados por revocación no se bloquean. Recarga/cierre conserva el
beforeunload del navegador. Se conserva el borrador antes de preguntar/salir; una
copia confirmada usa un bypass acotado para navegar sin un segundo aviso.

## Integraciones futuras y propiedad de datos

### Colaboración privada y Files

La migración forward `20261203000000_studio_collaboration` agrega colaboradores
VIEWER/EDITOR, referencias de FileAsset por diseño y presencia con sesiones
independientes. Solo el propietario administra colaboradores de su empresa.
`runly_studio.can_access` comprueba membresía, módulo global y empresarial,
permisos efectivos, rol, estado y cada imagen. Las tablas no tienen acceso
directo desde anon/authenticated ni exposición REST en el esquema privado.

El acceso a un original compartido es una capacidad del diseño; no amplía la
visibilidad genérica de Files. Las firmas duran 60 segundos. Revocar impide
emitir firmas nuevas; las ya emitidas sobreviven hasta expirar. El JSON sigue
siendo v2 y contiene IDs, nunca firmas. Guardar una copia registra la procedencia
de imágenes heredadas: revocar el origen también deniega esa capacidad en la
copia. No convierte un original privado en un recurso independiente del lector.

Realtime usa canales privados `studio:design:<id>@<authorizationRevision>`.
Reutiliza la revisión global y el broadcaster autorizado de Runly. Cambiar ACL,
membresía, permisos, módulos o estado de archivo/diseño rota la autorización;
los sockets anteriores no reciben eventos posteriores. Las mutaciones bloquean
primero la revisión y después el diseño; el broadcaster serializa contra ese
mismo punto. Estos awaits son deliberadamente secuenciales.

Los clientes no publican operaciones de edición. La API confirma una escritura
optimista y emite únicamente ID/revisión. El receptor recupera el JSON mediante
API autenticada, ignora revisiones antiguas/duplicadas y conserva borradores
sucios. Reconectar reconcilia el estado actual. No hay CRDT ni edición de un
mismo texto libre de conflictos. Presence valida identidad en servidor, admite
hasta ocho sesiones por usuario/diseño, limita escrituras a una por 180 ms y
expira participantes a los 15 segundos. Los cursores usan coordenadas de documento.

El panel Recursos reutiliza `filesService.list/getById`, con empresa/contexto
calculados en servidor. Lista 24 imágenes PNG/JPG/WebP por página sin firmas,
filtra antes de paginar y busca con debounce de 300 ms. Cada miniatura autentica
incluso un acierto de caché; Sharp limita a 25 MP y genera hasta 256 px sin cambiar
el original. La caché del proceso usa empresa/usuario/archivo/fecha, TTL de 20 s,
64 entradas y 16 MB; dos generaciones concurrentes, sin cola ilimitada. El cliente
limita descargas a dos, observa el viewport y libera object URLs al desmontar.
Insertar reutiliza FileAsset.id; previsualización, lienzo y PNG utilizan el
original autorizado. No existe un segundo almacén ni deduplicación por nombre.

### Contrato futuro de proveedores, aún inactivo

Un adaptador pequeño podrá ofrecer `search({ query, cursor, limit, signal })`,
`resolve({ providerId, assetId, variant, signal })` e
`import({ resolved, companyId, actorId, rightsAcknowledgement })`.
Search devuelve referencias y metadatos, no una escena ni credenciales. Resolve
debe incluir `mediaType`, dimensiones, licencia con versión/URL, autor,
atribución requerida y derechos de descarga, almacenamiento, redistribución y
uso comercial. Import revalida permisos/derechos, tipo/tamaño y procedencia en
servidor, usa Files y devuelve FileAsset.id; nunca persiste URL externa firmada
en Studio. Fallos/expiración/cancelación son explícitos y paginados.

Iconify, Tabler, Openverse, Google Fonts y fotografía permanecen desactivados.
No se supone una licencia uniforme: hay que verificar términos del proveedor y
del recurso antes de habilitar cada integración, decidir conservación de
atribución y demostrar su presencia donde corresponda en exportación. Esta
entrega no descarga recursos ni consulta proveedores externos.

### Clipboard interno entre diseños

El clipboard conserva una única selección canónica en memoria por empresa/usuario,
sin bytes, URLs ni credenciales. Expira a los diez minutos, se elimina al detectar
otro ámbito y limita a 1 MB de strings UTF-16 y los 500 objetos del contrato.
Sobrevive a navegar entre diseños dentro de la aplicación; recargar la página lo
descarta. Pegar crea IDs de objeto nuevos, valida v1/v2, conserva geometría/texto/
estilos compatibles y constituye un único paso de undo/redo. La escena actual no
se sustituye si falla una imagen o la validación.

Una imagen ya referenciada por el destino usa su capacidad de diseño. Para una
imagen nueva en el destino se exige acceso independiente en Files; el permiso
de lectura sobre un diseño ajeno no transfiere su capacidad privada mediante
clipboard. Se rechaza el pegado si falta ese permiso o desapareció el original;
guardar vuelve a autorizar en servidor. No interactúa con clipboard del sistema
ni promete conservar selecciones entre pestañas.

Documents conserva versiones de plantillas documentales y GeneratedDocument. Studio conserva versiones de su esquema gráfico y revisiones de edición. Una futura generación debe entregar FileAsset + información de exportación al hub, evitando duplicar las versiones de una misma plantilla en ambos sistemas.

El certificado local contiene únicamente texto de ejemplo. No obtiene datos empresariales ni emite certificados oficiales LMS.

Las propuestas designs.render/templates.apply/exports.create no están registradas. Antes de hacerlo: validar SERVICE_CONTRACTS, permiso del actor, empresa de plantilla y archivos, clave idempotente de generación, almacenamiento, reintentos y fallos parciales. La aceptación debe demostrar un evento LMS autorizado que produce un único archivo con sus reintentos.

## Despliegue preparado, sin ejecutar

1. Revisar el diff de la migración `20261130000000_studio_design` y el estado de migraciones de la instalación. No se infiere ese estado de Git.
2. En un entorno de prueba autorizado, aplicar el flujo normal de migraciones forward y la sincronización del catálogo oficial/permisos. No se necesita regenerar Prisma por esta tabla SQL sin accessor generado.
3. Asignar permisos studio.view/create/edit y los permisos Files requeridos para originales privados. No hay grants automáticos a usuarios existentes.
4. Abrir `/app/m/runly.studio/`, crear, modificar, guardar, reabrir y exportar. Verificar empresa activa y denegación desde otra cuenta.
5. Antes de cualquier producción, completar comprobación con auth/storage reales y revisar los fallos globales de política heredados.

No se publicaron paquetes, imágenes ni instaladores y no se aplicaron migraciones a una instalación existente.
