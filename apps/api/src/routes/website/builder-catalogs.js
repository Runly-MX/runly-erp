import {createRequire} from 'node:module'

const require=createRequire(import.meta.url)
// ZIP digests are immutable: retain the legacy snapshot separately from the
// current editing catalog so installing a newer renderer never rewrites history.
export const WEBSITE_BUILDER_CATALOGS=Object.freeze({
  '0.9.0':require('./builder-catalogs/0.9.0.json'),
  '0.3.5':require('./builder-catalogs/0.3.5.json'),
  '0.6.0':require('./builder-catalogs/0.6.0.json'),
  '0.6.1':require('./builder-catalogs/0.6.1.json'),
  '0.6.2':require('./builder-catalogs/0.6.2.json'),
  '0.6.3':require('./builder-catalogs/0.6.3.json'),
  '0.7.0':require('./builder-catalogs/0.7.0.json'),
  '0.8.0':require('./builder-catalogs/0.8.0.json'),
  '0.8.1':require('./builder-catalogs/0.8.1.json'),
  '0.8.2':require('./builder-catalogs/0.8.2-erp.json'),
})

export const WEBSITE_BUILDER_CATALOG_IDENTITIES=Object.freeze({
  '0.9.0': Object.freeze({
    'f5b5d67e4ddbffeedbc8e33e934a19b2973cae42ea7892192ca7849984d5a5b2':require('./builder-catalogs/0.9.0.json'),
    'bf50cd9eb4aeb731c2f35e21af7603f303f9c5c8626b4542b9594ea5f9bb8da1':require('./builder-catalogs/0.9.0-erp.json'),
  }),
  '0.8.2': Object.freeze({
    '2d7c84c46d74164981abb6028d6d278f5a9774a9eef32fb86a639cbe18c5d318':require('./builder-catalogs/0.8.2-hub.json'),
    'cdb67dabfee8e546f4fb453935ac7a791bebba294ace9035e3159e3fb84126d1':require('./builder-catalogs/0.8.2-erp.json'),
  }),
})
