import { createAutomationsMiraiCapabilities } from '../../routes/automations/mirai-capabilities.js';

// External AI clients can read automations and propose creating (always paused) or
// pausing/activating one; deleting stays inside Runly. Sensitive: an automation acts
// on its own later, so proposals need the extra confirmation.
export function createAutomationsAdapter({ prisma }) {
  const capability = createAutomationsMiraiCapabilities({ prisma });
  return {
    moduleKey: capability.moduleKey, label: capability.label, queries: capability.tools,
    actions: capability.actions.filter((action) => action.key !== 'automations.automation.delete'),
    sensitive: true,
    effects: ['Crear una automatización (siempre en pausa) o activar/pausar una existente. Las automatizaciones actúan solas después, en segundo plano; nunca se expone la dirección secreta de un webhook.'],
  };
}
