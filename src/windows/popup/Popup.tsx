import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { DestinationSelect } from '../../components/DestinationSelect'
import { TagInput } from '../../components/TagInput'
import { useCommands } from '../../lib/CommandsContext'
import type { Destination, DestinationChoice, RecentLabel, SaveResult, Screenshot } from '../../lib/types'
import { errorMessage } from '../../lib/types'

type Phase =
  | { kind: 'idle' }
  | { kind: 'editing' }
  | { kind: 'missing-folder'; dest: Destination }
  | { kind: 'saving' }
  | { kind: 'done'; text: string; warning: boolean }
  | { kind: 'error'; text: string }

export function describeResult(r: SaveResult): string {
  const parts = ['Saved']
  if (r.moved) parts.push(`moved to ${r.destination.name}`)
  if (r.renamed) parts.push('renamed')
  return parts.join(' · ')
}

export function Popup() {
  const cmd = useCommands()
  const [shot, setShot] = useState<Screenshot | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [recent, setRecent] = useState<RecentLabel[]>([])
  const [choice, setChoice] = useState<DestinationChoice>({ kind: 'existing', id: 0 })
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const labelRef = useRef<HTMLInputElement>(null)
  // Id of the screenshot whose fields are being edited, or null. A second popup:open for the
  // same id (hotkey pressed again) must not throw away what the user typed.
  const editingId = useRef<number | null>(null)

  const reset = () => {
    editingId.current = null
    setShot(null); setThumb(null); setLabel(''); setNotes(''); setTags([]); setRecent([]); setPhase({ kind: 'idle' })
  }

  useEffect(() => {
    let un: (() => void) | undefined
    cmd.on('popup:open', async ({ id }) => {
      if (editingId.current === id) {
        labelRef.current?.focus()
        return
      }
      try {
        const [s, dests, rec] = await Promise.all([cmd.getScreenshot(id), cmd.listDestinations(), cmd.recentLabels().catch(() => [] as RecentLabel[])])
        let t: string | null = null
        try { t = await cmd.thumbnailUrl(id) } catch { t = null }
        setShot(s); setThumb(t); setDestinations(dests); setRecent(rec)
        setLabel(s.label); setNotes(s.notes); setTags(s.tags)
        setChoice({ kind: 'existing', id: s.destination_id })
        setPhase({ kind: 'editing' })
        editingId.current = s.id
        setTimeout(() => labelRef.current?.focus(), 0)
      } catch {
        reset()
        void cmd.hidePopup()
      }
    }).then((u) => { un = u })
    return () => un?.()
  }, [cmd])

  const close = () => { reset(); void cmd.hidePopup() }

  const doSave = async (skipFolderCheck = false) => {
    if (!shot) return
    if (!skipFolderCheck && choice.kind === 'existing') {
      const dest = destinations.find((d) => d.id === choice.id)
      if (dest && !dest.is_default && !(await cmd.folderExists(dest.path))) {
        setPhase({ kind: 'missing-folder', dest })
        return
      }
    }
    setPhase({ kind: 'saving' })
    editingId.current = null
    try {
      const r = await cmd.saveMetadata(shot.id, label, notes, tags, choice)
      const text = r.warning ?? describeResult(r)
      setPhase({ kind: 'done', text, warning: !!r.warning })
      setTimeout(close, r.warning ? 2500 : 1200)
    } catch (e) {
      setPhase({ kind: 'error', text: errorMessage(e) })
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key === 'Enter' && (e.ctrlKey || (e.target as HTMLElement).tagName !== 'TEXTAREA')) {
      e.preventDefault()
      void doSave()
    }
  }

  if (!shot || phase.kind === 'idle') return null
  const busy = phase.kind === 'saving' || phase.kind === 'done'

  return (
    <div onKeyDown={onKeyDown} className="flex h-full flex-col gap-3 bg-neutral-900 p-4 text-neutral-100">
      <div className="flex items-center gap-3">
        {thumb ? <img src={thumb} alt="Screenshot thumbnail" className="h-16 w-24 rounded object-cover" /> : <div className="h-16 w-24 rounded bg-neutral-800" />}
        <div className="min-w-0 text-xs text-neutral-400">
          <div className="truncate">{shot.original_name}</div>
          <div>{shot.captured_at.replace('T', ' ')}</div>
        </div>
      </div>

      <label className="text-xs text-neutral-400" htmlFor="label">Label</label>
      <input id="label" ref={labelRef} value={label} maxLength={120} disabled={busy} onChange={(e) => setLabel(e.target.value)}
        className="rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm" />
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-neutral-500">Recent:</span>
          {recent.map((r) => (
            <button key={r.label} type="button" disabled={busy} title={`Use “${r.label}” and save to ${r.destination_name}`}
              className="rounded bg-neutral-800 px-1.5 py-0.5 hover:bg-neutral-700"
              onClick={() => { setLabel(r.label); setChoice({ kind: 'existing', id: r.destination_id }); labelRef.current?.focus() }}>{r.label}</button>
          ))}
        </div>
      )}

      <label className="text-xs text-neutral-400" htmlFor="notes">Notes</label>
      <textarea id="notes" value={notes} rows={3} disabled={busy} onChange={(e) => setNotes(e.target.value)}
        className="rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm" />

      <span className="text-xs text-neutral-400">Tags</span>
      <TagInput value={tags} onChange={setTags} disabled={busy} />

      <label className="text-xs text-neutral-400" htmlFor="destination">Save to</label>
      <DestinationSelect id="destination" destinations={destinations} value={choice} onChange={setChoice} onBrowse={() => cmd.pickFolder()} disabled={busy} />

      {phase.kind === 'missing-folder' && (
        <div className="rounded border border-amber-600 bg-amber-950/40 p-2 text-xs">
          <div>The folder for “{phase.dest.name}” doesn't exist: {phase.dest.path}</div>
          <div className="mt-2 flex gap-2">
            <button className="rounded bg-amber-600 px-2 py-1" onClick={async () => { await cmd.createFolder(phase.dest.path); await doSave(true) }}>Create folder</button>
            <button className="rounded bg-neutral-700 px-2 py-1" onClick={() => { const def = destinations.find((d) => d.is_default)!; setChoice({ kind: 'existing', id: def.id }); setPhase({ kind: 'editing' }) }}>Use Default</button>
          </div>
        </div>
      )}
      {phase.kind === 'done' && <div className={`text-xs ${phase.warning ? 'text-amber-400' : 'text-emerald-400'}`}>{phase.text}</div>}
      {phase.kind === 'error' && <div className="text-xs text-red-400">{phase.text}</div>}

      <div className="mt-auto flex justify-end gap-2 text-sm">
        <button className="rounded bg-neutral-700 px-3 py-1" onClick={close} disabled={busy}>Cancel</button>
        <button className="rounded bg-sky-600 px-3 py-1" onClick={() => void doSave()} disabled={busy}>Save</button>
      </div>
    </div>
  )
}
