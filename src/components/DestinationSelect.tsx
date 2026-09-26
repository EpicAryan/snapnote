import { useState } from 'react'
import type { Destination, DestinationChoice } from '../lib/types'

const BROWSE = '__browse'

export interface DestinationSelectProps {
  destinations: Destination[]
  value: DestinationChoice
  onChange(v: DestinationChoice): void
  onBrowse(): Promise<string | null>
  disabled?: boolean
  id?: string
}

export function DestinationSelect({ destinations, value, onChange, onBrowse, disabled, id }: DestinationSelectProps) {
  const [busy, setBusy] = useState(false)
  const current = value.kind === 'existing' ? String(value.id) : value.path

  const handle = async (raw: string) => {
    if (raw === BROWSE) {
      setBusy(true)
      try {
        const picked = await onBrowse()
        if (picked) onChange({ kind: 'browse', path: picked })
      } finally {
        setBusy(false)
      }
      return
    }
    onChange({ kind: 'existing', id: Number(raw) })
  }

  return (
    <select
      id={id}
      value={current}
      disabled={disabled || busy}
      onChange={(e) => void handle(e.target.value)}
      className="w-full rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm"
    >
      {destinations.map((d) => (
        <option key={d.id} value={String(d.id)}>
          {d.is_default ? 'Default (Screenshots folder)' : d.name}
        </option>
      ))}
      {value.kind === 'browse' && <option value={value.path}>{value.path}</option>}
      <option value={BROWSE}>Browse…</option>
    </select>
  )
}
