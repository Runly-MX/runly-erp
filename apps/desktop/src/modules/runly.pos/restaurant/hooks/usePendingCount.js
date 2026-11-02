import { useEffect, useState } from 'react'

const PREFIX = 'runly.pos.pending.v1:'

// How many commands of this operator and company were sent but not confirmed
// yet (lost responses wait in localStorage with their original key).
export function usePendingCount({ userId, companyId }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const read = () => {
      try {
        const prefix = `${PREFIX}${userId}:${companyId}:`
        let n = 0
        for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(prefix)) n++
        setCount(n)
      } catch { setCount(0) }
    }
    read()
    window.addEventListener('runly:pos-pending', read)
    window.addEventListener('storage', read)
    return () => { window.removeEventListener('runly:pos-pending', read); window.removeEventListener('storage', read) }
  }, [userId, companyId])
  return count
}
