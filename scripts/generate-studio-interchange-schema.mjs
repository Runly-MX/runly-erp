import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { manifestSchema } from '../apps/api/src/routes/studio/interchange/package.js'
await writeFile(new URL('../docs/developers/studio-template-package-v1.schema.json', import.meta.url), JSON.stringify(z.toJSONSchema(manifestSchema), null, 2) + '\n')
