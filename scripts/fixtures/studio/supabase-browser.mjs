// The whole-document Save/conflict UI was retired. Current integration coverage
// lives in the incremental multi-identity suite and the final UI suite.
import {verifyStudioOperations} from './supabase-operations.mjs'
import {verifyStudioFinalUi} from './final-ui.mjs'
export async function verifyStudioSupabase(stack,scenario){
  const operations=await verifyStudioOperations(stack,scenario),ui=await verifyStudioFinalUi(stack,scenario)
  return {checks:[...operations.checks,...ui.checks]}
}
