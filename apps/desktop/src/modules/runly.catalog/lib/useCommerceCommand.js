// apps/desktop/src/modules/runly.catalog/lib/useCommerceCommand.js
import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { classifyCommerceError, createAttemptTracker } from './commerceCommand.js'

// useMutation for C1/C5 writes. `run(body, { idempotencyKey })` calls the SDK.
// The key survives a lost response so "Reintentar" replays the same attempt;
// any definitive answer (success or a 4xx) closes the attempt.
export function useCommerceCommand({ prefix, run, onSuccess }) {
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
    onError: (error) => {
      const info = classifyCommerceError(error)
      if (!info.retrySameKey) trackerRef.current.reset()
      setFailure(info)
    },
  })
  return {
    ...mutation,
    failure,
    clearFailure: () => setFailure(null),
    retry: () => mutation.variables !== undefined && mutation.mutate(mutation.variables),
  }
}
