// Inspector 2.11.0 core/auth/providers.ts, BaseOAuthClientProvider.clientMetadata.
// Only the callback port and discovered scope vary during a real connection.
export const inspectorMetadata = {
  redirect_uris: ['http://127.0.0.1:6276/oauth/callback'],
  token_endpoint_auth_method: 'none',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  client_name: 'MCP Inspector',
  client_uri: 'https://github.com/modelcontextprotocol/inspector',
  scope: '',
  application_type: 'native',
};
