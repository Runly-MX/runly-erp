// Public keys that may sign the Marketplace RESOURCE feed (studio templates, automations,
// website templates and solutions). Base64 SPKI DER of Ed25519 keys, role `resource`.
//
// Only the resource key from the reviewed ceremony is pinned here. Tests inject synthetic
// keys through createTrustStore({ resource }).
// Never copy a module key (official/community/managed) into this list: they are different identities.
export const RESOURCE_CATALOG_PUBLIC_KEYS = Object.freeze([
  { publicKey: "MCowBQYDK2VwAyEAlxpRLNpcPsac/Sex9+ElHGiPl/JXsD1U6xDmIQhTXqA=", state: "active", notAfter: null },
])
