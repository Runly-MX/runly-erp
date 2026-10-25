import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createModuleManifest, MODULE_KINDS } from '@runly/core'
import { loadHelpBlueprints } from '@runly/module-engine'

export const studioMap = createModuleManifest({
  key: 'runly.studio', name: 'Studio', version: '0.1.0', kind: MODULE_KINDS.CORE, core: true,
  description: 'Diseño gráfico y edición multimedia', category: 'productividad',
  icon: 'PenTool', color: '#D946EF', pwa: { shortName: 'Studio', startPath: '/' }, uninstallable: false,
  dependencies: [{ key: 'runly.identity' }, { key: 'runly.company' }, { key: 'runly.files' }],
  lifecycle: { installable: true, uninstallable: false, resettable: false, supportsDataPurge: false },
  navigation: [{ label: 'Mis diseños', path: '/', icon: 'PenTool', layout: 'main', permissionKey: 'studio.view' }],
  permissions: [
    { key: 'studio.view', name: 'Ver mis diseños' }, { key: 'studio.create', name: 'Crear diseños' }, { key: 'studio.edit', name: 'Editar mis diseños' },
  ],
  acl: { module: 'studio.view', actions: { read: 'studio.view', create: 'studio.create', update: 'studio.edit' }, models: {} },
  blueprints: loadHelpBlueprints('runly.studio', path.join(path.dirname(fileURLToPath(import.meta.url)), 'help/runly.studio')),
})
