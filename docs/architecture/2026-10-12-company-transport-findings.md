# Clasificación del control de transporte empresarial

Date: 2026-10-12
Status: discovery complete; implementation and behavioral acceptance pending.
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md (Task 2)

## Resultado actual

`pnpm check:company-scope` falla con nueve archivos. El control busca llamadas
fetch directas por archivo y dispone de una lista explícita de excepciones.
No demuestra por sí solo que una petición carezca de encabezado empresarial.
La revisión de fuente distingue los siguientes contratos; no se agregaron
excepciones ni se modificó el control para presentar un resultado verde.

| Archivo bajo apps/desktop/src/modules/ | Contrato observado | Trabajo pendiente |
|---|---|---|
| runly.attendance/kiosk/lib/kiosk-api.js | /public/attendance; enrolamiento, enlace, secreto de pareo o token Kiosk, sin sesión de miembro | Pruebas de alcance público/capacidad y excepción exacta revisada |
| runly.attendance/lib/attendanceRequest.js | API empresarial: Authorization, companyId, JSON/multipart/Blob y signal | Usar transporte empresarial y verificar empresa antes/después de consumir cuerpo; preservar contratos de sus consumidores |
| runly.canvas/lib/media.js | Descarga de PDF desde URL recibida; comentario y flujo destinados a URL firmada con CORS | Verificar origen de URL en consumidores y descarga sin credenciales empresariales; excepción exacta |
| runly.canvas/lib/renderScene.js | Descarga imágenes desde imageUrls para exportación | Verificar productores de URLs y ausencia de credenciales empresariales; excepción exacta |
| runly.canvas/screens/PublicBoardScreen.jsx | /public/canvas con token de enlace; consultas públicas de Board/páginas/objetos | Pruebas de acceso público y revocación, excepción exacta |
| runly.chat/calls/guest/useGuestChatUpload.js | PUT a uploadUrl devuelta por presignAttachment ligada a sesión del invitado | Prueba presign/PUT sin encabezados de miembro o empresa; excepción exacta |
| runly.files/screens/PublicFileScreen.jsx | /public/files con token de enlace | Prueba de acceso público y revocación, excepción exacta |
| runly.inventory/components/catalogs/CatalogImportDialog.jsx | Plantilla empresarial con Authorization y X-Runly-Company-Id | Descargar mediante transporte empresarial; rechazar Blob tardío tras cambio de empresa antes de crear URL/hacer click |
| runly.inventory/components/InventoryItemImportDialog.jsx | Plantilla empresarial con Authorization y X-Runly-Company-Id | Mismo contrato de descarga y rechazo de contexto tardío |

Los tres casos empresariales ya envían encabezados, pero los bloques revisados
no consultan la empresa vigente después de leer JSON/Blob. Es un riesgo de entrega
de resultados tardíos; no evidencia una fuga de autorización del servidor. Sus
pruebas de comportamiento aún deben reproducir el caso antes de modificar código.

Los seis usos restantes no necesitan seleccionar una empresa de miembro para
cumplir el contrato observado. Esto no acepta toda su seguridad: faltan las
pruebas de capacidades, URLs, errores y revocación indicadas. Una excepción
estática deberá limitarse a un archivo y una razón comprobada; no excluir un
módulo/directorio ni confiar en la presencia textual de un encabezado.

## Próximo alcance

Preparar spec/plan de transporte con mapa exacto de archivos antes de implementar.
Reutilizar createCompanyFetch y el getter de empresa vigente; conservar signal,
multipart y contratos públicos. Revisar las excepciones existentes del guardrail
por separado si aparecen problemas adicionales, sin extender este alcance de
nueve hallazgos silenciosamente. Agregar regresiones del control que demuestren
que un fetch empresarial nuevo fuera de las excepciones sigue fallando.

Verified: 2026-10-12 (control ejecutado: exit 1 con los nueve archivos de la tabla;
revisión de fuente y consumidores directos de attendanceRequest; sin nueva
aceptación de transporte, cambio de guardrail o pruebas de servicios reales).
