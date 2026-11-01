// apps/desktop/src/modules/runly.pos/retail/hooks/usePosCommand.js
import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { classifyPosError, createAttemptTracker } from '../lib/retailErrors.js'

// useMutation for one POS command. `run(body, { idempotencyKey })` calls the
// SDK. A lost response keeps the key so "Reintentar" replays the confirmed
// result; any definitive answer closes the attempt.
export function usePosCommand({ prefix, run, onSuccess, onError }) {
  const trackerRef = useRef(null)
  trackerRef.current ??= createAttemptTracker(prefix)
  const [failure, setFailure] = useState(null)
  const mutation = useMutation({
    mutationFn: (body) => run(body, { idempotencyKey: trackerRef.current.keyFor(body) }),
    onMutate: () => setFailure(null),
    onSuccess: (result, body) => {
      trackerRef.current.reset()
      onSuccess?.(result, body)
    },
    onError: (error, body) => {
      const info = classifyPosError(error)
      if (!info.retrySameKey) trackerRef.current.reset()
      setFailure(info)
      onError?.(info, body)
    },
  })
  return {
    ...mutation,
    failure,
    clearFailure: () => setFailure(null),
    retry: () => mutation.variables !== undefined && mutation.mutate(mutation.variables),
  }
}
