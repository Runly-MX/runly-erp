# Studio: intercambio portable de plantillas

## Decisión y alcance

Primera vertical: paquete `.runlystudio`, exportación autorizada, inspección sin
efectos, preparación durable, confirmación idempotente y creación independiente
de diseño o plantilla personal/empresarial. Sin controles visuales nuevos. Se
conservan documento v7 y protocolo 3. No se modifican migraciones históricas.

| Formato | Fidelidad y límites | Seguridad y mantenimiento | Licencia y coste | Decisión |
| --- | --- | --- | --- | --- |
| ZIP + JSON Studio | Conserva todas las primitivas, páginas y recursos nativos editables | Gramática cerrada, límites antes de extraer, validador v7 existente | Especificación pública; licencia del contenido independiente; coste medio | Formato nativo inicial |
| SVG 2 | Geometría vectorial, pintura y texto; layout/CSS/filtros y fuentes requieren interpretación | No es seguro insertar XML arbitrario; subconjunto positivo y conversión explícita | Estándar abierto; derechos de cada ilustración siguen siendo propios; coste medio por subconjunto | Primer adaptador, rechazo explícito de funciones no soportadas |
| OpenRaster | Pila de capas e imágenes; no garantiza multipágina, texto editable ni máscaras del motor | ZIP/XML/PNG; requiere mapear composición y advertir modos incompatibles | Especificación abierta, contenido con licencia independiente; coste medio | Segundo adaptador posterior |
| ODG | Dibujo, páginas, estilos y texto, con semántica distinta a Studio | ZIP/XML y relaciones múltiples; gran superficie de interpretación | Estándar abierto OASIS; no concede derechos del contenido; coste alto | Estudio posterior, no implementar apresuradamente |

Fuentes primarias consultadas:
[SVG 2 W3C](https://www.w3.org/TR/SVG2/),
[OpenRaster: contenedor](https://www.openraster.org/baseline/file-layout-spec.html),
[OpenRaster: capas](https://www.openraster.org/baseline/layer-stack-spec.html),
[OpenDocument 1.3: paquetes](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part2-packages/OpenDocument-v1.3-os-part2-packages.html).
La sección de esquema ODG es demasiado grande para la herramienta de consulta;
no se atribuye compatibilidad ODG a esta entrega. La tabla es una evaluación de
implementación, no una certificación de otras aplicaciones. SVG interoperará
solamente en el subconjunto declarado; ORA/ODG se rechazan como no soportados.

## Contrato portable

MIME `application/vnd.runly.studio+zip`. `mimetype` es la primera entrada STORED,
sin salto final. ZIP v2.0 STORE/DEFLATE; sin cifrado, ZIP64, multivolumen ni enlaces.
`manifest.json`, `document.json`, `assets/`, `previews/` y `licenses/` usan rutas
relativas ASCII. Los directorios opcionales pueden no tener entradas físicas.

`formatVersion: 1` y `minReaderVersion: 1` son independientes de
`documentSchemaVersion: 7`. `kind` es design/template. Identificador y autor son
datos no autoritativos; jamás se usan para autorizar, deduplicar entre empresas,
sobrescribir registros ni conceder acceso. El manifest describe páginas, hashes,
recursos, fuentes conocidas y licencias declaradas. No contiene IDs de empresa,
propietarios, permisos, sesiones, URLs firmadas, buckets ni claves Storage.

`document.json` mantiene la estructura v7; únicamente las referencias de imagen
se sustituyen por IDs locales `asset-<sha256>`. El lector comprueba correspondencia
exacta con el inventario, materializa referencias Files nuevas y valida v7 antes
de guardar. Los hashes comprueban integridad, nunca confianza ni titularidad.
Fuentes: referencias a familia/variante, sin copiar archivos tipográficos.
Una fuente desconocida bloquea esta versión; no se sustituye silenciosamente.

Presupuestos iniciales: 64 MiB comprimidos, 128 MiB descomprimidos, 256 entradas,
100 imágenes, 10 MiB por imagen, 4 MB JSON, profundidad 3, 32 directorios, expansión
máxima 200:1, hasta 25 MP por imagen y por escena. El escritor usa STORE para no
producir paquetes que excedan el límite de expansión. Solo PNG/JPEG/WebP de firma,
MIME, dimensiones y decodificación comprobadas. Previews PNG y licencias de texto
son datos, nunca se ejecutan. Entradas no declaradas o rutas conflictivas fallan.

## Autorización y lifecycle

Exportar exige lectura actual del diseño/plantilla, autorización de descarga de
cada recurso y comprobación posterior de acceso/revisión. Incluye copias de las
imágenes; el solicitante debe confirmar expresamente que podrán salir de la
empresa. La UI mostrará esa explicación antes de llamar al endpoint. No se
rasteriza geometría nativa. No hay descarga por URLs suministradas en un paquete.

Inspeccionar valida y devuelve informe + preview declarativo acotado, sin SQL ni
Storage. Preparar vuelve a validar y autorizar el destino, reserva un job durable
ligado al actor/empresa y sube imágenes privadas independientes mediante Files.
Antes de subir cada blob, Files registra bucket/key en el journal. Así también
puede compensarse una caída entre Storage y la creación de FileAsset.
Los FileAssets se crean únicamente al confirmar, dentro de la transacción del
destino. El staging no expone filas Files ni concede acceso a otros miembros.

Confirmar bloquea el job, revalida membresía, permisos y referencias, crea el
destino y marca el resultado en la misma transacción PostgreSQL. Los servicios de
diseños y plantillas reutilizan esa transacción, no se presupone una transacción
distribuida con Storage. Un reintento devuelve el mismo resultado autorizado.
Cancelación/fallo/TTL limpian solamente recursos del job no confirmado. Un fallo
de limpieza mantiene el journal para reintento; jamás se olvida el blob pendiente.
Se exponen recuperación/limpieza explícitas, también después de reiniciar API.

Cuotas de staging por empresa y actor se reservan bajo bloqueo SQL; no se
deduplica contra recursos privados de otros usuarios. Dentro del paquete, un
SHA-256 idéntico comparte una copia. IDs de fila son generados por DB; IDs de
contenido se renuevan preservando grupos, orden y relaciones entre páginas.

Destinos: diseño (`studio.create`), personal (`studio.templates.manage`), empresa
(`studio.templates.publish`). Empresa siempre es una selección explícita del
solicitante; preparar nunca publica. Imágenes importadas pertenecen al actor y
las plantillas reutilizan las reglas empresariales actuales. Créditos importados
se preservan como declaraciones no verificadas; no se convierten en autoridad.

## SVG

Adaptador independiente del importador monocromo de iconos actual. Rechaza
scripts, DTD/entidades, eventos, foreignObject, enlaces, recursos remotos, CSS,
filtros y elementos desconocidos. Convierte primitivas, colores, trazos y
degradados representables, con grupos planos cuando la composición sea equivalente.
Texto solo si se puede expresar con el contrato tipográfico cerrado; inicialmente
se rechaza layout SVG de texto para no afirmar equivalencia falsa. No hay
rasterización automática ni pérdidas silenciosas. Informe de capacidades y
advertencias previo a confirmación; el cliente debe aceptar advertencias.

## Evolución y evidencia

Cambios incompatibles incrementan formatVersion/minReaderVersion; lectores v1
rechazan versiones futuras sin modificar ni ejecutar el contenido. Cambios de
documento evolucionan por el validador Studio, no por Fabric. Nuevos adaptadores
producen el mismo informe y documento canónico, sin ramificar todo el servicio.

Pruebas versionadas: paquetes adversariales, corrupción y recursos faltantes;
permiso, cuota, interrupción y compensación; export/import entre dos stacks
Supabase Docker nuevos; plantillas empresariales y creadas por MCP; render real,
undo/redo y equivalencia PNG/PDF. No se usan bases compartidas ni despliegues.

### Resultado de la primera vertical

Implementada con codec ZIP/manifest, servicio de staging/compensación, migración
aditiva, router, SDK, esquema generado y guía pública con generador Python probado.
El adaptador SVG es una página editable limitada a translate, primitivas, paths y
pinturas equivalentes; bloquea texto, CSS, recursos externos y otras transformaciones.
Advierte del fondo blanco y del aplanado de grupos anidados. ORA/ODG no implementados.
La interfaz queda pendiente de los controles visuales de la otra sesión.

Evidencia local reproducible:

- `node --test apps/api/src/routes/studio/interchange/package.test.js packages/sdk/src/__tests__/studio-domain.test.js packages/sdk/src/__tests__/studio-interchange.test.js`: 17 correctas.
- `node scripts/verify-studio-interchange.mjs --image=<imagen-local-Studio-v7>`:
  dos instalaciones Supabase nuevas con Auth/Storage reales; roundtrip privado
  multipágina, plantilla MCP mediante OAuth/PKCE/prepare/aprobación/commit, destinos
  personal/empresa, aislamiento, cuotas, revocación, abort, TTL, fallo de Storage y
  recuperación después de reiniciar el servicio. Ocho grupos correctos.
- `node scripts/verify-studio-interchange-renderer.mjs`: píxeles idénticos en dos
  páginas, PDF RGB/CMYK con bytes de imagen equivalentes, documento sin mutaciones,
  texto editable y undo/redo. También pasan browser y viewport existentes.
- `node scripts/verify-studio-local.mjs --tests-only`: 1439 correctas, una omitida,
  cero fallos, exclusivamente PostgreSQL Docker desechable.
- Snapshot de docs y pruebas de documentación MCP correctos. La expectativa antigua
  sobre orden de Inventory fallaba también con el corpus original; ahora verifica
  relevancia de sus tres artículos, además de encontrar la nueva guía por runlystudio.
- React Doctor: 84/100, sin incidencias reportadas en los archivos analizados.
- `pnpm check:privacy`: 67 hallazgos previos ajenos a esta entrega; cero hallazgos
  en los 25 archivos propios. Artifacts de ejecución quedan ignorados.

No se ejecutó E2E completo de todos los productos/navegadores: el cambio se verificó
con integración real del intercambio y el renderer Chromium afectado. No se publicó
ni desplegó; la migración nueva solo se aplicó a instalaciones desechables.
