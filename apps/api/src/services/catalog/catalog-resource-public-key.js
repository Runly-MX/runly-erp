// Public keys that may sign the Marketplace RESOURCE feed (studio templates, automations,
// website templates and solutions). Base64 SPKI DER of Ed25519 keys, role `resource`.
//
// NOTHING IS PINNED YET (Hub K-7): the production key needs its ceremony and a Runly release
// that pins it here. Until then the resource feed fails closed in production: no key means no
// snapshot can verify. Tests inject synthetic keys through createTrustStore({ resource }).
// Never copy a module key (official/community/managed) into this list: they are different identities.
export const RESOURCE_CATALOG_PUBLIC_KEYS = Object.freeze([
  { publicKey: "MCowBQYDK2VwAyEAlxpRLNpcPsac/Sex9+ElHGiPl/JXsD1U6xDmIQhTXqA=", state: "active", notAfter: null },
])
