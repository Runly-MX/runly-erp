# Notes: almacenamiento privado y referencias históricas

Base local 079e13aa, main limpio. No desplegar, publicar ni acceder a instalaciones
existentes. Usar exclusivamente la pila Docker desechable para pruebas de escritura.

HEAD crea runly-notes público; atlas-notes solo aparece en documentación histórica.
Las referencias duraderas están en HTML, atributos Y.XmlElement, portada y manifiesto
files de note_canvas_scene. No son capacidades firmadas: getPublicUrl es permanente.

Diseño: buckets privados, registro interno de pertenencia nota/objeto, lectura de
bytes mediante API que revalida acceso o publicación en cada solicitud, sin redirects
ni capacidades de lectura persistidas. Web obtiene blobs para visualización/exportación;
atributos originales, Y.Doc y manifiestos no se reescriben. Recursos públicos se sirven
solo en contexto de slug vigente y referencia presente en documento publicado.

Transición sin borrados: inventariar referencias actuales y objetos; detectar cruces
de empresa, referencias ambiguas/faltantes; registrar asociaciones históricas una vez;
cerrar bucket actual y legado; verificar acceso raw denegado antes de publicar API.
Reintentos idempotentes. Nunca volver a abrir un bucket como rollback. Respaldar DB y
objetos antes del upgrade; conservar originales y nombres. Clientes antiguos requieren
Web nueva para imágenes: no guardar URLs temporales ni modificar CRDT para adaptarlos.

Pruebas: Auth/Storage/PG reales, matriz owner/editor/lector/ajeno/otra empresa/anónimo,
revocación y publicación, variantes raw, histórica HTML/Y.Doc/canvas, exportación,
fallo Storage y reintento. Validar GUI desktop/móvil y regresiones compartidas. Informe
final en docs/deployment/NOTES_PRIVATE_STORAGE_SECURITY_CLOSURE.md con límites reales.
