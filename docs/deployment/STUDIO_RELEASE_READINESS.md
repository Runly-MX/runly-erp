# Studio — Release Candidate 1

## Fuente y alcance

Candidato de producto: **`32fe936cb55a9d5bfe54b56ab0a085eee3e96e97`**,
trabajado directamente en main. Incluye `0c95253c`, los seis commits del motor
citados en la solicitud, los controles v5 de `66c60a11` y la copia de trabajo de
plantillas de `5000f1b7`, además de las dos plantillas ilustradas de `cebce971`.
Todos se verificaron localmente por historia/ancestría.
No se consultó el registro Docker remoto ni se hizo fetch, push o despliegue.

El preflight inicial encontró `a19b1c9f`, árbol limpio y divergencia 0/0 frente a
la referencia **local** origin/main. Durante la revisión entraron commits de
otras sesiones; se fijó el checkpoint de producto commiteado `32fe936c` y se
construyeron las tres imágenes desde su archivo Git, sin ramas ni worktrees.
Las nuevas ediciones concurrentes posteriores quedan fuera de este candidato.
En particular, `924602fb` (paginación de búsqueda Iconify) entró después del
congelado y no está en estas imágenes ni queda certificado por este GO. El
HEAD posterior del repositorio no debe sustituirse al SHA de producto al publicar.
El SHA del informe o de correcciones posteriores del harness no sustituye el
SHA de producto indicado arriba.

No se cargaron variables de conexión de la instalación habitual. Cada ensayo
creó su propio proyecto Docker, puertos loopback, credenciales aleatorias y
volúmenes nuevos, con comprobación de identidad antes de inicializar la base.
Solo se usaron personas, empresas, archivos y composiciones sintéticas.

## Pruebas y cobertura

| Comprobación | Resultado |
| --- | --- |
| RC integral con API/Web/Worker del mismo SHA | **57 grupos aprobados; 0 fallos; 0 omisiones** |
| Studio, Canvas, Notes, POS, Projects, SDK, UI, JWT y paquetes compartidos | 1341 aprobadas; 0 fallidas; 1 omisión preexistente |
| Fabric real y exportación | Formas/fotos, estilos, máscaras, encuadre, caps, grupos, variantes, SVG, clipboard y cola de cambios; PNG/JPG idénticos tras reabrir |
| MCP global con PostgreSQL 18 y SDK oficial | 206 casos: 187 aprobados, 17 fallidos heredados, 2 omisiones preexistentes |
| Docker API/Web/Worker linux/amd64 | Builds locales completados con frozen-lockfile y etiquetas exclusivas |
| `pnpm docker:release:check` | Dry-run aprobado; detectó API, Worker y Web. No publicó ni marcó releases |

Los 57 grupos se distribuyen en cinco de arranque/empaquetado/compatibilidad y
Worker, seis de plantillas RC, cuatro de MCP real, diez generales, siete de
colaboración, cuatro de recursos, seis de composición, seis creativos, cuatro
de fotos y cinco de rellenos. Evidencia final:
`.artifacts/studio/runly-studio-e2e-93d11dfe6b82/rc1-result.json`, `passed=true`.

La omisión de la suite amplia es «Files workspace enforces pagination,
invitations and all file access paths in PostgreSQL», opt-in en el runner
reducido. Las dos de MCP son Inspector 2.11.0 real e Inspector CLI. Son omisiones
anteriores; el RC sí ejecuta las rutas Files utilizadas por Studio y el SDK MCP
oficial contra servicios reales. No se certifica la interfaz de Inspector.

La validación RC usa la **Web nginx de la imagen**, no Vite dev ni servicios
falsos, y la API de la imagen con PostgreSQL, Auth, REST, Storage y Realtime
Supabase reales. El catálogo externo se sirve mediante el proveedor local del
runner; no se prueba disponibilidad en Internet de Iconify/Openverse.

Cobertura específica de la UI de plantillas:

- Listado Runly y edición protegida del catálogo original.
- Crear personales y empresariales, editar metadatos, reproducir 409 conservando
  lo escrito, cargar revisión actual y reintentar.
- Editar contenido desde su copia de trabajo, guardar plantilla y usarla como
  diseño independiente sin perder campos v5.
- Publicar una personal y retirar desde la UI; las copias existentes siguen
  autorizadas y ya no se permite un nuevo uso de la plantilla retirada.
- Fotografías privadas, firma de plantilla/diseño y rechazo entre empresas.
- Carga, guardado, reapertura y exportación de v5 con rellenos de forma, filtros,
  recorte, original/copia editada, grupos, SVG seguro, fuentes/variantes y los
  siete tipos de extremos. PNG antes/después idéntico; JPG decodificado real.
- JSON históricos v1–v4 almacenados físicamente en la base desechable, abiertos
  y guardados con la UI nueva. No se limitaron a convertir un payload de alta.

No se promete cobertura de cada combinación visual posible, navegadores móviles
reales, grupos anidados, giro/escalado de grupo ni segmentación de fondo. Quitar
fondo permanece fuera del producto; no se descargan modelos automáticamente.

## Corrección funcional encontrada durante RC

El candidato intermedio `06f2374c` falló en composición al cancelar navegación,
historial, cambio de empresa y beforeunload: el editor volvió a una escena de
600×450 cuando la revisión guardada tenía 640×480, y mostró un conflicto que
dejaba Guardar deshabilitado. Se conserva la captura y el fallo en
`.artifacts/studio/runly-studio-e2e-e1452c343930/composition-failure-0.png` y
`rc1-06f2374c/integration.log`. Ese candidato no se considera aprobado.

`32fe936c` sincroniza la caché de la ruta con las revisiones reconocidas por el
editor al guardar, aceptar el servidor o recibir una revisión remota. Evita
remontar la escena inicial obsoleta al volver al diseño. No cambia permisos,
SQL, formato JSON ni arquitectura. Se reforzó la prueba para exigir que, tras
cancelar, se mantengan 640×480 y el nombre del borrador, y Guardar siga habilitado.
La prueba enfocada real pasó; la certificación final corresponde a las imágenes
reconstruidas del SHA corregido, no al ensayo anterior.

ESLint y regresión amplia aprobados después del arreglo. React Doctor: 86/100,
cero errores y dos advertencias de complejidad en controles existentes de
imagen/plantillas; no se añadieron exclusiones para ocultarlas.

Reproducción local: `node scripts/verify-studio-rc1.mjs --revision=32fe936cb55a9d5bfe54b56ab0a085eee3e96e97`, con los tres tags de abajo
ya construidos. El comando normal no omite suites. `--focused` solo se usó en
diagnóstico previo; no es la ejecución integral que fundamenta esta decisión.

## Perfiles, permisos y auditoría

Se crearon tres identidades reales de Auth: administrador con rol runly.admin,
gestor personal sin studio.templates.publish y usuario de otra empresa.
El administrador puede crear, editar, publicar, retirar y usar plantillas.
El normal crea personales; recibe **canPublish=false**, no ve la opción
empresarial y recibe **403** al intentar publicar o crear una empresarial por
HTTP directo. Tampoco obtiene canEdit sobre una empresarial ajena.

La otra empresa recibe 404 al consultar plantilla y firma privada. El usuario
normal puede usar la plantilla empresarial autorizada y abrir sus fotos solo
por el diseño resultante, sin ganar acceso genérico a Files. Se verifican los
eventos backend create/update/publish/use/delete de plantillas.

Los permisos nuevos exigen registrar manifiestos/catálogo. Seed concede el
catálogo a roles administrativos; no concede publicación a roles normales por
tener studio.edit. No ejecutar seed o sync en una base compartida como remedio
de una prueba. Tras una actualización autorizada, refrescar perfil/sesión y
revisar asignaciones de permisos de forma explícita.

## Migraciones y arranque

El repositorio del candidato contiene **219 migraciones**, incluida
`20261205000000_studio_templates`. Se aplicaron todas exclusivamente en la base
desechable; no se añadieron ni modificaron migraciones para esta revisión.
El número pendiente en la base compartida sigue desconocido: no se conectó a ella.
Las 219 finalizaron sin rollback y sus checksums coinciden con las fuentes
incluidas en la imagen; no quedó ninguna pendiente dentro del entorno desechable.

Se comparan los checksums aplicados con los bytes reales de la imagen, y el SQL
de la imagen con el commit normalizando únicamente CRLF/LF. En 218 archivos,
core.autocrlf=true hace que el archivo Git local exporte CRLF y el blob use LF.
Esa diferencia de representación se registra por separado: no equivale a una
modificación de SQL y no se corrige escribiendo en _prisma_migrations. Este
ensayo fresco tampoco demuestra que coincidan los históricos de una base externa.

El entrypoint normal ejecutó realmente `prisma migrate deploy` y `prisma/seed.js`.
Después se recreó la API con **RUNLY_SKIP_DB_INIT=1**: anunció que omite ambos y
conservó el historial. La opción no convierte la API en solo lectura:
`apps/api/src/index.js` también restaura bundles, prepara buckets y puede
aprovisionar modelos core inline durante el arranque. No conectar una API nueva
a la base compartida suponiendo que ese flag impide toda escritura o DDL.

## MCP: resultado acotado y fallos heredados

La prueba RC habilita MCP en el API Docker local, usa registro OAuth/PKCE,
consentimiento con un JWT real de Supabase y el SDK oficial. Verifica:
studio_overview, studio_design_detail, studio_template_detail,
studio_create_design, studio_update_design, studio_template_save,
studio_template_publish y studio_review_design, con recursos privados v5.
Una mutación sin aprobación falla; la aprobación se realiza por el endpoint web
autenticado y la publicación exige además acknowledgeSensitive. Se comprueban
idempotencia, auditoría, conflicto y revocación de archivo/membresía. La
revocación de membresía devuelve 403 en el transporte, no un éxito MCP.
La aprobación HTTP se automatiza con identidades sintéticas; no hubo una persona
aprobando operaciones reales ni se prueba aquí toda la pantalla de conexiones MCP.

**MCP global no está completamente aprobado.** Se reprodujeron los mismos 17
fallos por nombre: 14 hojas y tres padres, sin skips nuevos. El listado íntegro
y sus pasos están en `runly-studio-geometry-local.md`, sección «Diagnóstico exacto
de los 17 fallos MCP». Causas verificadas:

- Notes: al fixture SQL le falta parent_note_id; el alta fallida deja otros
  casos de lectura/Yjs/adjuntos sin ID válido y termina afectando al caso SDK.
- projects_workload y projects_time_summary se invocan con `{}` aunque su
  contrato requiere project. No demuestra un fallo con entrada válida.
- documents_kinds/documents_templates: el test no inicializa Documents hub.
  El entrypoint de API sí lo construye; no se presume cobertura global del módulo.
- Tres resultados padre arrastran esos fallos. No son tres defectos adicionales.

Estos fallos impiden afirmar una validación completa de MCP de todos los
módulos. No se ocultaron ni corrigieron fixtures ajenos para poner verde la
suite. Los escenarios Studio propios y el recorrido MCP real de RC se evalúan
por separado; el alcance propuesto es un candidato de Studio aislado.
La comparación por nombre contra el control devuelve cero fallos nuevos y cero
eliminados. Los 17 casos propios de Studio de la suite global están aprobados;
son un conjunto diferente de los 17 fallos heredados.

## Versiones mezcladas y base compartida

Se arrancó la API anterior **65c4587b, contrato v4**, contra el esquema completo
actual. Arranca y su SQL sigue operativo, pero GET de un documento v5 devuelve
400. Una escritura con payload v4 y revisión actual devuelve 200 y **pierde
fillPaint, shape y los caps nuevos**. Se comprobó el documento resultante y se
restauró mediante la API nueva, solo en la base desechable. Los validadores
históricos reales v3/v4 también rechazan v5; no se simuló una interfaz antigua
completa ni se garantiza compatibilidad de cualquier versión histórica.

| Combinación | Consecuencia |
| --- | --- |
| API/Web nuevas, JSON v1–v4 existente | Normaliza y guarda v5; probado |
| API v4, esquema actual, JSON v4 | Puede operar; no implica compatibilidad v5 |
| API v4 o validador cliente v3/v4, JSON v5 | Lectura rechazada; escritura downlevel puede perder propiedades |
| Web antigua con API nueva | El cliente antiguo no interpreta v5; forzar recarga/actualización |
| Web nueva con API antigua | Rechazo de v5 y funciones/rutas no garantizadas; no admitido |
| Worker/API/Web de distintos SHAs | No es una combinación certificada; usar el mismo conjunto de imágenes |

El Worker actual arrancó en la base aislada sin errores de imports. No ejecuta
migraciones/seed por su CMD, pero sí trabajos de fondo: no debe conectarse a
datos compartidos durante una prueba. No se garantiza que un Worker histórico
sea compatible con todos los servicios actuales.

**Actualizar una instalación con PostgreSQL compartido requiere coordinación y
ventana de mantenimiento**: detener escritores antiguos y trabajos, respaldar,
actualizar el conjunto, controlar migraciones/seed y forzar actualización de
clientes/PWA. No permitir dos instalaciones de contratos diferentes escribiendo
en esos mismos documentos. Publicar imágenes no realiza esa actualización.

## Empaquetado y versión candidata

Tags exclusivamente locales, todos con label OCI revision igual al SHA:

- `runly-studio-rc1:32fe936c-api`
- `runly-studio-rc1:32fe936c-web`
- `runly-studio-rc1:32fe936c-worker`

Image IDs comprobados (IDs locales, no digests de un registro publicado):

| Imagen | Image ID |
| --- | --- |
| API | `sha256:930388e69f5f8870ea34a9416365788266599328a29ec55db2146fb76af2faa9` |
| Web | `sha256:0aef046a66750c11c983049994114b6921738ac76c6b7c7ac64aa39e87c1b940` |
| Worker | `sha256:26e7043053b53a576dd95dcf12900ba4068a088fa008d3015e3fa0687e2c9731` |

Plataforma comprobada: linux/amd64; ARM64 no validado. API y Worker incluyen
apps/shared, migraciones y contratos MCP/MirAI. Web incluye fuentes y recursos,
configuración pública inyectada en nginx y Studio/Fabric fuera del grafo inicial.
La inspección descarta secretos de servidor en los JS distribuidos.

El lockfile del candidato es el blob `1159cd013c293f5f4417ad52744ea6e840d61fd1`,
con pnpm 9.15.0. Las instalaciones Docker usaron frozen-lockfile. No hubo cambios
de dependencias ni del script general de release en esta tarea.

El dry-run inicialmente decía «sin cambios» porque el registro local de releases
ya apuntaba a a19b1c9f; eso no demuestra qué existe remotamente. En el nuevo
checkpoint detectó API/Worker/Web. No se ejecutó docker:release ni se sobrescribió
api-latest/web-latest. Transcriber, TTS y Backup quedan fuera de esta revisión.

Proponer tags inmutables `api-studio-rc1-32fe936c`, `web-studio-rc1-32fe936c` y
`worker-studio-rc1-32fe936c`, guardar sus digests de registro después de una
publicación autorizada y desplegar por digest. No reutilizar estos nombres para
otro contenido; un tag no es inmutable por sí solo sin esa política.

## Rollback y publicación posterior

Una vez escritos JSON v5, **no es seguro volver a una API/Web v4 conservando la
misma base**. No hay conversión automática de downgrade ni rollback SQL seguro
que recupere propiedades eliminadas. Preferir corregir hacia adelante o volver
a un conjunto v5 compatible ensayado. Para volver a v4 hace falta restaurar un
respaldo anterior coherente de base y Storage en un destino aislado, comprobarlo
y cambiar de destino durante mantenimiento. Restaurar una base compartida entera
puede perder escrituras de otras aplicaciones; no hacerlo como rollback parcial.

Los siguientes comandos son **solo una referencia para ejecución manual tras
autorizar una publicación**. No se ejecutaron. El registro es un ejemplo y debe
sustituirse explícitamente. Publican artefactos ya verificados, sin reconstruir
desde los archivos concurrentes del workspace ni actualizar una instalación:

```powershell
$rcRegistry = 'registry.invalid/runly'
foreach ($kind in @('api', 'web', 'worker')) {
  docker image inspect "runly-studio-rc1:32fe936c-$kind"
  docker tag "runly-studio-rc1:32fe936c-$kind" "${rcRegistry}:$kind-studio-rc1-32fe936c"
  docker push "${rcRegistry}:$kind-studio-rc1-32fe936c"
}
```

Antes de publicar, contrastar los image IDs con rc1-result.json y verificar que
sus labels corresponden al candidato. Ningún comando de despliegue ni de
migración de una instalación está autorizado por este informe.

## Evidencia y decisión

Artefactos privados/ignorados bajo `.artifacts/studio/rc1-32fe936c/` y el proyecto
Docker indicado en integration.log: builds, dry-run, regresión, renderer, suite
MCP, integración, migraciones/seed, capturas, IDs, logs de servicios y limpieza.
Los resultados estructurados están en `runly-studio-e2e-*/rc1-result.json`.
No copiar test.env ni logs con valores operativos a archivos versionados.

`pnpm check:privacy` permanece en rojo con 65 hallazgos anteriores en reglas y
pruebas de red, un aviso legal de fuente y documentación ajena. No se ocultaron
ni se modificaron esos archivos. La comprobación de los archivos propios no
introduce direcciones, credenciales o datos de estación de trabajo. El reporte
no equivale a una aprobación global de privacidad del repositorio.

No hubo publicación, push, despliegue, conexión al VPS ni acceso a datos reales.
Los proyectos Docker de ensayo se cerraron eliminando únicamente sus propios
contenedores y volúmenes. Las imágenes con tags temporales quedan locales.

**GO:** es seguro publicar esta release candidata de Studio del SHA indicado para
un entorno de pruebas aislado, con API/Web/Worker alineados y PostgreSQL/Storage
independientes. No autoriza actualizar la instalación con base compartida ni
mezclar versiones; ese escenario requiere coordinación, respaldo y mantenimiento.
