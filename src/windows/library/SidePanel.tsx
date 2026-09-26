import { useEffect, useRef, useState } from 'react'
import { ConfirmButton } from '../../components/ConfirmButton'
import { DestinationSelect } from '../../components/DestinationSelect'
import { useCommands } from '../../lib/CommandsContext'
import { formatDate } from '../../lib/format'
import type { Destination, DestinationChoice, SaveResult, Screenshot } from '../../lib/types'
import { errorMessage } from '../../lib/types'
import { forgetThumbnail } from '../../lib/useThumbnail'
import { describeResult } from '../popup/Popup'

interface Props {
  id: number | null
  onChanged(): void
  onClose?(): void
  /** Delete and Copy go through the library, so the confirmation and feedback are the same everywhere. */
  onDelete(): void
  onCopy(): void
  /** Bumped by the library when the user asks to edit (F2, menu): the label input takes focus. */
  editRequest?: number
}

export function SidePanel({ id, onChanged, onClose, onDelete, onCopy, editRequest = 0 }: Props) {
  const cmd = useCommands()
  const [shot, setShot] = useState<Screenshot | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [choice, setChoice] = useState<DestinationChoice>({ kind: 'existing', id: 0 })
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'warn' | 'err' } | null>(null)
  const labelRef = useRef<HTMLInputElement>(null)
  const handledEdit = useRef(0)
  // Responses for an earlier selection can arrive after a later one (previews are whole
  // PNGs); every load gets a token and late results are dropped.
  const loadSeq = useRef(0)

  const load = async (sid: number) => {
    const mine = ++loadSeq.current
    const current = () => mine === loadSeq.current
    try {
      const [s, d] = await Promise.all([cmd.getScreenshot(sid), cmd.listDestinations()])
      if (!current()) return
      setShot(s); setDestinations(d); setLabel(s.label); setNotes(s.notes); setChoice({ kind: 'existing', id: s.destination_id })
      try {
        const p = await cmd.imageDataUrl(sid)
        if (current()) setPreview(p)
      } catch {
        if (current()) setPreview(null)
      }
    } catch {
      if (current()) setShot(null)
    }
  }

  useEffect(() => { setMsg(null); if (id == null) { loadSeq.current++; setShot(null); return } void load(id) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!shot || editRequest === 0 || editRequest === handledEdit.current) return
    handledEdit.current = editRequest
    labelRef.current?.focus()
    labelRef.current?.select()
  }, [editRequest, shot])

  if (id == null) return null
  if (!shot) return <div className="p-4 text-sm text-neutral-500">Loading…</div>

  const present = shot.status === 'present'
  const btn = 'rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700'
  const after = async (p: Promise<SaveResult>) => {
    try {
      const r = await p
      setMsg({ text: r.warning ?? describeResult(r), tone: r.warning ? 'warn' : 'ok' })
      forgetThumbnail(shot.id)
      await load(shot.id)
      onChanged()
    } catch (e) { setMsg({ text: errorMessage(e), tone: 'err' }) }
  }

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Details</span>
        <button aria-label="Close details" title="Close (Esc)" className="rounded px-2 py-0.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100" onClick={onClose}>✕</button>
      </div>
      <div className="relative overflow-hidden rounded bg-neutral-900">
        {preview ? <img src={preview} alt="Screenshot preview" className="w-full object-contain" /> : <div className="aspect-video" />}
        {!present && <span className="absolute right-2 top-2 rounded bg-red-700 px-1.5 text-xs">Missing</span>}
      </div>

      <label className="text-xs text-neutral-400" htmlFor="sp-label">Label</label>
      <input ref={labelRef} id="sp-label" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1" />
      <label className="text-xs text-neutral-400" htmlFor="sp-notes">Notes</label>
      <textarea id="sp-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1" />
      <label className="text-xs text-neutral-400" htmlFor="sp-dest">Destination</label>
      <DestinationSelect id="sp-dest" destinations={destinations} value={choice} onChange={setChoice} onBrowse={() => cmd.pickFolder()} />
      <button className="rounded bg-sky-600 px-3 py-1" onClick={() => void after(cmd.saveMetadata(shot.id, label, notes, choice))}>Save</button>
      {msg && <div className={`text-xs ${msg.tone === 'ok' ? 'text-emerald-400' : msg.tone === 'warn' ? 'text-amber-400' : 'text-red-400'}`}>{msg.text}</div>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-neutral-400">
        <dt>Original</dt><dd className="truncate text-neutral-300">{shot.original_name}</dd>
        <dt>Path</dt><dd className="break-all text-neutral-300">{shot.path}</dd>
        <dt>Captured</dt><dd className="text-neutral-300">{formatDate(shot.captured_at)}</dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        {present && <button className={btn} onClick={() => void cmd.openFile(shot.id)}>Open</button>}
        {present && <button className={btn} onClick={() => void cmd.revealFile(shot.id)}>Show in folder</button>}
        {present && <button className={btn} onClick={onCopy}>Copy</button>}
        {shot.pending_move_to != null && <button className={`${btn} bg-amber-800`} onClick={() => void after(cmd.retryMove(shot.id))}>Retry move</button>}
        {present && <ConfirmButton className={btn} label="Remove from library" confirmLabel="Confirm remove" onConfirm={() => { void cmd.removeFromLibrary(shot.id).then(() => { setShot(null); onChanged() }) }} />}
        <button className={`${btn} text-red-300`} onClick={onDelete}>{present ? 'Delete' : 'Remove from library'}</button>
      </div>
    </div>
  )
}
