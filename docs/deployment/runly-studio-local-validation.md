# Runly Studio: resultados de validación local

Continuación implementada: [Supabase real, recuperación e historial](runly-studio-supabase-local.md).

Inspección: 2026-10-25. Base inicial revisada: `7ad08075`, posterior a
`3bd72ff6`, `4a65e871` y `7db85cb0`. Todo el trabajo se hizo en main.
No se conectó al VPS, publicó una imagen ni ejecutó un despliegue. Las únicas
consultas a la base configurada fueron transacciones explícitas READ ONLY.
Todas las escrituras y reproducciones SQL usaron contenedores locales desechables
con datos sintéticos. No se cambiaron migraciones históricas ni su registro.

## Dos checksums: causa y estado efectivo

Los hashes originales recuperados con `git show` coinciden exactamente con los
registrados en la base; no se trata de diferencias de CRLF:

| Archivo | Contenido aplicado | Cambio posterior |
| --- | --- | --- |
| `20260902000000_chat_message_search` | `89613ccc` (2026-09-02): crea extensiones, wrapper `atlas_unaccent` sin SET search_path, columna generada `body_norm` y tres índices GIN. SHA256 `848708925b7a53974e9f428f42411b4af39397237a92ca5b1bdf8589a059455e`. | `7ddb4980` (2026-09-20): añade `SET search_path = public, extensions` al wrapper. El commit reúne aislamiento, migraciones y herramientas de verificación; no explica individualmente esta línea. Su efecto correctivo se reprodujo: el original falla al crear los índices en PostgreSQL 18 con 42704; el actual pasa. La intención concreta se infiere del código y de la reproducción. |
| `20260911120000_notes_realtime_authorization` | `9e53c73d` (2026-09-11): activa RLS en realtime.messages y crea cuatro políticas de recepción/envío para Notes. SHA256 `8aaea6d5ea3527160f011fb2e2cae0a2aefe69b310d5d5e5bb2280b26f1eac27`. | `839ff095` (2026-09-20): elimina solamente el ALTER TABLE y añade una explicación explícita del fallo de ownership en instalaciones nuevas. Es deliberado y está acompañado por `scripts/enforce-supabase-schema-ownership-policy.mjs`. |

Ambas originales se terminaron de aplicar el 2026-09-14, antes de sus ediciones.
La edición histórica explica el aviso del preflight, pero este aviso por sí solo
no demuestra una incompatibilidad de Studio.

**Chat:** `b091d467` añadió el 2026-09-14 la migración forward ya existente
`20260914010000_fix_function_search_path`: fija `public, pg_catalog` y reemplaza
el ajuste de cualquiera de las dos variantes anteriores. La base inspeccionada
tiene exactamente ese proconfig; `unaccent` y `pg_trgm` están en public, y
`atlas_unaccent('Árbol Ñandú')` devuelve `Arbol Nandu`. Las dos variantes llegan
al mismo estado funcional tras ese forward, comprobado en PostgreSQL 18.6.

**Notes:** ambas variantes llegan a las mismas cuatro políticas después del
forward `20260911130000_notes_realtime_authorization_fix`. El estado esperado
actual incorpora además los forwards de aislamiento de recursos y revocación
de septiembre: helpers con search_path vacío, validación de propietario/shares,
empresa habilitada y recurso no borrado; recepción con revisión de autorización.
El catálogo leído tiene RLS habilitado, helpers y políticas posteriores; no se
espera que conserve literalmente las políticas iniciales. La política restrictiva
de envíos del forward de revocación reserva la escritura al relay autorizado.

Supabase permite gestionar políticas mediante supautils y mantiene RLS habilitado
en su tabla administrada. Eliminar el ALTER evita el error 42501 de ownership;
no elimina RLS. [Referencia oficial](https://supabase.com/docs/guides/realtime/authorization).
La reproducción con PostgreSQL puro confirma el rechazo del ALTER como no
propietario y la equivalencia de políticas como propietario; no simula la
excepción de ownership de supautils ni una conexión WebSocket real.

En la consulta final se encontraron **214 migraciones locales y 214 aplicadas**,
ninguna pendiente, fallida ni desconocida; siguen las dos diferencias históricas.
El preflight conserva `ready=false` y código 2: no se añadió una excepción que
oculte el aviso ni se usó migrate resolve.

## Riesgo reproducido y diseño que preserva historial

No se encontró un fallo funcional atribuible a estos checksums en la base
configurada. Sí existe una limitación separada de portabilidad de Chat: si
unaccent está en extensions, el forward de search_path que excluye extensions
produce 42704. Se reprodujo con datos sintéticos. Restaurar a ciegas el SQL
original agravaría las instalaciones nuevas y Notes volvería a fallar por ownership.

Se diseñó y probó un candidato de corrección **fuera de prisma/migrations**, en
`scripts/verify-migration-history.mjs`: obtener el namespace de unaccent desde
pg_extension y recrear solamente el wrapper con función y diccionario plenamente
calificados, quoting de identificadores/literales mediante pg_catalog.format y
search_path=pg_catalog. Conserva firma y dependencias. Pasó en public y extensions,
con ambas historias y ejecución repetida. No mueve extensiones ni toca datos.

Si se decide admitir ese layout, el candidato puede convertirse en un forward
nuevo después de revisar su matriz de versiones, permisos y equivalencia de la
normalización sobre fixtures representativos. Llegaría a instalaciones existentes
y nuevas manteniendo las variantes actuales de los históricos. Hay que comprobar
columnas generadas e índices antes de decidir cualquier recálculo/reindexado si
la normalización cambia. No se añadió ese forward porque la configuración
inspeccionada funciona y no se está cambiando ahora el soporte de namespaces.
Notes no necesita un forward adicional por la diferencia investigada.

## Studio: lo comprobado y sus límites

| Área | Evidencia |
| --- | --- |
| Crear y editar | React real y Fabric en Chrome: diseño vacío, texto, rectángulo, círculo, imagen; cambios de texto, posición y dimensiones, incluida la imagen. Plantillas y contrato validados por tests. |
| Guardar y reabrir | Servicio real contra PostgreSQL; prueba independiente con Prisma real; JSON conserva objetos editables tras reload. UUID generado en base, revisión y auditoría. |
| PNG | Exportación UI 1080×1080; prueba del renderer 640×480 con comprobación de píxeles de formas e imagen original. Pruebas de 20/200/500 objetos; ninguna excepción de navegador. |
| Auth y permisos | Middleware real verifica JWT local: rechaza token ausente, inválido, expirado o firmado con otra clave. Router rechaza grants denegados. Empresa/propietario ajenos no pueden leer ni editar. Las identidades y grants son fixtures, no login real de Supabase. |
| Files | SDK envía multipart con contexto Files y conserva los bytes originales en el fixture; servicio consulta FileAsset real de prueba y rechaza archivos ajenos, deshabilitados o de MIME no soportado. Upload, signed URLs y Storage HTTP están interceptados en la prueba UI; no prueban el router Files ni un bucket real. |
| Contrato JSON | Allowlist propia v1, sin JSON Fabric ni URLs firmadas; tamaños y tipos limitados, IDs únicos; rutas rechazan JSON malformado y cuerpos grandes. |
| Recuperación | Fallo 503 al guardar conserva edición local y revisión persistida; un reintento guarda. Conflicto 409 conserva cambios y no pisa la versión guardada. Dos escrituras concurrentes aceptan una sola revisión. Fallo de auditoría revierte la transacción. |
| Presentación | Capturas desktop, dark y móvil de 375 px; sin desbordamiento horizontal. |

**La vertical de edición/persistencia/exportación funciona en el entorno local
aislado. No se certifica todavía el recorrido completo de producto con login
Supabase Auth, concesiones reales de membresía y Files/Storage reales.** No hizo
falta escribir en la base compartida para estas pruebas. El stack aislado usa
contratos mínimos de tablas; otra ejecución aplicó el historial completo y seed
a un PostgreSQL vacío con contratos mínimos de auth/realtime, sin arrancar sus
servicios. Ninguna de esas ejecuciones equivale a un Supabase completo.

## Regresión y correcciones locales

- **1254 pruebas aprobadas, 0 fallidas y 0 omitidas** en la repetición final: Studio, Canvas, POS, Notes,
  Proyectos, core, module-engine/compiler, SDK, UI, middleware Auth y JWT. El
  preflight de índices de module-engine se habilitó contra la base desechable.
- **214 migraciones + seed** aplicados a otra base Docker vacía; **14/14** pruebas
  de aislamiento aprobadas, incluyendo Notes, búsqueda Chat, POS y Proyectos.
- Los nuevos commits `3cdf271f` y `7ad08075` están en la base revisada; se probaron
  formatos/servicios de tiempo y el resto de tests de Proyectos y paquetes.
- Durante el cierre entró `9ee91177` (carga de trabajo y overview de Proyectos).
  Se revisó su alcance y se repitió el runner completo, incluyendo sus cinco
  pruebas nuevas; navegador, persistencia y exportación de Studio volvieron a pasar.
- Se corrigió el import de un test MediaGallery: groupMedia ya vive en un JS puro;
  importar el componente JSX fallaba bajo node:test. No cambia la UI.
- El fixture del test de aislamiento exponía solo $queryRaw/instanceConfig;
  se añadió el delegate real company que necesita el resolver actual. El 500
  inicial pertenecía al fixture incompleto, no al resolver de producción.
- Se ampliaron pruebas de Studio para imágenes deshabilitadas/de otro propietario,
  Auth HTTP real con JWT y recuperación de errores UI. Se añadieron dos runners
  locales reproducibles. ESLint y diff-check de estos cambios pasan.
- `pnpm check:privacy`: 63 hallazgos heredados; los archivos de esta entrega se
  revisan además individualmente. El bundle de prueba conserva un warning previo
  de clave assignOperator duplicada en el dominio Chat del SDK, fuera de estos cambios.

Había trabajo concurrente de Proyectos sin commit durante la ejecución; no se
incluye en los commits de esta entrega ni se declara validado como versión final.

## Repetir y continuar sin VPS

Con dependencias, Docker, Chrome, Playwright y la imagen local postgres:18 ya
disponibles, ejecutar desde la raíz:

```sh
node scripts/verify-migration-history.mjs
node scripts/verify-studio-local.mjs
node scripts/verify-user-isolation.mjs
```

Los dos runners nuevos crean su contenedor con contraseña aleatoria, puerto
loopback dinámico y sin leer .env. Lo detienen y eliminan al terminar; no inician
workers. El runner de aislamiento existente fuerza ambas URLs de Prisma a su
propio contenedor antes de migrate/seed. Logs, resultados JSON y capturas se
guardan en `.artifacts/studio/` y están ignorados por Git.

Para continuar el MVP localmente: levantar Auth y Storage de prueba independientes
y probar login/RBAC y el router Files sin interceptores; mejorar la recuperación
de conflictos con una acción para preservar y recuperar la copia local; probar
imágenes ausentes/URLs expiradas y ofrecer reintento; después añadir historial
deshacer/rehacer y gestión de capas. No hace falta VPS para ese trabajo. La
primera entrega sigue siendo de una página y privada por propietario/empresa;
colaboración, multipágina y exportaciones adicionales quedan fuera de lo validado.
