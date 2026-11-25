# Matriz ERP, Atlas y Developer Hub (preparación de Atlas 0.11.0)

Fecha: 2026-11-24. Estado: **preparado, no publicado.** No se modificó el Hub ni se publicó ningún paquete.

## 1. Estado de partida

| Pieza | Versión / SHA | Catálogo Builder |
|---|---|---|
| ERP (`main`) | Atlas 0.11.0 | Registrado: `builder-catalogs/0.11.0.json` (159 bloques) y `0.11.0-erp.json` (160) |
| Hub (`main`, `70a685a`) | Atlas **0.10.0**; paquetes de ERP en `fd16dc513` | Registra hasta 0.10.0 por digest en `marketplace-validation/builder-catalogs.js` |
| Atlas | `v0.11.0` (`c08de3e`) más un commit de pruebas local (`b280fb8`) | Genera el catálogo con `AudioBlock` y `VideoBlock.file` |

## 2. Qué prepara el Hub (verificado en seco)

El Hub adopta un catálogo con `scripts/adopt-website-catalog.mjs --version 0.11.0 --erp ../runly --revision <SHA de ERP>`, que deriva el catálogo canónico del catálogo de ERP y lo registra por digest.

- `--verify 0.11.0` contra ERP: **la regla se cumple** (catálogo canónico derivado = catálogo 0.11.0 de ERP).
- Ejecución en seco sin `--write`: 160 bloques de ERP, 159 canónicos; **digests idénticos a los que ya registra ERP** (`e6ba38a1...` y `5dc92e13...`).
- No se ejecutó con `--write` y no se tocaron manifiestos, lockfile ni catálogos del Hub.

**Por qué no se adopta aún:** el registro del Hub referencia el SHA de ERP desde el que se derivó el catálogo y fija los paquetes de ERP por SHA; ese SHA tiene que ser un commit **publicado**. La adopción es por tanto posterior a la publicación de ERP (orden coordinado de §5). Cambiar solo el número de dependencia de Atlas en el Hub sin ese paso no es una adopción válida.

## 3. Matriz de compatibilidad

| Escenario | Plantillas antiguas (catálogo 0.10.0 o anterior) | Plantillas con `AudioBlock` o `VideoBlock.file` (catálogo 0.11.0) |
|---|---|---|
| Hub 0.10.0 con ERP anterior | Funciona (situación actual) | No existen: ERP anterior no emite 0.11.0 |
| Hub 0.10.0 con ERP candidato (0.11.0) | Funciona: ERP conserva todos los catálogos históricos (las pruebas «Atlas catalogs preserve old ZIPs» pasan) | **Hub las rechaza o no las reconoce**: no tiene el catálogo 0.11.0 registrado (`resolveBuilderCatalog` devuelve `undefined` para una versión no registrada, y la validación del Hub falla cerrada). El mensaje exacto no se probó |
| Hub actualizado con ERP anterior | Funciona | Una plantilla 0.11.0 publicada por el Hub llegaría a un ERP sin catálogo 0.11.0: ERP también falla cerrado por catálogo no registrado. **Ventana de incompatibilidad si el Hub se publica antes que ERP** |
| Hub actualizado con ERP candidato | Funciona | Funciona (digests idénticos verificados) |

Capacidades no soportadas: en los dos sentidos el comportamiento es **rechazo explícito por catálogo/versión desconocidos**, no degradación silenciosa (un bloque `AudioBlock` en un host sin su catálogo no se renderiza a medias). No se definió una degradación (p. ej. convertir el audio en un enlace); si se quiere, es una decisión de producto aparte.

## 4. Contrato nuevo de audio y video (ERP, `7ab16940f`)

Los campos `file` de `AudioBlock` y `VideoBlock` solo guardan `file:<uuid>` de la biblioteca (o vacío). Se rechazan `blob:`, `data:`, URLs escritas, rutas y esquemas ejecutables al validar la página (ruta del asistente externo) y al publicar. El editor usa `blob:` solo como vista temporal: `usePrivateWebsiteAssets` lo traduce a `file:<id>` antes de guardar. Pruebas negativas añadidas en ERP y en Atlas.

## 5. Orden de publicación (sin ventana de incompatibilidad)

1. ERP (API, worker, web) con el catálogo 0.11.0 ya incluido y el flag experimental apagado. Hasta aquí nada exige al Hub: ERP acepta plantillas 0.11.0 y las antiguas.
2. Paquetes compartidos desde el SHA publicado de ERP.
3. Hub: subir Atlas a 0.11.0, ejecutar `adopt-website-catalog.mjs --version 0.11.0 --revision <SHA publicado> --write`, reanclar los paquetes de ERP, pasar sus pruebas de compilación y de plantillas (`tests/website-motion.test.js` fija 0.10.0 y debe actualizarse).
4. Solo entonces habilitar en el Hub la publicación de plantillas con audio y video, y republicar catálogo y plantillas oficiales.

Regla: **ERP siempre antes que el Hub**; si el Hub se adelanta, publica plantillas que ERP rechaza.

## 6. Verificación de navegador de Atlas (v0.11.0)

| Script de Atlas | Resultado |
|---|---|
| `verify-motion-responsive` (Chromium y WebKit, 10 comprobaciones cada uno: HTML de servidor visible, sin JS, movimiento reducido, CLS, desbordamiento 320-1920, táctil, tipografía fluida, punto focal, Ken Burns, hidratación) | Pasa en ambos motores |
| `verify-phase2-browser` | Pasa |
| `test-compositions-browser` (Chromium y WebKit) | Pasa; requiere `NODE_PATH` hacia el `@playwright/test` del Hub |
| `test-editor-ui` | **Falla igual en `v0.10.0` y en `v0.11.0`** (espera el botón «Insertar Imagen» en la línea 172): fallo preexistente de ese script, no una regresión de 0.11.0; no investigado |
| Firefox | No ejecutado (los scripts cubren Chromium y WebKit) |
| 327 pruebas de Atlas | Pasan (ejecución anterior); las pruebas de medios tienen ahora 7 casos |

No cubierto: reproducción real de audio y video en WebKit y Firefox, MCP del Hub con `AudioBlock`, Marketplace de extremo a extremo.

## 7. Actualización 2026-11-25 (verificada en los repositorios locales)

| Pieza | Estado |
|---|---|
| Atlas | `v0.11.1` (`893d34c`, publicado), sobre 0.11.0 más correcciones de geometría responsiva |
| ERP | Adopta Atlas 0.11.1 (`87a6d528d`); catálogo registrado en `apps/api/src/routes/website/builder-catalogs.js` |
| Hub | Adopta Atlas 0.11.1 (`7697e7a`, catálogos `0.11.1.json` y `0.11.1-erp.json` registrados); working tree limpio |

El orden «ERP antes que el Hub» de la sección 5 **ya se cumplió** para 0.11.x: ambos adoptan el mismo Atlas publicado y registran los catálogos 0.11.1, por lo que la combinación ERP 0.11.1 + Hub 0.11.1 es la compatible. Combinaciones con Atlas anterior en uno de los dos lados siguen fallando cerradas por catálogo no registrado (sección 3).

Condiciones de 0.11.0 que siguen abiertas (no resueltas en esta sesión): (1) el Hub no tiene una validación propia del campo `file` de `AudioBlock`/`VideoBlock` (rechazo de `blob:`/URLs/esquemas ejecutables); la regla existe en la API de ERP (`page-document.js`, `7ab16940f`) y en Atlas, pero no se probó que el Hub la aplique al validar un paquete de plantilla; (2) reproducción real de audio/video en WebKit y Firefox; (3) `test-editor-ui` de Atlas, fallo preexistente.
