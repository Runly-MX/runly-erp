import {createRequire} from 'node:module'

const require=createRequire(import.meta.url)
// ZIP digests are immutable: retain the legacy snapshot separately from the
// current editing catalog so installing a newer renderer never rewrites history.
export const WEBSITE_BUILDER_CATALOGS=Object.freeze({
  '0.3.5':require('./builder-catalogs/0.3.5.json'),
  '0.6.0':require('./block-catalog.json'),
})
