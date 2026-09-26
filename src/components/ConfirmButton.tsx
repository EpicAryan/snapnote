import { useEffect, useState } from 'react'

/** Two-step button: first click arms it, second click within 4 s confirms. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className }: { label: string; confirmLabel: string; onConfirm(): void; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t) }, [armed])
  return armed ? (
    <button className={`${className ?? ''} bg-red-700`} onClick={() => { setArmed(false); onConfirm() }}>{confirmLabel}</button>
  ) : (
    <button className={className} onClick={() => setArmed(true)}>{label}</button>
  )
}
