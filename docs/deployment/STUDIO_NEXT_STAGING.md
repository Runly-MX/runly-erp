# Studio Next 1.0: ejecución controlada de staging

> **Sustituido** por [STUDIO_NEXT_PRODUCTION_RELEASE.md](STUDIO_NEXT_PRODUCTION_RELEASE.md): no existe un staging
> independiente; las revisiones de este documento ya no son el candidato.

Estado: **preparado, no ejecutado.** Nada de este documento se ha corrido contra un VPS ni una base
compartida. Reutiliza los procedimientos ya revisados de
[runly-studio-test-upgrade.md](runly-studio-test-upgrade.md) (imágenes con tag dedicado, override
por digest, rollback), [backup-recovery.md](backup-recovery.md) y
[EXTERNAL_UPDATE_REHEARSAL_PLAN.md](EXTERNAL_UPDATE_REHEARSAL_PLAN.md).

## Candidato congelado (2026-11-16)

| Pieza | Revisión |
| --- | --- |
| runly-erp `main` | `6576fc09798f5e0fa2de64e0786e03085138689f` (código de Studio Next = `ca778628`, más docs y script) |
| Paquetes compartidos | 8 privados `0.1.0-source.ca778628b583480acfea3714083bc451c482f582` (run 44001841552) |
| runly-developer-hub `main` | `903906887d607d7cef14a8fbc0df6693a5916ab7` (lock en `ca778628`, `github-packages`) |
| runly-web `main` | `25223391b4c9ac26abcae095ed5e7941578dc2ea` (contrato Studio v2 sincronizado) |

Si cualquiera de los `main` avanza antes de ejecutar, se congela la nueva SHA y se repiten
`node scripts/verify-studio-package.mjs --build-api-image` (ERP) y `shared-packages-clean` (Hub).

## Datos que debe aportar el operador (bloquean la ejecución)

1. Host de staging del ERP: carpeta de instalación y modo (`local`/`external`) comprobados con
   `docker compose ls` y labels; nunca la instalación de producción.
2. Base de staging: identidad (host, base, proyecto Supabase) distinta de producción, y respaldo
   **probado** de PostgreSQL y de todos los buckets Storage (ver runbook de backup).
3. Hub de staging: instancia y URL donde corre `903906887…`, su feed de recursos y la clave de firma
   **de staging** (nunca la de producción) más su clave pública para el ERP de staging.
4. Autorización explícita para: publicar imágenes con tag dedicado, aplicar migraciones en la base
   de staging, actualizar el Hub de staging y firmar una plantilla de prueba en su catálogo.

## Orden de ejecución

1. **Respaldo e inventario** (lectura): imágenes/digests actuales de API/Web/Worker,
   `prisma migrate status` contra la base de staging, hashes de env files y Compose.
   Criterio: si el respaldo no se ha restaurado con éxito en otro lado, se detiene aquí.
2. **Imágenes del ERP** con tag dedicado (no `latest`, no `docker:release:all`), desde
   `6576fc09…` con árbol limpio: bloque «Publicación propuesta» de runly-studio-test-upgrade.md.
   Registrar los tres digests.
3. **Migraciones** (solo base de staging): las pendientes se aplican en orden de nombre con
   `prisma migrate deploy` (el actualizador lo hace). Studio Next añade
   `20270107000000_studio_v8_protocol` (trigger: un cliente de protocolo 3 no puede modificar
   documentos v8); detrás viene `20270107100000_growth_property_alert_recipients` (otra área,
   aditiva). La migración v8 es segura con la API anterior: ningún documento es v8 hasta que la API
   nueva lo escriba. Todas son aditivas; no hay down.
4. **ERP**: override por digest y `up -d --no-deps` de API y Web (Worker solo si no comparte base
   con otro entorno), según «Comandos preparados para el VPS». Comprobar `/health` y
   `GET /studio/interchange/schema` → `formatVersion: 2`, `documentSchemaVersion: 8`,
   `readableFormatVersions: [1, 2]`.
5. **Hub de staging**: `prod:release` de `903906887…` (verifica los 8 paquetes del lock y prepara la
   raíz del validador desde los paquetes publicados); activar `MARKETPLACE_VALIDATOR_ROOT` con esa
   raíz. Comprobar `runly_studio_contract` → `formatVersion: 2`, `documentSchemaVersion: 8`.
6. **ERP → feed de staging**: configurar en el ERP de staging la URL del feed del Hub de staging y
   su clave pública de recursos (nunca la de producción).

## Prueba de aceptación en staging

Con un usuario de prueba de una empresa de prueba:

1. Crear un diseño de 3 páginas (foto privada, textos, formas), animar (entrada/salida/énfasis,
   keyframes, transición fundido y deslizar) y Presentar.
2. Descargar → Proyecto Studio: el diálogo no pide aceptar pérdida de animaciones; el archivo
   abre como ZIP con `manifest.json` `formatVersion: 2`, `documentSchemaVersion: 8`.
3. Importar ese archivo en Studio: abre con las mismas páginas, efectos y keyframes; Presentar
   reproduce lo mismo; editar un texto se guarda.
4. Hub de staging: crear una plantilla `studio_template` con ese diseño (o por MCP), validar
   (evidencia `passed`, formato 2), vista previa, revisión y aprobación; publicar en el catálogo
   de **staging**.
5. ERP de staging: Marketplace → la plantilla aparece instalable → Crear copia → abrir, editar y
   Presentar; comparar con el original.
6. Compatibilidad: importar un `.runlystudio` v1 antiguo (abre como v7) y exportar un diseño
   estático (sale v1).

## Criterios de rechazo (se detiene y se hace rollback)

- `/health` falla o cualquier error 5xx nuevo en logs de API/Web durante la prueba.
- `migrate status` muestra migraciones fallidas o fuera de orden.
- El paquete exportado no es v2/8, pierde un efecto, keyframe, transición o recurso, o contiene
  URLs/tokens.
- El Hub rechaza el paquete v2 o lo valida con formato 1.
- La plantilla instalada difiere del documento del Hub o no se puede editar/presentar.
- Un paquete v1 deja de importarse, o un diseño v7 se convierte en v8 sin edición de movimiento.
- Un usuario sin permiso puede importar o una empresa ve recursos de otra.

## Rollback

- Código: volver a exportar las tres variables de imagen a los digests guardados en el paso 1 y
  repetir `up -d --no-deps` (sin seed de la imagen antigua). La API anterior es compatible con el
  esquema migrado mientras no existan documentos v8; si ya los hay, no volver a la API anterior:
  los documentos v8 quedan protegidos por el trigger (la API vieja recibe error, no los corrompe).
- Base/Storage: solo restaurando el respaldo del paso 1, coordinado con cualquier otro entorno que
  use esa base. No hay migraciones down.
- Hub: reactivar la release anterior (lock `afc28075`) y su raíz de validador; los paquetes
  publicados son inmutables y no se borran.
