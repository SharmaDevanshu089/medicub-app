import { useEffect, useState } from 'react'
import { now } from '../store/store'

export * from './dates'

/** Re-renders every second and returns demo-clock time. */
export function useNow(): number {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return now()
}
