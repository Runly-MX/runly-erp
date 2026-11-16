import {createRequire} from 'node:module'

const require=createRequire(import.meta.url)
// ZIP digests are immutable: retain the legacy snapshot separately from the
// current editing catalog so installing a newer renderer never rewrites history.
export const WEBSITE_BUILDER_CATALOGS=Object.freeze({
  '0.3.5':require('./builder-catalogs/0.3.5.json'),
  '0.6.0':require('./builder-catalogs/0.6.0.json'),
  '0.6.1':require('./builder-catalogs/0.6.1.json'),
  '0.6.2':require('./builder-catalogs/0.6.2.json'),
  '0.6.3':require('./builder-catalogs/0.6.3.json'),
  '0.7.0':require('./builder-catalogs/0.7.0.json'),
  '0.8.0':require('./builder-catalogs/0.8.0.json'),
  '0.8.1':require('./block-catalog.json'),
})
