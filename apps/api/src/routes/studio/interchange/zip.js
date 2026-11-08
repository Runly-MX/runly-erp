import { StudioError } from '../../../../../shared/studio/document.js'
import { PACKAGE_LIMITS as FORMAT_LIMITS, PACKAGE_MIME, readPackageZip, shaPattern } from '@runly/studio-interchange/inspect'
export { writePackageZip } from '@runly/studio-interchange/write'

// The ZIP container and its limits live in @runly/studio-interchange (shared with the Developer Hub
// validator). This module keeps the historical surface of the Studio service and router.
export { PACKAGE_MIME, readPackageZip, shaPattern }
export const PACKAGE_LIMITS = Object.freeze(Object.fromEntries(['compressed', 'expanded', 'entry', 'entries', 'ratio', 'folders', 'depth'].map((key) => [key, FORMAT_LIMITS[key]])))
export const invalidPackage = message => new StudioError(message ?? 'El paquete Studio no es válido.', 400, 'STUDIO_PACKAGE_INVALID')
