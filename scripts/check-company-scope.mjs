import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

// Business screens must use the company transport or the SDK. Public examples,
// signed asset URLs and guest capabilities are deliberately separate.
const root = fileURLToPath(new URL('../apps/desktop/src/modules/', import.meta.url));
const exceptions = new Map([
  ['runly.website/screens/FormApiPanel.jsx', 'Public storefront example snippets'],
  ['runly.website/lib/colorExtract.js', 'Public image pixels'],
  ['runly.chat/lib/chatUtils.js', 'Signed asset downloads'],
  ['runly.chat/calls/callSounds.js', 'Static audio assets'],
  ['runly.chat/calls/callLifecycle.js', 'Leaving a call uses resource ACL even after a company switch'],
  ['runly.chat/hooks/useChatUpload.js', 'Presigned storage upload URL'],
  ['runly.chat/components/MessageAttachments.jsx', 'Signed attachment URLs'],
  ['runly.notes/lib/canvasImages.js', 'Signed image URLs'],
  ['runly.notes/lib/noteClipboard.js', 'Public clipboard image with credentials omitted'],
  ['runly.inventory/lib/intake.js', 'Explicit companyId header and request signal'],
  ['runly.attendance/kiosk/lib/kiosk-api.js', 'Public kiosk capability and pairing credentials; no user session'],
  ['runly.attendance/lib/attendanceRequest.js', 'Shared transport includes explicit companyId header'],
  ['runly.canvas/lib/media.js', 'Signed PDF asset download'],
  ['runly.canvas/lib/renderScene.js', 'Signed image asset download'],
  ['runly.canvas/screens/PublicBoardScreen.jsx', 'Public board capability; endpoints scoped by token'],
  ['runly.chat/calls/guest/useGuestChatUpload.js', 'Presigned guest storage upload URL'],
  ['runly.files/screens/PublicFileScreen.jsx', 'Public file capability; endpoint scoped by token'],
  ['runly.files/screens/PublicFolderScreen.jsx', 'Public folder capability; endpoint scoped by token'],
  ['runly.inventory/components/catalogs/CatalogImportDialog.jsx', 'Template download includes explicit active company header'],
  ['runly.inventory/components/InventoryItemImportDialog.jsx', 'Template download includes explicit active company header'],
  ['runly.inventory/hooks/useInventoryCustody.js', 'Signed document template download; business calls use SDK'],
  ['runly.growth/components/MonitorConnectionDialog.jsx', 'Example snippet shown as text; no request is made'],
  ['runly.inventory/components/catalogs/ModelsPanel.jsx', 'Export call sends the explicit active company header'],
  ['runly.inventory/components/InventoryExportDialog.jsx', 'Export call sends the explicit active company header'],
  ['runly.inventory/lib/guest-api.js', 'Guest capability session (Authorization: Guest); endpoints scoped by the guest token'],
  ['runly.inventory/lib/guest-table-transport.js', 'Injected guest transport over the guest session token'],
  ['runly.lms/hooks/useLmsCertDocx.js', 'Signed certificate download'],
  ['runly.lms/hooks/useLmsCertPdf.js', 'Signed certificate download'],
  ['runly.lms/lib/directUpload.js', 'Presigned storage upload URL'],
  ['runly.notes/lib/noteImageAccess.js', 'Note media: explicit active company header, or the public slug route without credentials'],
  ['runly.studio/components/DesignEditor.jsx', 'Signed asset URL download'],
  ['runly.studio/components/editor/image/useImageTools.js', 'Signed asset URL download'],
  ['runly.studio/lib/fabric-adapter.js', 'Signed asset URL download'],
  ['runly.studio/lib/studio-sync.js', 'transport.fetch is the SDK-backed Studio transport, not the global fetch'],
  ['runly.website/screens/wizard/WizardStepIdentity.jsx', 'Company logo read through its signed URL'],
]);
let checked = 0;
const failures = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await visit(path); continue; }
    if (!/\.jsx?$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
    checked++;
    const source = await readFile(path, 'utf8');
    const key = relative(root, path).replaceAll('\\', '/');
    if (/\bfetch\s*\(/.test(source) && !exceptions.has(key)) failures.push(key);
  }
}
await visit(root);
if (failures.length) {
  console.error('Peticiones sin transporte empresarial:', failures.join(', '));
  process.exitCode = 1;
} else console.log(`Empresa activa: ${checked} archivos de módulos revisados; sin fetch directo no revisado.`);
