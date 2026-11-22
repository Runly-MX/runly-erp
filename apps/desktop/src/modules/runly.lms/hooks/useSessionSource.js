import { createContext, useContext, useMemo } from 'react'
import { runly } from '../../../lib/runly.js'
import { useToken } from './useLmsData.js'

// Transport of the evaluation runner: the same screens serve an internal user
// (Runly session) and an external participant (guest token on the public link).
// Without a provider the runner talks to the internal endpoints.
export const SessionSourceContext = createContext(null)

const METHODS = [
  'getSession', 'submitSession', 'getSessionAttempt', 'saveSessionAnswers', 'saveSessionDraft',
  'presignSessionUpload', 'confirmSessionUpload', 'removeSessionFile', 'downloadSessionResource',
]

// api: runly.lms or runly.lms.evaluationGuest (same method names, credential last).
export function bindSessionSource(api, credential) {
  const source = { ready: Boolean(credential) }
  for (const name of METHODS) source[name] = (...args) => api[name](...args, credential)
  return source
}

export function useSessionSource() {
  const provided = useContext(SessionSourceContext)
  const token = useToken()
  return useMemo(() => provided ?? bindSessionSource(runly.lms, token), [provided, token])
}
