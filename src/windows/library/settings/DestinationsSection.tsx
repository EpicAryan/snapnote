import { useEffect, useState } from 'react'
import { ConfirmButton } from '../../../components/ConfirmButton'
import { useCommands } from '../../../lib/CommandsContext'
import type { Destination } from '../../../lib/types'
import { errorMessage } from '../../../lib/types'

export function DestinationsSection() {
  const cmd = useCommands()
  const [dests, setDests] = useState<Destination[]>([])
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)

  const load = () => void cmd.listDestinations().then(setDests)
  useEffect(load, [cmd])
  const custom = dests.filter((d) => !d.is_default)
  const run = async (f: () => Promise<unknown>) => { setError(null); try { await f(); load() } catch (e) { setError(errorMessage(e)) } }

  const move = (id: number, delta: number) => {
    const ids = custom.map((d) => d.id)
    const i = ids.indexOf(id)
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void run(() => cmd.reorderDestinations(ids))
  }

  return (
    <section data-testid="destinations" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Destinations</h2>
      <p className="text-xs text-neutral-400">Named folders offered in the Save to dropdown. Default is always the watch folder.</p>
      <ul className="flex flex-col gap-1">
        {custom.map((d, i) => (
          <li key={d.id} data-testid="dest-row" className="flex items-center gap-2 rounded bg-neutral-900 p-2 text-xs">
            <div className="min-w-0 flex-1">
              <div data-testid="dest-name" className="font-medium">{d.name}</div>
              <div className="truncate text-neutral-400">{d.path}</div>
            </div>
            <button aria-label="Move up" disabled={i === 0} onClick={() => move(d.id, -1)}>↑</button>
            <button aria-label="Move down" disabled={i === custom.length - 1} onClick={() => move(d.id, 1)}>↓</button>
            <button onClick={() => setRenaming({ id: d.id, name: d.name })}>Rename</button>
            <ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={() => void run(() => cmd.deleteDestination(d.id, dests.find((x) => x.is_default)!.id))} />
          </li>
        ))}
      </ul>
      {renaming && (
        <div className="flex gap-2 text-xs">
          <label htmlFor="rename-input" className="sr-only">New name</label>
          <input id="rename-input" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1" />
          <button onClick={() => { const d = dests.find((x) => x.id === renaming.id)!; void run(() => cmd.updateDestination(d.id, renaming.name, d.path)).then(() => setRenaming(null)) }}>Save name</button>
          <button onClick={() => setRenaming(null)}>Cancel</button>
        </div>
      )}
      <div className="flex flex-col gap-1 rounded border border-neutral-800 p-2 text-xs">
        <label htmlFor="new-dest-name">Name</label>
        <input id="new-dest-name" value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1" />
        <div className="flex items-center gap-2">
          <button className="rounded bg-neutral-800 px-2 py-1" onClick={async () => { const p = await cmd.pickFolder(); if (p) setPath(p) }}>Pick folder</button>
          <span className="truncate text-neutral-400">{path || 'No folder chosen'}</span>
        </div>
        <button className="self-start rounded bg-sky-600 px-2 py-1" disabled={!name.trim() || !path} onClick={() => void run(() => cmd.createDestination(name, path)).then(() => { setName(''); setPath('') })}>Add destination</button>
      </div>
      {error && <div className="text-xs text-red-400">{error}</div>}
    </section>
  )
}
