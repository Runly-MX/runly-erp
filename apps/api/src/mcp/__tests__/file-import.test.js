import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { readImportFiles } from '../file-import.js';
import { readCatalogBytes } from '../../services/catalog/catalog-download.js';

const file = { file_id: 'file-test', download_url: 'https://files.example.test/original?signature=private' };
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
test('originales: bytes y hash, nombre/tipo opcionales, sin URL en manifiesto', async () => {
  const [loaded] = await readImportFiles([file], async (_url, options) => { assert.equal(options.httpsOnly, true); return { buffer: png }; });
  assert.deepEqual(loaded.buffer, png);
  assert.equal(loaded.manifest.name, 'file-test.png');
  assert.equal(loaded.manifest.mimeType, 'image/png');
  assert.match(loaded.manifest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(loaded.manifest).includes('private'), false);
});
test('originales: rechazar credenciales, HTTP, tipos falsos, nombres de ruta y exceso de bytes', async () => {
  for (const url of ['http://files.example.test/a', 'file:///tmp/a', 'https://user:password@files.example.test/a', 'https://files.example.test/a#fragment']) {
    await assert.rejects(() => readImportFiles([{ ...file, download_url: url }], () => assert.fail('no fetch')), { code: 'file_source_rejected' });
  }
  await assert.rejects(() => readImportFiles([file], async () => ({ buffer: Buffer.from('<svg onload="test"/>') })), { code: 'file_type_rejected' });
  await assert.rejects(() => readImportFiles([{ ...file, mime_type: 'image/jpeg' }], async () => ({ buffer: png })), { code: 'file_type_rejected' });
  await assert.rejects(() => readImportFiles([{ ...file, file_name: '../image.png' }], async () => ({ buffer: png })), { code: 'invalid_filename' });
  await assert.rejects(() => readImportFiles([file], async () => ({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1) })), { code: 'file_too_large' });
  await assert.rejects(() => readImportFiles([file], async () => { throw new Error('signed-url-must-not-leak'); }), error => error.code === 'file_unavailable' && !error.message.includes('signed-url-must-not-leak'));
});
test('originales XML/CFDI: conservar bytes sin parsear entidades ni permitir contenido activo', async () => {
  const xml = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante xmlns:cfdi="https://schema.example.test/cfdi" Total="850"/>');
  const [loaded] = await readImportFiles([{ ...file, file_name: 'factura.xml', mime_type: 'text/xml' }], async () => ({ buffer: xml }));
  assert.deepEqual(loaded.buffer, xml);
  assert.equal(loaded.manifest.mimeType, 'application/xml');
  for (const text of ['<!DOCTYPE test [<!ENTITY x SYSTEM "file:///example">]><test>&x;</test>', '<?xml version="1.0"?><svg/>', '<html><script>test</script></html>', '<?xml version="1.0"?><?xml-stylesheet href="https://example.test/style.xsl"?><test/>']) await assert.rejects(() => readImportFiles([file], async () => ({ buffer: Buffer.from(text) })), { code: 'file_type_rejected' });
});
test('descarga compartida: DNS público fijado, sin credenciales; bloquea redirección privada/downgrade y streams grandes', async () => {
  const dns = async () => [{ address: '192.0.2.1', family: 4 }];
  const request = fixtures => (_url, options, done) => {
    assert.deepEqual(options.headers, {});
    assert.equal(options.agent, false);
    options.lookup('files.example.test', {}, (_err, address) => assert.equal(address, '192.0.2.1'));
    const emitter = new EventEmitter();
    emitter.end = () => { const fixture = fixtures.shift(), response = Readable.from(fixture.chunks ?? []); response.statusCode = fixture.status ?? 200; response.headers = fixture.headers ?? {}; queueMicrotask(() => done(response)); };
    return emitter;
  };
  for (const location of ['https://127.0.0.1/private', 'http://files.example.test/a']) {
    await assert.rejects(() => readCatalogBytes(file.download_url, { httpsOnly: true, resolveHost: dns, requestImpl: request([{ status: 302, headers: { location } }]) }), /PRIVATE_ADDRESS|REDIRECT_REJECTED/);
  }
  await assert.rejects(() => readCatalogBytes('file:///tmp/a', { httpsOnly: true }), /URL_REJECTED/);
  await assert.rejects(() => readCatalogBytes(file.download_url, { httpsOnly: true, maxBytes: 8, resolveHost: dns, requestImpl: request([{ chunks: [Buffer.alloc(5), Buffer.alloc(5)] }]) }), /TOO_LARGE/);
});
