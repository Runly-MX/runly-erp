// Regenerates the list of Tabler/Lucide icons the strict geometry grammar cannot represent.
// Run after bumping @tabler/icons or lucide-static; a test fails while the file is stale.
import { writeFileSync } from 'node:fs'
import { auditLibrary, libraryVersions } from '../apps/api/src/routes/studio/catalog/icon-library.js'
writeFileSync(new URL('../apps/api/src/routes/studio/catalog/icon-library.exclusions.json', import.meta.url), `${JSON.stringify({ versions: libraryVersions(), ...auditLibrary() })}\n`)
