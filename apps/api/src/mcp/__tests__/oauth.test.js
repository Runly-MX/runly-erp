import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpOAuth } from '../oauth.js';
import { inspectorMetadata } from './inspector-metadata.js';
import { oauthParameters } from '../oauth-validation.js';

function fixture() {
  const writes = [];
  const oauth = createMcpOAuth({ prisma: { mcpState: { create: async ({ data }) => writes.push(data) } }, config: { issuer: 'https://api.example', resource: 'https://api.example/mcp' } });
  return { writes, oauth };
}

test('Inspector 2.11.0: el payload publicado se registra sin perder application_type', async () => {
  const { writes, oauth } = fixture();
  const result = await oauth.register(inspectorMetadata);
  assert.equal(result.application_type, 'native');
  assert.equal(writes[0].payload.application_type, 'native');
});

test('DCR: metadatos web/estándar y extensiones ignoradas, sin mass assignment', async () => {
  const { writes, oauth } = fixture();
  const result = await oauth.register({ ...inspectorMetadata, application_type: 'web', redirect_uris: ['https://client.example/callback'], contacts: ['support@example.test'], tos_uri: 'https://client.example/terms', policy_uri: 'https://client.example/privacy', logo_uri: '', software_id: 'client', software_version: '1.0', client_id: 'forged', scopes: ['admin'], unknown_extension: 'ignored', jwks_uri: 'https://client.example/keys' });
  assert.equal(result.application_type, 'web');
  assert.notEqual(result.client_id, 'forged');
  for (const key of ['client_id', 'scopes', 'unknown_extension', 'jwks_uri']) assert.equal(Object.hasOwn(writes[0].payload, key), false);
});

test('DCR: cliente mínimo anterior y callbacks loopback nativos', async () => {
  const { oauth } = fixture();
  for (const uri of ['http://127.0.0.1:6276/callback', 'http://localhost:6276/callback', 'http://[::1]:6276/callback']) {
    const result = await oauth.register({ redirect_uris: [uri] });
    assert.deepEqual(result.grant_types, ['authorization_code']);
    assert.deepEqual(result.response_types, ['code']);
    assert.equal(result.token_endpoint_auth_method, 'none');
    assert.equal(result.application_type, undefined);
  }
});

test('DCR: valores conocidos inválidos, redirecciones inseguras y diagnósticos sin secretos', async () => {
  const { oauth, writes } = fixture();
  for (const invalid of [
    { application_type: 'secret-marker' }, { token_endpoint_auth_method: 'client_secret_post' },
    { grant_types: ['refresh_token'] }, { response_types: ['token'] }, { scope: 'admin' },
    { contacts: ['secret-marker'] }, { redirect_uris: [] },
    ...['http://remote.example/cb', 'javascript:secret-marker', 'https://client.example/cb#fragment', 'https://user:secret-marker@client.example/cb', 'https://*.example/cb', 'https://client.example/cb\n'].map(uri => ({ redirect_uris: [uri] })),
  ]) {
    await assert.rejects(() => oauth.register({ ...inspectorMetadata, ...invalid }), error => {
      assert.equal(error.status, 400);
      assert.match(error.code, /^invalid_(client_metadata|redirect_uri)$/);
      assert.ok(!JSON.stringify({ message: error.message, issues: error.validationIssues }).includes('secret-marker'));
      return true;
    }, JSON.stringify(invalid));
  }
  assert.equal(writes.length, 0);
  await assert.rejects(() => oauth.register({ ...inspectorMetadata, application_type: 'secret-marker' }), error => {
    assert.deepEqual(error.validationIssues, [{ field: 'application_type', code: 'invalid_value' }]);
    return true;
  });
});

test('OAuth: parámetros duplicados rechazados y vacíos omitidos', () => {
  assert.throws(() => oauthParameters(new URLSearchParams('client_id=a&client_id=b')), { code: 'invalid_request' });
  assert.deepEqual(oauthParameters(new URLSearchParams('scope=&state=s')), { state: 's' });
});

test('token: errores de contrato sin consultar la base ni divulgar valores', async () => {
  const { oauth } = fixture();
  await assert.rejects(() => oauth.token({}), { code: 'invalid_request' });
  await assert.rejects(() => oauth.token({ grant_type: 'password' }), { code: 'unsupported_grant_type' });
  await assert.rejects(() => oauth.token({ grant_type: 'refresh_token', client_id: 'client', resource: 'https://other.example/mcp' }), { code: 'invalid_target' });
  await assert.rejects(() => oauth.token({ grant_type: 'authorization_code', client_id: 'client', resource: 'https://api.example/mcp', code_verifier: 'secret-marker' }), error => {
    assert.deepEqual(error.validationIssues, [{ field: 'code_verifier', code: 'invalid_format' }]);
    assert.equal(JSON.stringify(error).includes('secret-marker'), false);
    return true;
  });
});
