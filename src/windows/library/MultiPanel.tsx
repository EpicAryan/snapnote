import { useEffect, useRef, useState } from 'react'
import { DestinationSelect } from '../../components/DestinationSelect'
import { TagInput } from '../../components/TagInput'
import type { Destination, DestinationChoice } from '../../lib/types'

export interface MultiPanelProps {
  count: number
  destinations: Destination[]
  tagSuggestions: string[]
  onMove(choice: DestinationChoice): void
  onAddTags(tags: string[]): void
  onCopy(): void
  onDelete(): void
  onClear(): void
  onBrowse(): Promise<string | null>
  /** Set by the library to focus a section (menu: "Move to…", "Add tags…"). */
  focus?: { what: 'move' | 'tags'; seq: number } | null
}

/** The details pane's counterpart for a multi-selection: batch move, tag, copy and delete. */
export function MultiPanel(p: MultiPanelProps) {
  const firstNonDefault = p.destinations.find((d) => !d.is_default) ?? p.destinations[0]
  const [choice, setChoice] = useState<DestinationChoice>({ kind: 'existing', id: firstNonDefault?.id ?? 0 })
  const [tags, setTags] = useState<string[]>([])
  const moveWrap = useRef<HTMLDivElement>(null)
  const tagsWrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!p.focus) return
    const wrap = p.focus.what === 'move' ? moveWrap.current : tagsWrap.current
    wrap?.querySelector<HTMLElement>('select, input')?.focus()
  }, [p.focus])

  const btn = 'rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700'
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{p.count} selected</span>
        <button aria-label="Clear selection" title="Clear selection (Esc)" className="rounded px-2 py-0.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100" onClick={p.onClear}>✕</button>
      </div>

      <label className="text-xs text-neutral-400" htmlFor="mp-dest">Move to</label>
      <div ref={moveWrap} className="flex gap-2">
        <DestinationSelect id="mp-dest" destinations={p.destinations} value={choice} onChange={setChoice} onBrowse={p.onBrowse} />
        <button className="rounded bg-sky-600 px-3 py-1" onClick={() => p.onMove(choice)}>Move</button>
      </div>

      <span className="text-xs text-neutral-400">Add tags</span>
      <div ref={tagsWrap} className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><TagInput value={tags} onChange={setTags} suggestions={p.tagSuggestions} label="Tags to add" /></div>
        <button className="rounded bg-sky-600 px-3 py-1 disabled:opacity-40" disabled={!tags.length} onClick={() => { p.onAddTags(tags); setTags([]) }}>Add</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={p.onCopy}>Copy files</button>
        <button className={`${btn} text-red-300`} onClick={p.onDelete}>Delete</button>
      </div>
      <p className="text-xs text-neutral-500">Ctrl+click adds one, Shift+click a range, Ctrl+A everything.</p>
    </div>
  )
}
