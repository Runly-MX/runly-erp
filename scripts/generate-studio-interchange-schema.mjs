import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { manifestSchema, manifestSchemaV2 } from '../apps/api/src/routes/studio/interchange/package.js'
for (const [version, schema] of [[1, manifestSchema], [2, manifestSchemaV2]]) await writeFile(new URL(`../docs/developers/studio-template-package-v${version}.schema.json`, import.meta.url), JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n')
