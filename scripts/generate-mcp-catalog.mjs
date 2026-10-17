import { writeFile } from 'node:fs/promises';
import { createCapabilityRegistry } from '../apps/api/src/mcp/registry.js';
import { ATTACHMENT_TARGETS } from '../apps/api/src/mcp/attachment-targets.js';

const registry = createCapabilityRegistry({ prisma: {} });
const lines = ['# Catálogo de capacidades MCP', '', 'Generado con `node scripts/generate-mcp-catalog.mjs`. No contiene datos de una instancia.', '', 'Las herramientas disponibles dependen del consentimiento OAuth. Cada operación revalida empresa, módulo, permisos y recurso. Las escrituras siguen `prepare → aprobación web → commit`.', '', '| Herramienta | Scope | Aprobación |', '| --- | --- | --- |'];
for (const tool of registry.tools) lines.push(`| \`${tool.name}\` | \`${tool.scope}\` | ${tool.approvalPolicy} |`);
for (const moduleKey of registry.moduleKeys) {
  const adapter = registry.create(moduleKey);
  lines.push('', `## ${moduleKey}`, '', '| Operación | Modo | Permiso ERP |', '| --- | --- | --- |');
  for (const [mode, definitions] of [['Lectura', adapter.queries], ['Escritura aprobada', adapter.actions]]) {
    for (const definition of definitions) lines.push(`| \`${definition.name ?? definition.key}\` | ${mode} | ${[...new Set([definition.permission, definition.readPermission].filter(Boolean))].map(key => `\`${key}\``).join(' + ')} |`);
  }
}
lines.push('', '## Destinos de archivos originales', '', '`runly_files_import_prepare` admite `target: { type, id }`; `itemId` conserva compatibilidad con Inventario. Consultar `runly_files_query` / `files_attachment_targets` para la disponibilidad de la instancia y `files_record_attachments` para listar archivos de un registro.', '', '`native` crea la asociación del panel existente. `private-reference` guarda un archivo privado en Archivos con una referencia verificable; no modifica el registro ni aparece en su panel nativo. Toda carga requiere `files:write`, `files.assets.create` y `files.assets.read`, además de lo indicado abajo.', '', '| Tipo de destino | Módulo | Modo | Scope del destino para cargar | Permisos del destino |', '| --- | --- | --- | --- | --- |');
for (const target of ATTACHMENT_TARGETS) lines.push(`| \`${target.type}\` | \`${target.moduleKey}\` | ${target.mode} | \`${target.moduleKey.slice(6)}:${target.mode === 'native' ? 'write' : 'read'}\` | ${[target.readPermission, target.writePermission].filter(Boolean).map(key => `\`${key}\``).join(' + ')} |`);
lines.push('', 'Inventario conserva sus ocho operaciones y sus cuatro herramientas base de identidad/descubrimiento. RME3 con metadata `mcp.version=1` continúa siendo solo descubrimiento; no se anuncia CRUD ejecutable.', '');
await writeFile(new URL('../docs/integrations/RUNLY_MCP_CATALOG.md', import.meta.url), lines.join('\n'));
