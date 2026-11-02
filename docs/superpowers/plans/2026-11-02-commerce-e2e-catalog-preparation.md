# Runly Commerce — catálogo E2E permanente en la empresa de pruebas existente

Fecha: 2026-11-02. Candidato de aplicación: `15a42bd4920baf58062a75300d69ee904f0bd334` (código idéntico al de `919a50cff`, con el que se publicaron las imágenes). **ETAPA A completa; la ETAPA B no se ha ejecutado.** Todo lo de este documento se hizo en lectura sobre la base compartida y en una pila desechable para lo demás; no se migró ni se escribió ningún dato en la instancia compartida.

## 0. El error de `update-external.sh` y su corrección

```
INSTALLER_VERSION_REUSED: publish a new Installer version
```

**Causa.** El actualizador del instalador (`infra/installer/update-installer.mjs`, línea 91) se niega a actualizar cuando la versión publicada es la misma que la que ya tiene instalada el servidor pero **los archivos tienen otros hashes**. El commit `6e71bbc0a` (variables de transcripción en `.env.*.example`, `setup-local.mjs`, `setup-external.mjs` y README) cambió el contenido de esos archivos y regeneró `installer-release.json` **sin subir la versión**: seguía en `2026.10.28.7`, la que el VPS ya tenía.

**Corrección** (commit local `5432f2b35`): `infra/installer/release-files.json` pasa a `2026.11.02.1` y se regeneró `installer-release.json` (solo cambió el número de versión; `generate-installer-release --check` pasa). Las pruebas del instalador dan el mismo resultado con y sin el cambio (186 pasan; las mismas 6 fallas preexistentes de las que ya hablamos).

**Lo que debes hacer tú:**
1. `git push` de `main` (el actualizador descarga el instalador desde GitHub por **SHA** de `main`; sin push, el VPS sigue viendo el manifiesto viejo).
2. En el VPS, para fijar el instalador exactamente al commit revisado: `RUNLY_INSTALLER_REF=<SHA completo del último commit de main> ./update-external.sh` (sin la variable toma la punta de `main`).
3. Las **imágenes ya están publicadas** (`api`, `worker`, `web`, `transcriber`, a las 06:07–06:12 UTC del 2026-11-02, desde `919a50cff`). El paso 1/2 es el que falló, así que el VPS **todavía no ha bajado esas imágenes ni migrado nada**.

## 1. Verificación inicial (solo lectura)

Herramienta committeada: `node scripts/e2e-commerce/preflight-shared-db.mjs --env-file .env` (transacción de solo lectura; no imprime URLs ni credenciales; sale con error si hay un bloqueo).

| Hallazgo | Resultado |
|---|---|
| Servidor | PostgreSQL 15.8 (Supabase autoalojado); base de ≈68 MB |
| Perfil `external` | Corre las imágenes `*-latest` de `raulbellosom/runlyerp`; su API ejecuta `prisma migrate deploy` **y** `prisma/seed.js` al arrancar (`infra/docker/api-entrypoint.sh`). La instalación local usa la **misma** base (la del `.env` del repositorio), así que local y external son consumidores del mismo esquema |
| Migraciones del repositorio / aplicadas | 237 / 234 terminadas. **Pendientes: 3** (`20261101210000_catalog_write_integrity`, `20261101230000_pos_receipt_print_jobs`, `20261101233000_commerce_restaurant`). Ya aplicadas: `20261101120000_commerce_recovery_integrity` y `20261101180000_commerce_catalog_stock` (2026-11-01 ≈20:00 UTC) y la de transcripciones (22:13 UTC). No hay migraciones fallidas sin resolver, ni desconocidas. Dos filas antiguas (`20260915212520…`, `20261210000000…`) figuran como revertidas y luego reaplicadas: no bloquean `migrate deploy` |
| Estado del esquema | **Intermedio**: guardas de existencias activas (la migración 2 está aplicada), pero sin `catalog_product.revision` (migración 3), sin `pos_print_job` ni `pos_kitchen_dispatch` (4 y 5) |
| Empresas | 4. **Una sola candidata a E2E**: nombre «Runly Pruebas E2E», slug `runly-pruebas-e2e`, 0 sucursales, 0 terminales, 1 producto de prueba, 0 órdenes, 3 miembros con rol administrador del sistema. Las otras tres son empresas reales (una tiene una sucursal de restaurante sin órdenes) |
| Módulos | `runly.catalog` y `runly.pos`: instalados y habilitados globalmente; sin sobrescrituras por empresa |
| Datos que las migraciones 3–5 podrían tocar | **Ninguno**: 0 mesas, 0 pisos, 0 órdenes abiertas, 0 sesiones, 0 tickets, 0 productos con control de existencias, 0 cajas o turnos duplicados. El relleno de la migración 5 (sucursal de cada mesa) no tiene filas que rellenar |

No se eligió «la primera empresa»: se identificó por nombre y slug, y la herramienta de carga vuelve a comprobarlo contra la API antes de escribir (sección 4).

## 2. Seguridad de la base compartida

**Compatibilidad de procesos conectados**

| Proceso | Hoy | Después de actualizar external |
|---|---|---|
| API/worker/web de **external** (imágenes anteriores) | Ya sufre las guardas de la migración 2: un ajuste directo de existencias lo rechaza el servidor (`commerce_stock_requires_ledger`). Hoy afecta a poco: ninguna empresa tiene productos con existencias controladas | Se reemplazan por el candidato |
| Servidor de **desarrollo local** (`pnpm dev`, código del árbol de trabajo) | Código nuevo contra un esquema sin la migración 3: las ediciones de Catálogo que usan `revision` fallan hasta migrar | Compatible |
| Transcriptor (imagen aparte) | Funciona: la migración de transcripciones solo añade columnas con valor por omisión | Imagen nueva publicada; opcional |
| Respaldo (sidecar restic) | Sin cambios | Sin cambios |
| Cualquier otro árbol de trabajo o instalación antigua apuntando a esta base | **No debe escribir existencias ni precios** del Catálogo | Igual |

Las migraciones son aditivas (comprobado en el ensayo de las 267 tablas); no hay ningún proceso conocido capaz de escribir algo incompatible **después** de migrar salvo código anterior a la migración 2 (arriba).

**Lista de comprobación antes de actualizar external**
1. `node scripts/e2e-commerce/preflight-shared-db.mjs --env-file .env` → «sin bloqueos» y 3 pendientes.
2. **Respaldo reciente y restaurable** de la base compartida: el sidecar de respaldo (`docs/deployment/backup-recovery.md`, `verify-backup.sh`) más un `pg_dump -Fc` hecho justo antes, copiado fuera del servidor. Yo no lo hice (implicaría copiar datos reales a este equipo); no declaro que exista un respaldo: confírmalo tú.
3. Nadie operando POS en las empresas reales (hoy: 0 sesiones y 0 órdenes abiertas).
4. Imágenes publicadas desde el SHA correcto (sección 6).
5. Anotar conteos de control de las tablas `company`, `catalog_product`, `pos_outlet`, `pos_order`, `user_profile` para compararlos después.

**Recuperación.** Ninguna acción de la carga E2E borra datos. Si la actualización fallara: las migraciones de Commerce son atómicas por archivo (una falla no deja un archivo a medias); no reintentar a ciegas, leer el error; el retroceso completo es restaurar el respaldo (se pierde lo capturado después) y arrancar las imágenes anteriores con `RUNLY_SKIP_DB_INIT=1`. **Volver solo el código anterior no es seguro** (rechazaría los ajustes de existencias).

## 3. Catálogo E2E reutilizable

Definición versionada: `scripts/e2e-commerce/catalog-manifest.mjs` (datos sintéticos, prefijo estable `E2E-COMMERCE`, SKU `E2E-COMMERCE-<CÓDIGO>`, códigos de barras de 12 dígitos en un rango privado `29990000xxxx`).

- **36 productos en 10 categorías** (Bebidas, Abarrotes, Accesorios, Electrónica, Ropa y calzado, Bebidas preparadas, Entradas, Platos principales, Postres, Solo web).
- **Tienda**: bebidas, abarrotes, accesorios, electrónica; camiseta (variable CH hereda precio, M y G con precio propio) y tenis (número 27 con precio propio); gorra; códigos de barras; con y sin control de existencias.
- **Restaurante**: bebidas preparadas, entradas, principales y postres; 5 grupos de modificadores (leche opcional, hielo, salsa obligatoria, término obligatorio, extras con precio); estaciones de Cocina y Barra; productos que no pasan por Cocina.
- **Casos técnicos**: precio heredado y propio; SKU; código de barras; impuesto 0 % propio frente a heredado (16 % incluido); disponible en POS por sucursal; solo publicado en Web; no disponible en POS; agotado; existencias distintas por sucursal; sin control de existencias; producto vendido en las tres modalidades.
- **Sucursales** (la empresa E2E hoy no tiene ninguna): `E2E-COMMERCE Tienda` (Tienda), `Restaurante` y `Mixto`, cada una con su caja; 4 estaciones; métodos de pago Efectivo, **Tarjeta externa** (referencia obligatoria; sin integración bancaria) y Transferencia; 6 mesas del restaurante y 3 del mixto, sin Floor Planner.
- **Galería (portada y varias imágenes)**: **no se carga por esta herramienta**: la API de imágenes requiere subir archivos binarios al módulo de archivos y no hay recursos de prueba seguros versionados. Se cubre con la prueba de navegador de galería existente (17/17) y un paso manual de la matriz.

## 4. Herramienta de carga idempotente

`node scripts/e2e-commerce/load-catalog.mjs --status | --plan | --apply`

Variables de entorno (no se imprimen): `RUNLY_E2E_API_URL`, `RUNLY_E2E_COMPANY_ID`, `RUNLY_E2E_EMAIL`, `RUNLY_E2E_PASSWORD`. Usa la API oficial (permisos, auditoría, clave de idempotencia determinista por recurso y el libro de movimientos de existencias); no usa SQL.

**Garantías**
- **Rechaza escribir** salvo que la empresa devuelta por `/company/profile` coincida con el identificador **y** el slug autorizado (`runly-pruebas-e2e`), con `RUNLY_E2E_ALLOW_WRITE=1` y `--confirm-company runly-pruebas-e2e`.
- **Rechaza escribir** si la instancia no expone el contrato Commerce de fase 4 (C0) o los productos no exponen `revision`: es la comprobación de que el servidor y las migraciones ya están actualizados.
- Solo reconoce y actualiza lo que lleva el prefijo (SKU `E2E-COMMERCE-…`, nombres y slugs prefijados); un producto de otro prefijo en la misma empresa **no se adopta ni se modifica**.
- Repetible: lo existente se omite; el desvío de un producto reconocido (precio, nombre, código, publicación) se corrige con un PATCH versionado; no borra, no trunca, no restablece la empresa.
- Existencias: reparte desde la reserva del propio producto hasta el objetivo por sucursal y **nunca resta**; todo queda como movimiento con motivo.
- Una sucursal con el mismo nombre y otra modalidad se informa como conflicto y no se toca.
- Escribe un manifiesto con los identificadores y la finalidad de lo creado o encontrado (`--out`, por omisión en `.e2e/`, ignorado por Git).

**Autoprueba** (`.e2e/commerce-e2e-catalog-selftest.mjs`, solo sobre una pila desechable): **18/18**. Rechazos (sin permiso de escritura, sin confirmación, empresa no autorizada) sin escribir nada; el plan lista todo lo faltante (1 configuración de POS, 3 sucursales, 3 cajas, 4 estaciones, 3 métodos, 9 mesas, 10 categorías, 36 productos); la primera carga crea 69 elementos sin errores; la segunda crea y actualiza 0 y deja idénticos los conteos y los movimientos; el desvío de un producto E2E se corrige; un producto de otro prefijo no se toca; una empresa ajena queda byte a byte igual; sin credenciales en la salida.

## 5. Matriz de aceptación sobre el catálogo

«A» = automatizable (ya existe una prueba o se ejecuta sobre este catálogo); «F» = requiere dispositivo o persona.

| Área | Qué se comprueba | Tipo |
|---|---|---|
| Catálogo | Crear, consultar y editar productos; PATCH que solo cambia lo enviado; variantes y precio heredado/propio; SKU y código; publicación Web independiente de POS; impuesto propio; disponibilidad por sucursal; existencias y movimientos auditados | A (`catalog-integration-validation`, `commerce-phase6-journeys`) |
| Galería | Portada, carga múltiple, orden | A (galería 17) + F (subir fotos reales) |
| Tienda | Abrir caja, escanear, variantes, cambiar cantidades, descuento, cobrar efectivo con cambio, tarjeta con referencia, devolver con reposición, cancelar, cerrar caja y conciliar | A (`pos-retail-ui`, journeys) ; F: lector físico, impresora |
| Restaurante | Abrir mesa, modificadores y notas, enviar a Cocina, extras, dividir (comensal/partidas/importe), cobrar, liberar mesa | A (`commerce-restaurant-ui`, integración) ; F: tableta, Cocina con varias pantallas, impresión |
| Mixto | Alternar Mostrador/Mesas, una sola caja y sesión, mismo catálogo, órdenes con su modalidad | A (journeys) |
| Integridad | Reintentos sin duplicados, concurrencia de la última unidad, permisos y revocación, aislamiento entre empresas, conciliación de importes y existencias | A (PostgreSQL 196, journeys, integración) |
| Tarjeta | La referencia es obligatoria y se captura a mano; no hay integración bancaria | A (referencia) + F (terminal externa real) |
| Accesibilidad / hardware | Lector de pantalla, tableta, impresoras, red | F (`2026-11-01-commerce-phase6-manual-validation.md`) |

Con este catálogo, cada recorrido tiene productos adecuados: escaneo (`BEB-AGUA`), agotado (`BEB-MINERAL`), pocas unidades (`BEB-JUGO`), variantes (`ROP-CAMISETA`), modificador obligatorio (`ENT-ALITAS`, `PRI-HAMBURGUESA`), envíos adicionales (`PRI-PLATILLO`), división por partidas (`PRI-ENSALADA`), existencias por sucursal (`DIF-PILA`) y las tres modalidades (`MIX-CAFEGRANO`).

## 6. Actualización de la instancia external (instrucciones concretas)

Lo que sabemos de tu publicación: `pnpm docker:release` construyó y subió `api`, `worker`, `web` y `transcriber` como `raulbellosom/runlyerp:<servicio>-latest` desde `919a50cff` (el código es el del candidato; solo cambiaron documentos y una herramienta). Esas etiquetas son **mutables**; el script construye con el árbol de trabajo de esta máquina.

1. **Instalador**: aplicar la sección 0 (push + `RUNLY_INSTALLER_REF`).
2. **Digests**: en el equipo que publicó, `docker buildx imagetools inspect raulbellosom/runlyerp:api-latest` (y `worker`, `web`, `transcriber`); anotarlos. No hay forma de saber desde aquí qué digest quedó; sin anotarlo, una publicación posterior de otra persona reemplazaría `-latest`. En el VPS, fijar `image: raulbellosom/runlyerp@sha256:<digest>` en un override si quieres congelar la versión.
3. **Antes del arranque**: respaldo (sección 2) y `preflight-shared-db` en verde.
4. **Primera actualización sin migrar al arrancar** (recomendado): usar el override `docker-compose.no-db-init.yml` (`RUNLY_SKIP_DB_INIT=1`), migrar explícitamente con un contenedor de una sola vez de la imagen nueva del API (`pnpm exec prisma migrate deploy`), esperar «3 migraciones aplicadas», ejecutar `node prisma/seed.js` y luego recrear los servicios con la configuración normal. Si prefieres el camino habitual (el API migra al arrancar), el efecto es el mismo con menos control.
5. **Salud**: `GET /health` del API; el web carga; el worker sin reinicios en bucle; `prisma migrate status` sin pendientes; el transcriptor solo si lo usas.
6. **Datos intactos**: `node scripts/e2e-commerce/preflight-shared-db.mjs --env-file .env` de nuevo (0 pendientes, 4 empresas) y los conteos del paso 5 de la sección 2 sin cambios en las empresas reales.
7. **Permisos nuevos** `pos.refunds.create` y `pos.discounts.apply`: el `seed` los crea sin concederlos a roles de empresa; los administradores del sistema (incluidos los de la empresa E2E) los reciben solos. En empresas reales nadie podrá devolver ni descontar hasta asignarlos (hoy no hay operaciones POS en ellas).

No es seguro por llamarse `external`: el perfil sólo define dónde corren los contenedores; la base y el esquema son compartidos, y todo lo anterior es lo que hace segura la actualización.

## 7. ETAPA B (no ejecutada)

**Condiciones exactas para ejecutarla** (todas):
1. Confirmas que `update-external.sh` terminó bien y la instancia corre las imágenes nuevas.
2. `preflight-shared-db` sale con 0 migraciones pendientes y 1 empresa E2E.
3. Respaldo previo confirmado por ti.
4. Me das, **como variables de entorno en tu sesión** (nunca en archivos ni en el chat), un usuario administrador de la empresa E2E: `RUNLY_E2E_API_URL`, `RUNLY_E2E_COMPANY_ID`, `RUNLY_E2E_EMAIL`, `RUNLY_E2E_PASSWORD`, y `RUNLY_E2E_ALLOW_WRITE=1`. La API debe ser accesible desde este equipo.

Entonces: `--status` → `--plan` → `--apply --confirm-company runly-pruebas-e2e` → repetir `--apply` (0 cambios) → recorridos de la matriz → registrar resultados reales.

## 8. Pendiente

- ETAPA B completa (carga, repetición, recorridos).
- Respaldo restaurable de la base compartida: **sin verificar** (lo confirma el operador).
- Digests de las imágenes publicadas: **sin anotar**.
- Galería con imágenes reales: paso manual.
- Validación física y con lector de pantalla (matriz de la fase 6) y los límites ya documentados (tarjeta sin integración bancaria).
- Reposición de existencias: `--apply` solo sube hasta el objetivo por sucursal y lo toma de la reserva sin asignar del producto; cuando esa reserva se agote tras muchas pruebas, hay que ajustar las existencias del producto manualmente (Catálogo) antes de volver a cargar.
