import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createModuleManifest, MODULE_KINDS } from '@runly/core'
import { loadHelpBlueprints } from '@runly/module-engine'
import { STUDIO_BRANDING } from '../../../../shared/studio/identity.js'

export const studioMap = createModuleManifest({
  key: 'runly.studio', ...STUDIO_BRANDING, version: '0.1.0', kind: MODULE_KINDS.CORE, core: true,
  category: 'productividad', pwa: { shortName: STUDIO_BRANDING.name, startPath: '/' }, uninstallable: false,
  dependencies: [{ key: 'runly.identity' }, { key: 'runly.company' }, { key: 'runly.files' }],
  lifecycle: { installable: true, uninstallable: false, resettable: false, supportsDataPurge: false },
  // Home and editor (`/?design=`) use the whole screen, without the module sidebar.
  fullscreenPaths: ['/'],
  navigation: [{ label: 'Mis diseños', path: '/', icon: STUDIO_BRANDING.icon, layout: 'main', permissionKey: 'studio.view' }],
  permissions: [
    { key: 'studio.view', name: 'Ver mis diseños' }, { key: 'studio.create', name: 'Crear diseños' }, { key: 'studio.edit', name: 'Editar mis diseños' },
    { key: 'studio.templates.manage', name: 'Administrar mis plantillas' },
    { key: 'studio.templates.publish', name: 'Publicar y administrar plantillas de empresa' },
  ],
  acl: { module: 'studio.view', actions: { read: 'studio.view', create: 'studio.create', update: 'studio.edit' }, models: {} },
  blueprints: loadHelpBlueprints('runly.studio', path.join(path.dirname(fileURLToPath(import.meta.url)), 'help/runly.studio')),
})
