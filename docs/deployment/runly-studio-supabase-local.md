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

## Límites y siguiente desarrollo local

Sin colaboración simultánea ni CRDT propio. El borrador no es un respaldo en
servidor, puede desaparecer si se limpia el navegador y no contiene los bytes
de archivos; requiere acceso vigente a los originales. El historial no persiste
entre sesiones, el clipboard de objetos no es el clipboard del sistema ni cruza
documentos y la revisión del servidor muestra resumen, no un diff gráfico.

Para colaboración: definir colaboradores/ACL por diseño y acceso compartido a
originales, reutilizar autorización/revocación de Realtime, probar presencia,
reconexión y cambios concurrentes antes de activar propagación. Para biblioteca:
selector de assets Files con ámbito, búsqueda/miniaturas, deduplicación y cuotas;
catálogo de plantillas con versiones y licencias. Ambos trabajos pueden continuar
en este Supabase local, sin VPS ni datos de la instalación habitual.

Una sesión concurrente incluyó los archivos nuevos de soporte Studio en
`84ffbcc5`. Se conservó ese historial; las correcciones finales y documentación
se commitean por separado con paths explícitos, sin incorporar cambios ajenos.
