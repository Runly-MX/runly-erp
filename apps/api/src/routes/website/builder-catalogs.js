import {createRequire} from 'node:module'

const require=createRequire(import.meta.url)
// ZIP digests are immutable: retain the legacy snapshot separately from the
// current editing catalog so installing a newer renderer never rewrites history.
export const WEBSITE_BUILDER_CATALOGS=Object.freeze({
  '0.9.3':require('./builder-catalogs/0.9.3.json'),
  '0.9.2':require('./builder-catalogs/0.9.2.json'),
  '0.9.1':require('./builder-catalogs/0.9.1.json'),
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
  '0.9.3': Object.freeze({
    'bef1f8ef8e59918550911f2f98e078c36d576375359e2b6f2ee96f8595d092fd':require('./builder-catalogs/0.9.3.json'),
    'b1a09aee08578047cc2a7f8c1f5f902379e8057c55a6b0d3559417457042c0ca':require('./builder-catalogs/0.9.3-erp.json'),
  }),
  '0.9.2': Object.freeze({
    'bef1f8ef8e59918550911f2f98e078c36d576375359e2b6f2ee96f8595d092fd':require('./builder-catalogs/0.9.2.json'),
    'b1a09aee08578047cc2a7f8c1f5f902379e8057c55a6b0d3559417457042c0ca':require('./builder-catalogs/0.9.2-erp.json'),
  }),
  '0.9.1': Object.freeze({
    '5f0999d527a5dc4c6d3e93e430d6053da348e8b316e620673cd8788e7869c848':require('./builder-catalogs/0.9.1.json'),
    '2e6570493f7016886277a35c1567a5acc5f97daf5ae6cc34d4f0b2a7698c36ca':require('./builder-catalogs/0.9.1-erp.json'),
  }),
  '0.9.0': Object.freeze({
    'f5b5d67e4ddbffeedbc8e33e934a19b2973cae42ea7892192ca7849984d5a5b2':require('./builder-catalogs/0.9.0.json'),
    'bf50cd9eb4aeb731c2f35e21af7603f303f9c5c8626b4542b9594ea5f9bb8da1':require('./builder-catalogs/0.9.0-erp.json'),
  }),
  '0.8.2': Object.freeze({
    '2d7c84c46d74164981abb6028d6d278f5a9774a9eef32fb86a639cbe18c5d318':require('./builder-catalogs/0.8.2-hub.json'),
    'cdb67dabfee8e546f4fb453935ac7a791bebba294ace9035e3159e3fb84126d1':require('./builder-catalogs/0.8.2-erp.json'),
  }),
})
