# Studio: integración real local y herramientas del editor

Validación del 2026-10-25, exclusivamente local. Continúa la preparación Docker
y la [validación anterior](runly-studio-local-validation.md). No usa la base
compartida ni credenciales reales; no publica imágenes ni inicia workers.

## Servicios e aislamiento

El adaptador `scripts/fixtures/studio/supabase-stack.mjs` reutiliza el Compose,
SQL de inicialización, gateway y generador de secretos de
`infra/installer/supabase/`. Selecciona solamente:

| Servicio | Imagen usada |
| --- | --- |
| PostgreSQL Supabase | supabase/postgres:17.6.1.136 |
| Auth real | supabase/gotrue:v2.189.0 |
| Storage real, backend de archivos | supabase/storage-api:v1.60.4 |
| REST | postgrest/postgrest:v14.12 |
| Realtime (esquema y canales generales de Runly) | supabase/realtime:v2.102.3 |
| Gateway | kong/kong:3.9.3 |
| API Runly completa | imagen construida localmente, runly-studio-test:api-local |
| Frontend React | build Vite de los fuentes actuales, servido en loopback |

No se inicia Supabase Studio, Meta, trabajadores Runly ni servicios de correo o
proveedores externos. Los usuarios se crean por la API admin real de Auth con
correo confirmado, nombres/datos sintéticos y contraseña aleatoria.

Cada ejecución genera proyecto Compose con sufijo aleatorio, red propia, volúmenes
de PostgreSQL/configuración/Storage propios, cuatro puertos loopback exclusivos y
secretos nuevos mediante el generador del instalador. No se heredan variables de
aplicación/Compose ni se leen env files existentes. La imagen excluye .env,
.secrets y módulos de instancia; no se monta el repositorio sobre la API. La red
es un bridge separado, no una garantía de bloqueo de todo egreso. Ningún destino
externo de correo/webhooks/push queda configurado.

Antes de migrate se comprueban el endpoint local del motor Docker, labels del
proyecto, namespace de volúmenes y ausencia de historial Prisma. Se escribe una
marca privada en un esquema de prueba separado de public. Antes de migrate y
otra vez antes de seed se verifica la marca. La suite comprueba que se rechaza
inicializar sin verificación o con una marca de otro proyecto. No usa migrate
resolve, reset ni un instalador setup/update. La API arranca por su entrypoint
Node, después de la inicialización explícita de la base desechable.

El gateway de prueba utiliza timeouts cortos para que una caída real de Storage
no bloquee varios minutos la suite. No se modifica el gateway del instalador.
El finally del runner recoge logs privados y ejecuta down --volumes solamente
para el proyecto generado. SIGINT/SIGTERM también intentan ese cierre. Una
terminación forzada del proceso o del motor Docker puede impedir finally; sus
labels y compose.json privados permiten identificar exclusivamente esos recursos.

## Pruebas reales, sin interceptores de Auth/Files/Storage

La suite `scripts/verify-studio-supabase.mjs` verificó:

1. Usuarios reales de Auth, login UI de Runly y sesiones distintas del mismo
   propietario. API sin sesión: 401; usuario sin grants: 403; miembro autorizado:
   200. Concesión y revocación de rol se reflejan usando el mismo token.
2. Crear en blanco y desde plantilla, editar texto/formas/imagen, guardar y
   reabrir objetos editables. El router Files real recibe multipart y guarda
   en Storage el PNG original 1600×1000; los bytes descargados son idénticos.
3. URLs firmadas privadas con token temporal; una firma de un segundo caduca
   realmente y se rechaza. La escena no guarda URLs. PNG exportado 1080×1080
   con píxeles del original, sin sustituirlo por una miniatura.
4. Propietario distinto, empresa distinta y contexto empresarial obsoleto:
   denegación. El selector de empresa real cambia el contexto y la URL del
   diseño anterior no abre. Dos saves de la misma revisión producen 200/409;
   las mutaciones aceptadas tienen auditoría transaccional.
5. Conflicto real: revisar servidor, recuperar borrador y guardar como diseño
   nuevo sin alterar la versión original. Chromium offline provoca un fallo
   real de red; la copia sobrevive a reload y se guarda tras reconectar.
6. Undo/redo, Ctrl+Z, Ctrl+Shift+Z y Ctrl+Y; duplicar, copiar/pegar dentro del
   editor, orden, bloqueo y visibilidad persistidos en v2 y recuperados al abrir.
7. Imagen inexistente, deshabilitada o de otra empresa: rechazo. Fallo de imagen
   al abrir deja exportación deshabilitada. Tras restaurar el recurso, Reintentar
   vuelve a solicitar acceso autorizado y reconstruye el editor.
8. Proceso Storage pausado realmente mediante Compose: carga falla y no se exporta un
   diseño incompleto. Tras reanudar Storage y comprobar disponibilidad a través
   de API/Kong, Reintentar recupera la edición.

La pausa mantiene la IP del contenedor: detener/arrancar puede cambiarla y
mezclar la prueba con cachés DNS de los workers de Kong. Se observó ese caso
durante el ensayo; no se declara corregido el comportamiento DNS del instalador.
Los errores de carga de Fabric se sanitizan: no se muestra la URL firmada ni su
token en la pantalla de error.

Build web aprobado, sin JWT secreto, service_role ni contraseña PostgreSQL en
sus archivos JavaScript. La detección de secretos se comprobó también con un
valor prohibido deliberado. El verificador AST compartido con la comprobación de
imágenes Docker confirmó Studio/Fabric en import dinámico y fuera de los 12
chunks iniciales. No se añadieron Fabric ni sus tipos a los paquetes generales.

## Funcionalidad implementada

- Borrador local canónico por empresa/usuario/diseño, recuperable durante siete
  días, con aviso si la cuota/Storage del navegador impide guardarlo.
- 409 identificado: revisión del servidor y copia independiente; sin actualizar
  silenciosamente la revisión base ni fusionar cambios. Reintento explícito de
  fallos temporales y protección de ediciones hechas durante un save pendiente.
- Historial de 50 pasos, con presupuesto de retención de 8 MB de strings UTF-16.
  Guarda escenas JSON, no bitmaps. Usa transformaciones confirmadas, no cada
  movimiento del puntero. Reconstrucción preparada antes de reemplazar la escena.
- Duplicar, clipboard de objetos dentro del editor, niveles y frente/fondo;
  bloqueo de transformaciones y edición; visibilidad independiente de selección.
- Inspector existente de posición, dimensiones, rotación, texto, tamaño y color,
  con controles de @runly/ui. Los elementos bloqueados se seleccionan desde la
  lista para desbloquearlos; las propiedades quedan deshabilitadas.
- Contrato v2: locked/hidden por objeto. Lectura de v1 con defaults false en
  memoria, sin reescribir filas históricas; próximo guardado explícito en v2.
  Test SQL comprueba que leer un diseño v1 deja su JSON almacenado en v1.

API y frontend deben conocer v2 para editar diseños nuevos; no se garantiza que
una versión antigua del editor pueda abrirlos. No se añadió migración SQL.

## Reproducción

Requisitos: Docker Desktop con motor Linux local, dependencias pnpm instaladas,
Chrome y Playwright. Las seis imágenes Supabase de la tabla deben existir en el
motor local: el runner fija pull_policy=never y falla si falta alguna. No descarga
credenciales ni consulta una instalación existente.

Construir la API actual con un tag de prueba, sin push:

```sh
docker buildx build --platform linux/amd64 --load -f infra/docker/api.Dockerfile -t runly-studio-test:api-local .
node scripts/verify-studio-supabase.mjs
node scripts/verify-studio-local.mjs
node scripts/verify-user-isolation.mjs
```

El primer runner también hace el build web en su carpeta privada de artefactos.
No reemplaza apps/desktop/dist ni arranca el servidor habitual. Los JSON de
resultados, export, capturas, logs, configuración y secretos de prueba quedan
en `.artifacts/studio/runly-studio-e2e-*/`, ignorados por Git. Esos env files
contienen únicamente secretos desechables y no deben compartirse.

Resultados adicionales: regresión dirigida **1259/1259**, aislamiento **14/14**
con las **215 migraciones** y seed en otra base vacía; tests nuevos de main
(integraciones Chat, búsqueda y notificaciones) **21/21**; Docker/preflight **7/7**.
Renderer Chrome: roundtrip y píxeles, historial de texto/formas/imagen, niveles y
bloqueo; escenarios de 20/200/500 objetos. La suite rápida conserva sus fixtures;
la de Supabase es independiente y no los utiliza.

ESLint de los cambios pasa. React Doctor quedó sin diagnósticos de Studio;
84/100 en el diff global, con cuatro warnings en notificaciones de otra sesión.
El check de privacidad global reporta 64 hallazgos, incluidos el histórico de 63
y una ruta de workstation en un spec concurrente; no se añadieron allowlists.
Persisten warnings heredados del build por chunks grandes y por la clave
assignOperator duplicada en Chat SDK. Ninguno se oculta.

La revisión de privacidad individual abarcó 33 archivos de Studio y su soporte,
sin hallazgos. La limpieza automática de unas carpetas vacías creadas por Docker
al probar una ruta incorrecta fue bloqueada por la política de ejecución. Quedan
en `infra/installer/supabase/supabase/`, sin archivos ni datos y sin seguimiento
Git. No se intentó borrar por otra vía. Los contenedores, redes y volúmenes de
prueba sí se eliminaron con Compose, comprobado al terminar.

## Colaboración y Recursos verificados localmente

La migración forward `20261203000000_studio_collaboration` se aplicó únicamente
en proyectos Compose nuevos y desechables: ahora son 216 migraciones. No se
modificaron archivos históricos ni registros de `_prisma_migrations`.
La carpeta de esa nueva migración fija `migration.sql` a LF mediante atributos
Git locales; evita que un checkout Windows cambie sus bytes. No normaliza ni
reescribe migraciones anteriores.

`node scripts/verify-studio-supabase.mjs` ejecuta la vertical previa, colaboración
y Recursos con Auth, PostgreSQL, Realtime, Storage, REST, Kong y API reales.
`--collaboration-only` omite solamente la vertical previa para diagnóstico; sigue
comprobando colaboración y Recursos. No intercepta Auth, Storage ni Realtime.

La evidencia cubre dos participantes reales y un tercero de otra empresa:
compartir desde la UI, VIEWER/EDITOR, presencia con nombres/avatares autorizados,
cursores con zoom distinto, selección remota, cambios confirmados por WebSocket,
409 y conservación del borrador, guardado como copia, desconexión/reconexión,
dos sesiones separadas y eliminación de presencia al cerrar el editor.

Se mantiene un socket admitido antes de revocar; tras la revocación recibe cero
eventos nuevos. Se rechazan unirse al topic nuevo, lectura, edición, firmas de
originales y acceso heredado de una copia. Otro usuario de otra empresa no puede
suscribirse. Un broadcast falsificado puede recibir acuse `ok` del transporte,
pero la política impide su entrega y no modifica la revisión persistida.
Membresía inactiva, diseño/módulo deshabilitados y override empresarial también
deniegan acceso. Las firmas del diseño duran 60 s; una firma anterior no se
revoca físicamente antes de su expiración.

Recursos se verifica desde UI: búsqueda, miniaturas lazy, preview, inserción,
guardado y PNG. SQL demuestra que no se creó otro FileAsset y Storage conserva
exactamente los bytes originales. La miniatura es de hasta 256 px. Se comprueban
permisos y empresa en listado/miniaturas; revocar permiso o deshabilitar el
archivo deniega incluso después de llenar la caché.

La regresión ampliada reúne 1300 pruebas: 1299 aprobadas, cero fallos y una
omitida (Files workspace SQL requiere su propia base `files_test`; no se le
entregó la base habitual). Files sí se comprueba además mediante el E2E real
de esta entrega. Pasan renderer Chrome, roundtrip, historial, imágenes y PNG;
el build conserva Studio/Fabric en chunk lazy, separado de los 12 iniciales.
ESLint pasa. React Doctor: 86/100, diez warnings sin errores; cinco de Studio
(complejidad de dos componentes y dos awaits de bloqueo/autorización que deben
ser secuenciales, más la autorización secuencial de imágenes del clipboard para
evitar ráfagas sin límite) y cinco concurrentes de Chat. Dos tests dirigidos
adicionales pasan: aislamiento/expiración/límites del clipboard y rechazo SDK
de una miniatura si cambia la empresa durante su descarga.

El E2E también copia una imagen entre diseños mediante la UI, verifica un ID de
objeto nuevo, el mismo FileAsset, undo/redo, persistencia y ausencia de firmas.
Deshabilitar el original hace que pegar falle sin cambiar la escena. El clipboard
es una selección en memoria, limitada a 1 MB y diez minutos por empresa/usuario;
recargar lo descarta. Nuevas imágenes del destino requieren permiso independiente
en Files; el acceso privado de otro diseño no se transfiere mediante clipboard.

El check global de privacidad mantiene 64 hallazgos preexistentes/concurrentes;
no se modificaron allowlists. Las configuraciones, secretos sintéticos, capturas,
PNG, logs y `result.json` permanecen en `.artifacts/studio/`, fuera de Git.
La inspección individual de los 35 archivos de esta entrega no tiene hallazgos.
Los contenedores, volúmenes y redes de los proyectos desechables se eliminaron
al finalizar; la imagen API de prueba permanece únicamente en Docker local.

Implementación en main: `b98dbd0a`; protección de finales de línea: `b6996e20`.
Se preservó el trabajo concurrente de Chat, sin publicarlo como parte de Studio.

## MVP de composición y branding

El nombre visible es **Studio** (catálogo, dashboard, navegación, pantallas,
accesos y ayuda), con `PenTool` de Lucide y color `#D946EF`. La descripción es
«Diseño gráfico y edición multimedia». La whitelist del motor admite PenTool;
no se añade otro set de iconos. El nombre largo Runly Studio queda en contexto
técnico. No cambian clave `runly.studio`, rutas, permisos ni identidad instalada.
El cambio de catálogo se comprueba en el seed del stack desechable; no se ejecutó
sync contra la base habitual. Una instalación existente lo tomará mediante su
sincronización normal cuando esté autorizada.

Se mantiene v2, compatible con v1, sin migraciones nuevas. La UI permite elegir
presets o tamaño personalizado al crear y editar página/fondo después. Cambiar
tamaño conserva objetos fuera de página; escalar es una opción uniforme explícita.
Tamaño/fondo, alineación visual de objetos rotados y distribución múltiple son
acciones reversibles. Bloqueados y ocultos no entran en la alineación.

Fit/centrado, porcentaje, 100 %, Ctrl/Cmd + rueda, Mano y Espacio + arrastre usan
viewport local. No cambian JSON ni historial. La prueba escribe espacios dentro
del texto de Fabric sin activar pan. Se comprueba resize del viewport y zoom de
lectores; una revisión de tamaño guardada llega al lector por WebSocket real.

PNG y JPG se comprueban por formato binario, dimensiones y muestras del fondo y
del original. JPG ofrece calidad 70/90/100 %, predeterminada 90 %. Un original
inaccesible rechaza la exportación con error seguro y admite reintento. Se libera
el canvas auxiliar; el preview no multiplica su backing store por el DPR del
dispositivo. Chrome también exportó ambos formatos a 4096 × 4096.

Ejemplo medido en la escena sintética de 600 × 450 del runner completo (tiempo
incluye comprobación del original y descarga; no es un benchmark de producción):

| Formato | Bytes | Tiempo |
| --- | ---: | ---: |
| PNG | 11736 | 349 ms |
| JPG 70 % | 4391 | 224 ms |
| JPG 100 % | 16219 | 190 ms |

Fondo PNG: RGBA `[132,204,22,255]`; JPEG: RGB `[133,204,22]`. El píxel del
original PNG `[245,158,11,255]` se conserva; JPEG queda dentro de la tolerancia
de compresión de 15 niveles por canal. Renderer también prueba otro fondo.
En la escena blanca de 4096 × 4096: PNG 332228 bytes y JPEG 99062 bytes;
ambas exportaciones más la comprobación del JPEG tardaron 426.5 ms en una muestra.

La navegación sucia protege Volver, módulo desde el launcher, historial nativo,
recarga/cierre y cambio manual de empresa. El borrador es por empresa/usuario/
diseño. BrowserRouter necesita un puente temprano para popstate; fuera de un
Studio sucio es no-op. Las pruebas de navegador cubren cancelar/confirmar,
guardar/reabrir y Back/Forward. El nombre no se habilita hasta cargar el lienzo,
evitando cambios no registrados durante una reapertura lenta. Si falla la cuota
local se advierte antes de salir y se impide cargar una versión concurrente
sobre un borrador que no pudo preservarse.

La suite completa de Supabase real pasó los **27 grupos E2E** de vertical,
colaboración, Recursos/clipboard y composición, sin interceptores HTTP de Auth,
Realtime ni Storage. El fallo de cuota se inyecta exclusivamente en localStorage
del borrador del navegador. Los contenedores, redes y volúmenes se eliminaron.

La regresión ampliada pasó **1305/1306**, con cero fallos y la misma prueba SQL
de Files omitida por requerir `files_test`. Los **12 tests dirigidos** de PWA,
página y navegación también pasan. ESLint de los cambios pasa. Los diagnósticos
globales de React Doctor incluyen un error de hooks y warnings de trabajo
concurrente de Chat, fuera de este diff; el único warning
de Studio es el await secuencial de originales, intencional para limitar memoria.
El check global de privacidad sigue mostrando 64 hallazgos preexistentes, sin
añadir allowlists. El JSON privado de cada ejecución guarda checks, métricas y
evidencia de chunk lazy; las capturas incluyen dashboard claro/oscuro y editor.
La whitelist PenTool fue recogida por el commit concurrente `5f94b0cd` mientras
se validaba esta entrega. Se conservó ese historial sin reescribirlo.
La implementación propia queda en `186136b8`, directamente en main. La revisión
individual de los 28 archivos de esta entrega no encontró hallazgos de privacidad.

`--composition-only` ejecuta únicamente el bloque nuevo en un stack fresco para
diagnóstico. La ejecución por defecto sigue validando vertical, colaboración,
revocación, Recursos y clipboard antes del MVP; no se sustituyen por fixtures.

## Límites y siguiente desarrollo local

La colaboración confirma revisiones; no hay edición de texto libre de conflictos
ni CRDT propio. El borrador no es un respaldo en
servidor, puede desaparecer si se limpia el navegador y no contiene los bytes
de archivos; requiere acceso vigente a los originales. El historial no persiste
entre sesiones, el clipboard de objetos es interno a la aplicación y no cruza
pestañas ni recargas; la revisión del servidor muestra resumen, no un diff gráfico.

Se puede continuar con agrupación/capas persistentes y catálogo de plantillas
con versiones y licencias. Los proveedores externos siguen
inactivos; su contrato se documenta en la arquitectura. Todo puede comprobarse
en este Supabase local, sin VPS ni datos de la instalación habitual.

Una sesión concurrente incluyó los archivos nuevos de soporte Studio en
`84ffbcc5`. Se conservó ese historial; las correcciones finales y documentación
se commitean por separado con paths explícitos, sin incorporar cambios ajenos.
