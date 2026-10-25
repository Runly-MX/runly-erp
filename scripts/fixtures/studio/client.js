import { createRunlyClient } from '../../../packages/sdk/src/index.js'
export const runly = createRunlyClient({ baseUrl: '', getActiveCompanyId: () => '00000000-0000-4000-8000-000000000001' })
