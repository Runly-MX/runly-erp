# ERP E4 — Cliente firmado del canal de instalaciones (`/installations/v1`)

Estado: implementado y verificado 2026-11-08. Sin despliegue, sin claves reales, recibos apagados.
Contrato: Developer Hub `docs/architecture/marketplace-solutions/contracts/INSTALLATIONS_CHANNEL_CONTRACT_V1.md`,
`packages/contracts/installations.js` y `reviews/HUB_H5_CLOSURE.md` (H5 `990fd20`).

## Regla esencial

El Marketplace público (E2 feed y paquetes, importación E3a) **no usa este canal**: sin clave de instalación, sin
registro y sin H5 sigue funcionando. `marketplace-import-gate.js` no importa nada de E4. Una instalación que no se
actualiza a E4 tampoco pierde nada: el canal es aditivo.

## Piezas

| Archivo | Qué hace |
|---|---|
| `apps/api/src/services/installation-signer.js` | Transporte firmado compartido: clave Ed25519 de la instalación, firma de método + ruta completa + timestamp + nonce + SHA-256 del cuerpo exacto + `Idempotency-Key`, timeout, lectura de la identidad desde el entorno (archivo de clave preferido; recarga opcional tras rotación) |
| `apps/api/src/services/website-registry-client.js` | `/registry/v1` usa ese transporte; mismos errores (`RegistryError`/`RegistryUnavailableError`), cabeceras, vector de firma y configuración. Sus pruebas pasan sin cambios |
| `apps/api/src/services/marketplace/installations-contract.js` | Copia **byte a byte** de `packages/contracts/installations.js` del Hub (SHA-256 fijado en la prueba; si el Hub está junto al ERP, se compara con su archivo) |
| `apps/api/src/services/marketplace/marketplace-install-client.js` | `createMarketplaceInstallClient` y `createMarketplaceInstallClientFromEnvSafe` |
| `apps/api/src/services/marketplace/marketplace-receipts-service.js` | Consentimiento de instancia y envío explícito de recibos `component` |
| `apps/api/src/routes/marketplace-installation-routes.js` | Ajustes de instancia (`platform.settings.manage` + administrador de instancia) |

## Cliente

- `capabilities()` → `GET /installations/v1/capabilities`; acepta solo la respuesta de **esta** instalación.
- `download(releaseId, { maxBytes, sha256? })` → `GET /installations/v1/downloads/{id}`. Valida UUID v4 y exige `maxBytes`;
  lectura en streaming con límite, comprobación de `x-runly-sha256`. **Hoy el Hub responde siempre 404** (DEC-P1): nada
  del ERP lo usa y los recursos públicos se siguen descargando por E2.
- `sendReceipt(receipt, idempotencyKey)` → `POST /installations/v1/receipts`. Valida con el contrato vendorizado antes de
  tocar la red (campos extra como empresa o nombre se rechazan localmente), exige clave estable, firma exactamente
  los bytes enviados. `201` nuevo, `200` repetición (`replay:true`).
- Errores: `InstallChannelError` (respuesta definitiva del Hub: 400/401/403/409/413/422, `retryable:false`, nunca se
  reintenta solo) e `InstallChannelUnavailableError` (red, timeout, 429 con `retryAfter`, 5xx; reintentable con la
  **misma** `Idempotency-Key`). Lee `{code,message}` de H5 y `{error:{code}}` de Registry.

## Configuración (opcional)

`RUNLY_INSTALLATIONS_URL` (opcional) o `RUNLY_REGISTRY_URL`, `RUNLY_INSTALLATION_ID`, y la clave en
`RUNLY_INSTALLATION_PRIVATE_KEY_FILE` (preferido, montado 0600) o `RUNLY_INSTALLATION_PRIVATE_KEY`. Es la misma identidad
de Registry: no hay segunda clave ni claves en tablas de empresas. Sin configuración el cliente es `null`; con una
configuración rota se registra un aviso **sin la clave** y el ERP arranca igual. Ninguna URL está fija en el código.

## Recibos opt-in

- `instance_config['marketplace.receipts.enabled']`, ausente = **apagado**. Una actualización de Runly no lo enciende.
- Lo cambia solo el propietario de la plataforma (o el administrador de una instancia de una sola empresa):
  `GET /settings/marketplace/installation`, `PUT /settings/marketplace/receipts { enabled }` (queda en `audit_log` sin
  empresa), `GET /settings/marketplace/installation/capabilities` (diagnóstico; un Hub inalcanzable no es un error del ERP).
- `reportImportReceipt({ kind: 'studio'|'automation', importId, companyId })`: función explícita, **no conectada a E3a**.
  Lee la importación E3a confirmada de esa empresa y su procedencia verificada (`releaseId`, `sha256`); envía un recibo
  `component` `applied` con fechas estables (creación del job y del recurso creado) y clave `e3a-<kind>-<importId>`,
  así que reintentar repite el mismo recibo. Nunca lanza: devuelve `{ sent, reason, status, retryable }`; un fallo no
  toca la importación local. Sin Solutions ni coordinador E5. Sin telemetría.

## Varios servidores, conectividad y rotación

- **Varias instancias:** cada ERP tiene su propia identidad y clave; el Hub solo conoce claves públicas y no ve bases,
  empresas ni usuarios. Las capacidades son por instalación.
- **Direcciones HTTPS distintas:** la ruta firmada es relativa al Hub (`/installations/v1/...`); la URL base del ERP
  no interviene. En producción el Hub debe configurarse con `https://` (el laboratorio usa HTTP local).
- **Sin conectividad:** catálogo público y E3a siguen con la última copia verificada del feed (reglas E2); el canal
  devuelve `InstallChannelUnavailableError` y los recibos quedan `sent:false, retryable:true`.
- **Rotación:** se rota por `/registry/v1/keys/rotate` (gracia ≤ 7 días); al reemplazar el archivo de clave, el cliente
  E4 lo relee sin reiniciar. El cliente de Registry conserva su comportamiento (lee la clave al arrancar).

## Verificación (2026-11-08)

| Prueba | Resultado |
|---|---|
| `node scripts/verify-marketplace-install-channel.mjs` | 11 bloques / 16 puntos. Hub H5 real (código del Hub en `990fd20`) sobre PostgreSQL 18 desechable con rol `hub_runtime`; **ERP A y ERP B**: dos stacks Supabase desechables (Postgres, Auth, Storage), migraciones y seed de este árbol, identidades y claves distintas; cada paso ERP es **un proceso Node separado** con solo el entorno de su instancia (código real de servicios ERP, no el servidor HTTP del API). Las releases conocidas por el Hub son las del feed H4 de laboratorio (no hay tablas H4 en esa base). Las negativas de protocolo (firma de Registry, nonce repetido, reloj ±400 s, clave vieja) se envían desde el proceso verificador con el código real del cliente y la clave de A: **cliente simulado** |
| `marketplace-install-client.test.js` | contrato byte a byte con el Hub, firma, errores, local antes de red, descargas acotadas, configuración opcional y recarga de clave, servicio de recibos (apagado, estable, nunca lanza) |
| Regresiones | `website-registry-client` (vector de firma intacto), `website-hostname-local`, E3a `marketplace-import`, E2 `resource-catalog`, `env-sync` del instalador |

## Bloqueos para staging y producción

- Enrolar cada instalación real en el Hub (operador) y entregar su clave por archivo montado; conceder capacidades por
  la consola H5.
- Aprobar la retención de recibos del Hub (propuesta de 90 días) y la decisión de producto de recibos (D-E3).
- DEC-P1 sigue abierta: descargas privadas inactivas.
- Falta la interfaz de ajustes para el interruptor de recibos (hoy solo API).
- El Hub H5 aún no está desplegado ni migrado en producción.
