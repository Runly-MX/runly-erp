import { useLayoutEffect } from 'react'

export function useCommitRefValue(ref, value) {
  // A suspended render must not publish its callback to the mounted editor.
  // Update before post-commit events/microtasks can request another flush.
  useLayoutEffect(() => { ref.current = value }, [ref, value])
}
