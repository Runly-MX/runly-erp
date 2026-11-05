// Single import point for modules adopting External Identity (see docs/architecture/external-identity-realms.md).
export { createExternalIdentity, ExternalIdentityError, publicAccount } from './identity-service.js'
export { createExternalAuthRouter, requireExternalAccount, readSessionCookie, externalAuthSchemas } from './auth-router.js'
