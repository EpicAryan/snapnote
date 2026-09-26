import { useEffect, useRef, useState } from 'react'

/**
 * Counts `ms` down to zero in 100 ms ticks, then calls `onDone` once per `key`.
 * Restarting: pass a new `key` to start over. `paused` freezes the countdown.
 */
export function useCountdown(key: number | null, ms: number, paused: boolean, onDone: () => void) {
  const [remaining, setRemaining] = useState(ms)
  const firedFor = useRef<number | null>(null)

  useEffect(() => {
    setRemaining(ms)
  }, [key, ms])

  useEffect(() => {
    if (key === null || paused) return
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 100)), 100)
    return () => clearInterval(t)
  }, [key, paused])

  // Fire from an effect, not from inside the state updater, so it runs once per key
  // and inside React's act() in tests.
  useEffect(() => {
    if (key !== null && remaining <= 0 && firedFor.current !== key) {
      firedFor.current = key
      onDone()
    }
  }, [key, remaining, onDone])

  return remaining
}
