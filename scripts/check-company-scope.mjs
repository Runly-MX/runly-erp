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
