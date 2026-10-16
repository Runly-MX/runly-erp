import { writeFile } from 'node:fs/promises';
import { createCapabilityRegistry } from '../apps/api/src/mcp/registry.js';

const registry = createCapabilityRegistry({ prisma: {} });
const lines = ['# Catálogo de capacidades MCP', '', 'Generado con `node scripts/generate-mcp-catalog.mjs`. No contiene datos de una instancia.', '', 'Las herramientas disponibles dependen del consentimiento OAuth. Cada operación revalida empresa, módulo, permisos y recurso. Las escrituras siguen `prepare → aprobación web → commit`.', '', '| Herramienta | Scope | Aprobación |', '| --- | --- | --- |'];
for (const tool of registry.tools) lines.push(`| \`${tool.name}\` | \`${tool.scope}\` | ${tool.approvalPolicy} |`);
for (const moduleKey of registry.moduleKeys) {
  const adapter = registry.create(moduleKey);
  lines.push('', `## ${moduleKey}`, '', '| Operación | Modo | Permiso ERP |', '| --- | --- | --- |');
  for (const [mode, definitions] of [['Lectura', adapter.queries], ['Escritura aprobada', adapter.actions]]) {
    for (const definition of definitions) lines.push(`| \`${definition.name ?? definition.key}\` | ${mode} | \`${definition.permission}\` |`);
  }
}
lines.push('', 'Inventario conserva sus ocho operaciones y sus cuatro herramientas base de identidad/descubrimiento. RME3 con metadata `mcp.version=1` continúa siendo solo descubrimiento; no se anuncia CRUD ejecutable.', '');
await writeFile(new URL('../docs/integrations/RUNLY_MCP_CATALOG.md', import.meta.url), lines.join('\n'));
