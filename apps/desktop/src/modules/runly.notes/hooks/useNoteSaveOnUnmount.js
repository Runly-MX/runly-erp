import { useLayoutEffect } from 'react'

export function useNoteSaveOnUnmount(flushRef, saveTimerRef) {
  // Capture pending bytes before the engine owner's passive cleanup destroys
  // Y.Doc. The request itself remains asynchronous and may finish later.
  useLayoutEffect(() => () => {
    clearTimeout(saveTimerRef.current)
    flushRef.current()
  }, [flushRef, saveTimerRef])
}
