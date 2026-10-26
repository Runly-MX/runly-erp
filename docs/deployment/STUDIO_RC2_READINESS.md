# Studio — preparación de RC2 local

Fecha: 2026-10-26. Candidato de producto congelado:
`c5f22aeed8bd70f69d75cd63c13fba6065100598`.
API, Web nginx y Worker se construyen desde el mismo archivo Git y declaran ese
SHA en `org.opencontainers.image.revision`. Los commits posteriores del harness
o del informe no sustituyen esa identidad. RC1 `32fe936c` permanece intacta;
su certificación no se reutiliza. La UI concurrente de `5c52d00a` se incorporó
después del congelado: queda preservada y fuera de estas imágenes. El resultado
Docker no certifica automáticamente el HEAD posterior.

| Imagen local `runly-studio-rc2:c5f22aee-*` | ID verificado |
| --- | --- |
| `api` | `sha256:fe221001d9cb0d48a3271e334914c2064884f9c338c73addf2423015370e7ecd` |
| `web` | `sha256:5e955ed206776d779586d70422774249cb72bc45dfc98f1110a9bf3c01d96cbf` |
| `worker` | `sha256:6a5ee04d8e68091893c56db8c03e595a32a50c25761dc980a43d14a58bb0b352` |

Solo se utilizan Docker local, puertos loopback, identidades sintéticas y una
base Supabase nueva con comprobación de identidad antes de escribir. No se
carga la configuración de la instalación habitual. No hubo SSH, acceso al VPS,
escritura en una base compartida, publicación de imágenes ni despliegue.

## Correcciones del candidato

- PNG/JPG conservan exactamente la escala solicitada o rechazan el tamaño.
  Se elimina el límite silencioso que reducía la resolución. JPG aplana el
  fondo translúcido sobre el color de página en lugar de producir negro.
- Antes de exportar se confirman los cambios pendientes y se compara la escena
  revisada con la revisión del servidor. Se vuelve a consultar autorización y
  revisión antes de descargar. Una modificación concurrente rechaza el resultado.
- PDF exige revisión coincidente, autorización inicial/final y archivos vigentes.
  El servidor verifica la relación entre píxeles, medidas físicas y 300 ppp;
  rechaza orientación EXIF, PNG multipágina, entradas inválidas y exceso de tamaño.
  Un trabajo PDF por proceso limita la concurrencia de decodificadores.
  La revocación bloquea una nueva descarga; no elimina píxeles que el cliente
  recibió legítimamente antes de perder acceso.
- Protocolo 2: negociación autenticada y sin caché, cabecera obligatoria en
  PUT y lotes. Un cliente nuevo detecta API antigua antes de enviar cambios;
  un cliente antiguo recibe 426. La cola y el borrador se conservan, sin recarga
  automática que borre trabajo pendiente.
- Migración aditiva `20261207000000_studio_protocol_guard`: los UPDATE de
  documento/nombre/revisión v6 requieren la marca transaccional del servicio
  nuevo. También impide bajar de versión. Una API antigua no puede ignorar la
  protección aunque no conozca la cabecera. No se alteran migraciones históricas,
  checksums ni `_prisma_migrations`.
- Las copias sin revisar se archivan separadamente del autosave actual. Cargar
  una revisión confirmada y continuar editando ya no las borra ni sobrescribe.
  Recuperar/descartar retira únicamente la copia elegida; otra queda disponible.
  Se elimina la caducidad automática de siete días. Si la cuota impide archivar,
  se conserva el slot anterior y se muestra el aviso de falta de copia.

## Límites de exportación

| Recurso | Límite explícito |
| --- | --- |
| PNG/JPG | 80 millones de píxeles; 16,384 px por lado; escala 0.25–8 |
| PDF a 300 ppp | 32 millones de píxeles; 16,384 px por lado |
| Medida de corte | 10–2,000 mm; también debe cumplir el límite de píxeles |
| Sangrado API | 0–10 mm; interfaz 3 mm |
| Imagen de entrada/PDF resultante | 64 MiB cada uno; el multipart tiene además su límite HTTP |
| Decodificación PDF concurrente | Un trabajo por proceso; otro recibe 429 |
| Fotos del editor | 25 MP decodificados agregados y 8,192 px por lado |

80 MP equivalen a unos 305 MiB de un solo buffer RGBA y 32 MP a unos 122 MiB.
Son presupuestos de píxeles, **no un límite absoluto de RSS**: hay lienzo activo,
codificadores, copias y buffers adicionales. Se rechaza antes de renderizar o
decodificar lo que excede los presupuestos; no se promete que un dispositivo
con poca memoria pueda exportar al máximo. Los errores conservan el documento.

El PDF contiene una imagen JPEG rasterizada RGB o `/DeviceCMYK`, con alfa
aplanado sobre blanco, TrimBox, BleedBox y marcas opcionales. No es PDF/X, no
incorpora un perfil ICC específico de imprenta y no conserva vectores/textos
editables. La conversión CMYK genérica puede cambiar colores. Debe aprobarla la
imprenta para un trabajo concreto. Referencia de la conversión:
[Sharp colour](https://sharp.pixelplumbing.com/api-colour/).

## Política de recibos

Se mantiene el recibo en `audit_log`, con digest y resultado original, asociado
a empresa, actor, diseño, clientId y batchId. El índice único parcial
`studio_operation_receipt_identity` permite consultar esa identidad. El recibo
no se duplica al reintentar ni pierde la autorización actual del diseño.

No existe una caducidad demostrada para las colas de clientes ausentes; por eso
**no se purgan recibos por antigüedad**, ni se asume que borrar un diseño o
desactivar un usuario habilite a borrar su identidad idempotente. No se encontró
un job genérico de retención de AuditLog en el código revisado; las eliminaciones
encontradas corresponden a fixtures y rollback de un importador específico.
Cualquier retención externa de AuditLog debe excluir estos recibos.

Para RC2 aislada: datos sintéticos, duración acotada y eliminación completa del
entorno por el runner. Para una instalación permanente: conservar todos los
recibos, monitorear bytes de heap/TOAST/índices y crecimiento diario, presupuestar
según sesiones simultáneas y no habilitar escala sin esa capacidad. Una futura
separación de auditoría y recibos compactos deberá conservar búsqueda/digest y
ack original o introducir épocas de cliente que rechacen explícitamente lotes
caducados. Requiere migración compatible y prueba de reconexión; no se implementa
una purga ni esa migración sin demostrar que sea necesaria y segura.

## Compatibilidad y futura actualización

La futura publicación debe coordinar migración aditiva y API/Web/Worker de la
misma versión. Los escritores antiguos deben quedar bloqueados antes de habilitar
documentos v6. Un rollback de API sobre la base protegida rechaza escritura v6;
no se debe quitar el trigger para permitir que un escritor antiguo la degrade.
La recarga del cliente es manual, conservando copias locales para revisión.
No se ha aplicado esta secuencia a una instalación existente ni compartida.

La vista remota del arrastre queda como entrega independiente. Los cursores y
la presencia no equivalen a preview de objetos. El canal actual no concede a
clientes difusión arbitraria: abrirlo para enviar transformaciones exige un relay
efímero autorizado, throttle, expiración y revocación verificables. El arrastre
definitivo sigue persistiendo al soltar; no hay SQL por cada movimiento.

## Verificaciones y veredicto

**GO para RC2 local aislada del SHA indicado. NO GO para una instalación
compartida o una publicación general con esta evidencia.** No se ejecutó ninguna
publicación. El resultado no certifica la UI posterior de `5c52d00a` ni elimina
los fallos MCP globales o los hallazgos generales de privacidad.

Ejecución nueva completa, `phase=all`, `passed=true`: **40 grupos aprobados,
cero fallos y cero omisiones E2E**. Son 36 grupos de dominio y cuatro de
infraestructura/inspección; no se cuentan dos veces los mensajes resumen.

| Cobertura de la ejecución final | Grupos |
| --- | ---: |
| Colaboración, recibos, historial, plantillas, MCP abierto y seguridad | 13 |
| Degradados | 4 |
| Fotografías | 4 |
| Fotografías dentro de formas | 5 |
| Descargas y cambios/revocación durante exportación | 5 |
| Medición de recibos y reconexión tras reinicio | 2 |
| Compatibilidad API/Web y pestañas antiguas | 3 |
| Arranque/migraciones, nginx/bundle, PDF independiente y Worker | 4 |

Los **221 registros de migración** tienen checksum idéntico al SQL de la imagen;
su SQL normalizado coincide con Git. Worker arranca sin errores de importación.
El runner terminó eliminando únicamente sus contenedores, red y volúmenes.
La evidencia local está en
`.artifacts/studio/runly-studio-e2e-d0f7bbce7f85/rc2-result.json`, con logs,
imágenes descargadas, PDF, rasterizados y captura de la recuperación antigua.
El harness utilizado incluye `bccb3228`; su SHA no sustituye al de producto.

Reproducción, con las tres imágenes locales conservadas:

```sh
node scripts/verify-studio-rc2.mjs --revision=c5f22aeed8bd70f69d75cd63c13fba6065100598
```

### Exportaciones finales

Se descargaron y decodificaron PNG/JPG de **600×400, 1200×800 y 1800×1200**.
El lector autorizado puede exportar; PNG conserva alfa real y la multiplicación
de opacidades. Los recursos incluyen Lato local, grupo, fotografía en estrella,
degradado y objeto parcialmente fuera de página. Un cambio de A o de MCP durante
la exportación de B impide descargar la revisión antigua. Revocar a B durante
el acceso al original también impide la descarga; el GET posterior devuelve 404.

Ambos PDF tienen imagen de **1946×1321**, resolución efectiva **300.0206 ppp**,
corte **158.75×105.8333 mm**, sangrado de 3 mm y hoja de 178.75×125.8333 mm.
PyMuPDF inspeccionó cajas, espacio de color, rotación cero, ausencia de máscara
alfa y de OutputIntent, y rasterizó las marcas y el contenido. El error máximo
de muestras fue 1 canal RGB y 21 tras CMYK genérico; las tolerancias previas
eran 5 y 25. También se revisaron visualmente ambos rasterizados.
Las pruebas de API rechazan PNG malformado, falsa resolución, EXIF rotado,
dimensiones excesivas y decodificadores concurrentes; una barrera de procesamiento
verifica revocación y cambio de revisión antes de responder.

### Recibos: medición final

Un actor/diseño por perfil, transporte HTTP real y `studio-sync` con ventana
de 80 ms. No es una prueba de capacidad multiusuario ni una promesa de latencia
en otro equipo. El perfil de escritura contiene texto completo de unos 5,400
caracteres; transformar un grupo modifica 200 objetos.

| Perfil | Tiempo / eventos locales / lotes SQL | Lotes/s | Metadata media/máxima (B) | Commit p95 (ms) | Metadata estimada en 8 h (MB decimales) |
| --- | --- | ---: | ---: | ---: | ---: |
| Escritura continua | 120.1 s / 3944 / 1258 | 10.48 | 462.4 / 464 | 46.4 | 139.5 |
| Soltar arrastre | 15.1 s / 15 / 15 | 0.99 | 436 / 436 | 54.9 | 12.5 |
| Grupo de 200 objetos | 15.0 s / 71 / 71 | 4.73 | 1851.1 / 1852 | 63.3 | 252.2 |

`pg_column_size(metadata)` mide el payload almacenado, con compresión, sin todo
el overhead de tuplas/TOAST/índices. La relación completa de AuditLog creció
1,224/32/8 KiB respectivamente, y todos sus índices 432/16/8 KiB. Son páginas
adicionales reservadas: pueden reutilizar espacio libre y no equivalen al coste
total por fila del perfil. El índice parcial de recibos terminó en 264 KiB.
Los tres EXPLAIN usan **Index Scan de `studio_operation_receipt_identity`**;
ejecución SQL 0.042/0.042/0.064 ms y búsqueda HTTP 12.5/11.7/22.6 ms.

Las ocho horas son extrapolación, no ocho horas observadas: cien escritores
continuos al ritmo medido implican unos **14 GB de metadata** por jornada,
además del resto del almacenamiento. Por eso conservar indefinidamente y
monitorear no basta para autorizar escala: antes de producción se debe definir
capacidad y una estrategia compatible de recibos compactos/épocas. RC2 aislada
permanece acotada. No se debilita idempotencia ni se introduce una purga.

Después de medir se envejecieron **solo recibos sintéticos a 400 días**, se
reinició realmente la API y se reenvió el primer lote. Devolvió su ack original
de revisión 2 sin cambiar la revisión actual ni ejecutar de nuevo las operaciones.
Esto comprueba persistencia y ausencia de filtro temporal; no simula 400 días
reales de uso, retención externa o expiración de credenciales.

### Matriz de compatibilidad final

| Combinación | Resultado observado |
| --- | --- |
| API RC1 + base protegida v6 | PUT antiguo devuelve 500 por el guard SQL; JSON/revisión quedan intactos |
| API RC1 + Web nueva | Detecta protocolo ausente, conserva cola y no envía POST de cambios |
| API nueva + Web RC1 | Escritura sin handshake devuelve 426; borrador se conserva |
| Pestaña RC1 sin notificaciones + actualización coordinada | PUT real recibe 426; al cambiar a Web nueva la copia sobrevive a **dos recargas** |
| Documento v5/v6 | Lectura/creación antigua se normaliza; downgrade explícito de v6 devuelve 409 |
| Operación anterior `upsert` | Aceptada con protocolo 2; semántica histórica conservada |

Se bloquean explícitamente notificaciones HTTP/Realtime en el ensayo de pestaña
antigua para comprobar la barrera del servidor sin falsear identidad ni permisos.
Con notificaciones, el cliente RC1 ya había bloqueado Guardar por conflicto antes
del PUT. Las pruebas no interpretan ese bloqueo seguro como pérdida de datos.

La regresión de árbol local se repitió tras corregir texto y recuperación:
**1,402 pruebas, 1,401 aprobadas, cero fallos, una omisión preexistente**, 148
suites. Incluye Studio, Canvas, Notes, POS, Projects, Files, SDK/UI y paquetes
compartidos, autenticación, historial, plantillas, SQL y seguridad multiempresa.
El árbol local incluye cambios concurrentes: esa cifra no sustituye la prueba
de producto congelado con las tres imágenes.

Chrome/Fabric reales comprobaron PNG/JPG ×1/×2/×3, muestras de alfa y fondo
JPEG, foto enmascarada, agrupación, fuente local, recorte fuera de página,
render real de 4,096² y rechazo de 4,096² ×3 sin reducción. La exportación no
modificó documento/historial. Este ensayo del renderer se ejecutó después de
los cambios de escala/aplanado; la comprobación de revisión del componente
React se valida adicionalmente en las imágenes.

### MCP global: fallos heredados separados

La nueva ejecución global con PostgreSQL 18 desechable produjo **207 casos,
188 aprobados, 17 fallidos y 2 omitidos**. Los 17 nombres coinciden con los
documentados en [el diagnóstico previo](runly-studio-geometry-local.md): 14
hojas y tres padres; no equivalen a 17 defectos independientes. No se presenta
la suite MCP global como aprobada. MirAI está incluido en las consultas de
dominio y tampoco se certifica globalmente sin esas reservas.

| Casos heredados | Causa verificada en el log nuevo |
| --- | --- |
| `notes: lectura…`, metadatos Yjs, `notes_search/get/page`, recursos privados, adjuntos de Notes, conflictos/asociaciones y SDK de siete dominios | El fixture no tiene `parent_note_id`; fallan altas y pruebas dependientes |
| `projects_workload`, `projects_time_summary` | Input vacío aunque el contrato requiere proyecto |
| `documents_kinds`, `documents_templates` | Fixture sin inicialización de Documents hub |
| Lecturas completas, dominios oficiales, MCP integrado | Padres que propagan fallos de sus subtests |

### Controles de repositorio

Lint dirigido: aprobado. `pnpm check:privacy`: falla por **67 hallazgos fuera
de esta entrega**, incluidos archivos concurrentes. La inspección de todos los
archivos propios, incluido este informe, dio cero hallazgos. No se copian valores
sensibles a este documento.

React Doctor final del árbol concurrente: 80/100, una incidencia de updater con
efectos secundarios en la UI de otra sesión y nueve advertencias.
Ese updater no está en el candidato congelado; se conserva el trabajo ajeno.
No se declara que todo el árbol de trabajo esté certificado por estas imágenes.

## Siguiente trabajo local

Integrar la UI posterior de `5c52d00a` en otro candidato y repetir su Docker/E2E;
resolver los fixtures MCP de Notes/Projects/Documents y las incidencias de UI
concurrente; diseñar el relay autorizado para preview de arrastre y el presupuesto
de recibos de instalaciones permanentes. Todo puede seguir usando bases
independientes locales. PDF/X, perfiles de imprenta y vectores requieren una
necesidad concreta y otra validación; no se incluyen por inferencia en este GO.
