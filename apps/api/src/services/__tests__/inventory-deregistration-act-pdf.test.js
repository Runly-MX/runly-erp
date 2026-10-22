import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDeregistrationActPdf, reasonText } from '../inventory-deregistration-act-pdf.js';
import { formatActFolio } from '../inventory-deregistration-act-service.js';

test('formats the folio with a padded sequence', () => {
  assert.equal(formatActFolio(2026, 7), 'BAJA-2026-0007');
  assert.equal(reasonText('theft'), 'Robo');
});

test('renders a multi-page PDF with many assets and no signature image', async () => {
  const items = Array.from({ length: 12 }, (_, i) => ({
    name: `Laptop ${i}`, assetTag: `INV-${i}`, serialNumber: `SN${i}`, brand: 'Dell', model: 'Latitude', condition: 'Dañado', reason: 'damage',
    proposal: { by: 'Ana', at: '2026-10-01T10:00:00Z', comment: 'No enciende' },
    history: [{ label: 'Baja propuesta', by: 'Ana', at: '2026-10-01T10:00:00Z', comment: 'No enciende' }], evidence: ['foto.jpg'],
  }));
  const act = { folio: 'BAJA-2026-0001', effectiveDate: '2026-10-21', reason: 'damage', comments: 'Autorizada por dirección', approverName: 'Luis', approverTitle: 'Gerente de administración', createdAt: new Date(), itemCount: items.length, items };
  const pdf = await renderDeregistrationActPdf({ act, branding: { companyName: 'Acme', primaryColor: '#0F766E', addressLines: [], taxId: '-' } });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 2000);
});
