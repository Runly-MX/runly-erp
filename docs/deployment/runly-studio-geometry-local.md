# Studio — rellenos, geometría y regresión local

Trabajo directo en main. Sin SSH, servicios externos, publicaciones, migraciones
en bases compartidas ni datos empresariales. Se conservaron los cambios locales
concurrentes en plantillas, SDK y navegación. No se rediseñaron controles visuales.

## Estado y decisiones

| Capacidad | Estado |
| --- | --- |
| Fotos, máscaras, copias privadas, tipografía, grupos planos, SVG | Existían; conservadas y verificadas |
| Plantillas persistentes, aprobación MCP y MirAI | Existían; ampliadas para referencias en rellenos |
| Rellenos de foto en rectangle, ellipse/circle y vectores rellenos compatibles | Implementado en contrato y motor |
| Relleno habilitado, color, borde, dash, radio, opacidad | Persistidos y renderizados; borde centrado |
| Siete extremos independientes de línea | Implementados, con compatibilidad de booleanos v4 |
| Previews de formas y firma privada de fotos de plantilla | Implementadas sin cambios de layout |
| Controles nuevos y sustitución del drop antiguo | Conexiones documentadas para la sesión visual |
| Borde inside/outside, gradientes, vectores abiertos como marco | No admitidos; se rechazan, no se simulan |
| Grupos anidados y escalado/giro de grupo | Pendientes de la entrega anterior |
| Quitar fondo | Prototipo aislado, sin activación ni descarga automática |

Se eligió v5 con `fill` hexadecimal como color base y `fillPaint` discriminado
solid/image. Cambiar directamente `fill` a un objeto rompería controles,
miniaturas y revisión anteriores. v1-v4 se normalizan lógicamente; no se añadió
migración SQL. La forma conserva tipo, ID, posición, orden y estilos al cambiar
su foto. El original de Files nunca se sobrescribe.

La corrección `65c4587b` elimina escapes innecesarios de comillas en un tagged
template SQL. No cambia selección, permisos ni datos; se ejercitó con PostgreSQL
real en las pruebas posteriores.

El contrato completo y las funciones que debe conectar la UI están en
`docs/architecture/studio-editor-ui-contract.md`. El drop antiguo que convierte
una forma en imagen debe usar `setPhotoFill`; no se reemplazó el trabajo visual
concurrente. Las miniaturas existentes sí reciben el renderer y firmas nuevas.

## Evidencia local

- `node scripts/verify-studio-local.mjs --tests-only`: 1341 aprobadas, cero fallos,
  una omisión preexistente. Studio, Canvas, Notes, POS, Projects, SDK, UI,
  permisos, JWT y paquetes compartidos, con PostgreSQL Docker desechable.
- `node scripts/verify-studio-browser.mjs`: renderer Fabric real; rectángulo,
  círculo, elipse y vector con foto; encuadre, color anterior, transformación,
  borde, opacidad, sustituir/quitar, duplicar, clipboard y undo/redo; PNG y JPG
  idénticos tras JSON/reapertura; siete extremos, fuentes y regresión de marcos.
- `node scripts/verify-studio-supabase.mjs --photos-only`: nueve grupos aprobados
  con Auth, Storage, Postgres y API reales en Docker desechable. Incluye copias
  de fotos normales y rellenos, guardado/reapertura, historial tras retirar la
  última foto, firmas, empresa ajena, revocación, MIME falso, plantilla personal,
  publicación empresarial autorizada y bloqueo de fotos privadas ajenas.
- `node scripts/verify-studio-supabase.mjs --source-ref=700ec880`: 42 grupos
  aprobados en un recorrido completo: 10 generales, siete de colaboración,
  cuatro de recursos, seis de composición, seis creativos, cuatro de fotos y
  cinco de rellenos. Incluye WebSocket/RLS real, caída de Storage y firmas
  expiradas; el frontend se compiló desde ese snapshot sin checkout. El
  renderer/cola de estilos más reciente se verificó además con el runner de
  Fabric, y el build web final incluye el main concurrente posterior.
- Build web y ESLint aprobados. React Doctor: 90/100, cero errores y cuatro
  advertencias en componentes de plantillas modificados por la sesión visual.
- `pnpm check:privacy`: 65 hallazgos globales preexistentes/ajenos. No se
  alteraron avisos de licencia ni se ocultaron hallazgos. La inspección enfocada
  de los 45 archivos propios terminó con cero hallazgos.

Artefactos ignorados: `.artifacts/studio/geometry-regression.log`,
`geometry-renderer.log`, `renderer-result.json`, `geometry-supabase.log`,
`geometry-supabase-full.log`,
`geometry-mcp-control.log`, `geometry-mcp-final.log`,
`geometry-mcp-comparison.json`, `geometry-build.log`, `geometry-lint*.log` y
`geometry-react-doctor.log`. Las URLs y credenciales efímeras no se versionan.

Las firmas de diseño y plantilla revalidan ACL y archivo después de Storage.
La auditoría backend guarda referencias retiradas en la misma transacción;
hasta 50 eventos recientes permiten historial sin conceder Files genérico o
capacidades transferibles entre diseños. La deshabilitación del archivo y la
revocación de membresía/colaboración siguen cortando el acceso. Las firmas ya
emitidas tienen su TTL; no se promete revocar retroactivamente sus bytes.

## Diagnóstico exacto de los 17 fallos MCP

Control reproducido desde un archivo Git de `65c4587b`, extraído bajo artefactos
ignorados, sin checkout, ramas ni worktrees. Se reutilizaron los mismos paquetes
instalados y ejecutó el mismo `scripts/test-runly-mcp.mjs`, con PostgreSQL 18
Docker vacío e independiente. Control: 205 casos, 186 aprobados, 17 fallidos,
dos omisiones anteriores. Actual: 206 casos, 187 aprobados, los mismos 17 fallos
y dos omisiones anteriores. Comparación por nombre: cero fallos nuevos.

| # | Nombre del caso fallido | Causa comprobada |
| --- | --- | --- |
| 1 | notes: lectura, scopes/permisos, empresa/módulo, aprobación/rechazo, altas/ediciones, concurrencia e idempotencia | Fixture SQL Notes sin `parent_note_id`; error PostgreSQL 42703 |
| 2 | Notas: los cambios de metadatos conservan el estado Yjs concurrente | No existe la nota cuyo alta falló en el caso anterior |
| 3 | notes_search | Consulta usa `n.parent_note_id`, ausente del fixture |
| 4 | notes_get | Falta el ID de la nota que no se creó |
| 5 | notes_page | Consulta usa `ch.parent_note_id`, ausente del fixture |
| 6 | projects_workload | Se invoca con `{}`; el contrato requiere `project` |
| 7 | projects_time_summary | Se invoca con `{}`; el contrato requiere `project` |
| 8 | documents_kinds | El fixture no inicializa el Documents hub; `documents_unavailable` se convierte en invalid_request |
| 9 | documents_templates | Mismo hub sin inicializar; no es fallo del contrato Studio |
| 10 | Lecturas completas, paginación y metadatos sin firmar URLs de almacenamiento | Padre de los siete fallos de consulta 3–9 |
| 11 | Recursos privados y compartidos: Notas, PFM, Ledger, Proyectos, Calendario y Archivos | Vuelve a alcanzar Notes y la columna ausente |
| 12 | Adjuntos notes.note: aprobación, relación private-reference, permisos e idempotencia | `ids.notes` no existe; aserción del fixture |
| 13 | Adjuntos: conflictos, workflow de Compras y referencias privadas no convierten lecturas en escrituras | Resolución de la referencia Notes sin ID |
| 14 | Adjuntos: recursos privados ajenos y roles de solo lectura no permiten asociaciones nativas | Misma resolución Notes sin ID |
| 15 | SDK MCP: contratos de salida reales y consultas HTTP de los siete dominios | Error SQL P2010 al consultar Notes desde el SDK real |
| 16 | dominios oficiales con servicios y datos reales | Padre con ocho subcasos fallidos |
| 17 | MCP integrado: OAuth, SDK oficial y datos reales de Inventario | Padre de dominios oficiales |

Son 14 fallos hoja y tres padres; no 17 defectos independientes. Las causas se
localizan en `mcp/__tests__/official-domains.js`,
`mcp/__tests__/module-attachment-cases.js`, el contrato de
`projects-mirai-load-queries.js` y `documents-services.js::requireHub`.
El runner MCP instala una selección antigua de migraciones Notes; no reproduce
su esquema actual completo. No se cambiaron estos fixtures, operaciones ni
expectativas ajenas para volver verde la suite, y no se añadieron skips.

Reproducción actual: `node scripts/test-runly-mcp.mjs`. Para control histórico:
extraer `git archive 65c4587b` en una carpeta ignorada, resolver las dependencias
locales ya instaladas y ejecutar allí el mismo comando. Ambos runners crean y
eliminan su propia base Docker; nunca cargar `.env` ni apuntar a otra base.

La nueva prueba Studio verifica rellenos y caps vía prepare/aprobación/commit,
create/update/detail, template_save/template_detail, uso empresarial y revocación.
El resto de los casos Studio anteriores continúa aprobado. Esto no demuestra
que los módulos ajenos estén libres de errores en otros entornos.

## Recursos y cierre

El snapshot E2E registra 12 chunks iniciales: 751555 bytes (210032 gzip).
Studio tiene una entrada diferida de 239478 bytes y Fabric reside en un chunk
compartido diferido de 298156 bytes; esas dos cifras no son el total de todas
sus dependencias. La verificación recorre imports reales y comprueba que Fabric
no está en la carga inicial. No se introdujo el modelo de quitar fondo en el
bundle, Docker de producción ni dependencias.

El límite del editor sigue siendo 25 MP decodificados por documento y 8192 px
por lado. Cambiar borde/color no vuelve a descargar ni decodificar la fotografía;
los cambios de estilo encolados se combinan sobre el estado vigente. Las fotos
de preview se procesan con dos trabajos concurrentes y salida acotada; no se
promete rendimiento constante en fotos de 25 MP con filtros CPU.

Commits propios de código/pruebas: `a7afcd3b`, `c38d2be0`, `700ec880`,
`55864d54`, `60ce1c2c`; los cambios
concurrentes de plantillas se preservaron en su commit independiente.
