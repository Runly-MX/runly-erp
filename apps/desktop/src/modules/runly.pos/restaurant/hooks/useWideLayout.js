import { useEffect, useState } from 'react'

// Side panel from 1024 px (landscape tablet, desktop); below it the panel is a
// bottom sheet. Only one of them is mounted.
export function useWideLayout(query = '(min-width: 1024px)') {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e) => setWide(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return wide
}
