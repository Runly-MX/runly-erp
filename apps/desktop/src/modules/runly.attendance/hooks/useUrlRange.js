import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

// Date range kept in the URL query (`from` / `to`, local YYYY-MM-DD) so reloads and deep links
// keep it. When neither key is present the defaults apply; an explicitly cleared range stays empty.
export function useUrlRange(defaults = { from: '', to: '' }) {
  const [params, setParams] = useSearchParams()
  const hasKeys = params.has('from') || params.has('to')
  const from = hasKeys ? (params.get('from') ?? '') : defaults.from
  const to = hasKeys ? (params.get('to') ?? '') : defaults.to
  const value = useMemo(() => ({ from, to }), [from, to])
  const setRange = useCallback((next) => {
    setParams((current) => {
      const copy = new URLSearchParams(current)
      copy.set('from', next.from ?? '')
      copy.set('to', next.to ?? '')
      return copy
    }, { replace: true })
  }, [setParams])
  return [value, setRange]
}
