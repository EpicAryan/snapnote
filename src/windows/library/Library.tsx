import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ContextMenu, type MenuItem } from '../../components/ContextMenu'
import { useCommands } from '../../lib/CommandsContext'
import { describeAdd, describeDelete, describeMove, describeUndo, displayName } from '../../lib/format'
import type { AddReport, Destination, DestinationChoice, ScreenshotCard } from '../../lib/types'
import { errorMessage } from '../../lib/types'
import { FirstRunNotice } from './FirstRunNotice'
import { columnsOf, Grid } from './Grid'
import { Lightbox } from './Lightbox'
import { MultiPanel } from './MultiPanel'
import { SearchBar } from './SearchBar'
import { ShortcutsHelp } from './ShortcutsHelp'
import { Sidebar } from './Sidebar'
import { useLibraryQuery } from './useLibraryQuery'

export type LibraryView = 'grid' | 'settings'

/** What the details pane gets from the library. */
export interface PanelContext {
  onChanged(): void
  onClose(): void
  onDelete(): void
  onCopy(): void
  /** Bumped each time the user asks to edit the label (F2, menu); the pane focuses its label input. */
  editRequest: number
  /** Every tag in use, for suggestions. */
  tagSuggestions: string[]
}

interface Props {
  sidePanel?: (id: number, ctx: PanelContext) => ReactNode
  settings?: ReactNode
}

interface Modifiers { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }
interface Flash { text: string; undoToken?: number }

const tagOf = (t: EventTarget | null) => (t as HTMLElement | null)?.tagName ?? ''
const isTyping = (t: EventTarget | null) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagOf(t))
const isButton = (t: EventTarget | null) => ['BUTTON', 'A'].includes(tagOf(t))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function Library({ sidePanel, settings }: Props = {}) {
  const cmd = useCommands()
  const lib = useLibraryQuery()
  const [destinations, setDestinations] = useState<Destination[]>([])
  // Explorer-style selection: a set, the anchor for Shift ranges, and the keyboard cursor.
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [cursor, setCursor] = useState<number | null>(null)
  const anchorRef = useRef<number | null>(null)
  const [view, setView] = useState<LibraryView>('grid')
  const [flash, setFlash] = useState<Flash | null>(null)
  const [menu, setMenu] = useState<{ id: number; x: number; y: number; seq: number } | null>(null)
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [help, setHelp] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [editRequest, setEditRequest] = useState(0)
  const [panelFocus, setPanelFocus] = useState<{ what: 'move' | 'tags'; seq: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)
  const cardsRef = useRef<ScreenshotCard[]>([])
  cardsRef.current = lib.cards
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor

  const single = selected.size === 1 ? [...selected][0] : null
  const previewCard = previewId != null ? lib.cards.find((c) => c.id === previewId) : undefined
  const previewIndex = previewCard ? lib.cards.indexOf(previewCard) : -1
  const overlayOpen = menu != null || previewCard != null || help
  const tagSuggestions = lib.counts?.tags.map((t) => t.tag) ?? []

  const focusGrid = useCallback(() => { gridRef.current?.focus() }, [])

  const say = useCallback((text: string, undoToken?: number) => {
    setFlash({ text, undoToken })
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), undoToken != null ? 10_000 : 3000)
  }, [])

  // ---- selection ----
  const selectOnly = useCallback((id: number | null) => {
    setSelected(id == null ? new Set() : new Set([id]))
    anchorRef.current = id
    setCursor(id)
  }, [])
  const toggle = useCallback((id: number) => {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
    anchorRef.current = id
    setCursor(id)
  }, [])
  const rangeTo = useCallback((id: number, additive: boolean) => {
    const cards = cardsRef.current
    const a = cards.findIndex((c) => c.id === (anchorRef.current ?? id))
    const b = cards.findIndex((c) => c.id === id)
    if (a < 0 || b < 0) return selectOnly(id)
    const range = cards.slice(Math.min(a, b), Math.max(a, b) + 1).map((c) => c.id)
    setSelected((s) => (additive ? new Set([...s, ...range]) : new Set(range)))
    setCursor(id)
  }, [selectOnly])
  const clickCard = useCallback((id: number, e: Modifiers) => {
    if (e.shiftKey) rangeTo(id, e.ctrlKey || e.metaKey)
    else if (e.ctrlKey || e.metaKey) toggle(id)
    else selectOnly(id)
  }, [rangeTo, toggle, selectOnly])
  const selectAll = useCallback(() => {
    const ids = cardsRef.current.map((c) => c.id)
    setSelected(new Set(ids))
    if (cursorRef.current == null && ids.length) setCursor(ids[0])
  }, [])

  // ---- actions ----
  const copyMany = useCallback(async (ids: number[]) => {
    try {
      const n = await cmd.copyScreenshots(ids)
      say(n === 1 ? 'Copied. Paste it into a folder, a chat or an image editor.' : `Copied ${n} files. Paste them into a folder.`)
    } catch (e) { say(errorMessage(e)) }
  }, [cmd, say])

  // A single file that is already tracked is worth pointing at instead of adding again.
  const report = useCallback((r: AddReport) => {
    say(describeAdd(r))
    if (r.added.length === 0 && r.existing.length === 1) selectOnly(r.existing[0])
  }, [say, selectOnly])
  const paste = useCallback(async () => {
    try { report(await cmd.pasteClipboard()) } catch (e) { say(errorMessage(e)) }
  }, [cmd, report, say])
  const addFiles = useCallback(async (paths: string[]) => {
    try { report(await cmd.addFiles(paths)) } catch (e) { say(errorMessage(e)) }
  }, [cmd, report, say])

  const open = useCallback((id: number) => { void cmd.openFile(id).catch((e) => say(errorMessage(e))) }, [cmd, say])
  const reveal = useCallback((id: number) => { void cmd.revealFile(id).catch((e) => say(errorMessage(e))) }, [cmd, say])
  const edit = useCallback((id: number) => { selectOnly(id); setEditRequest((n) => n + 1) }, [selectOnly])
  const preview = useCallback((id: number) => {
    if (cardsRef.current.find((c) => c.id === id)?.status !== 'missing') setPreviewId(id)
  }, [])
  const retry = useCallback(async (id: number) => {
    try { const r = await cmd.retryMove(id); say(r.warning ?? `Moved to ${r.destination.name}`) } catch (e) { say(errorMessage(e)) }
  }, [cmd, say])
  const openMenu = useCallback((id: number, x: number, y: number) => {
    // Right-clicking outside the selection selects that card alone; inside it keeps the batch.
    if (!selectedRef.current.has(id)) selectOnly(id)
    setMenu({ id, x, y, seq: ++seqRef.current })
  }, [selectOnly])
  const openMenuForSelected = useCallback((id: number) => {
    const r = gridRef.current?.querySelector<HTMLElement>(`[data-card="${id}"]`)?.getBoundingClientRect()
    openMenu(id, (r?.left ?? 0) + 16, (r?.top ?? 0) + 16)
  }, [openMenu])

  const deleteMany = useCallback(async (ids: number[]) => {
    const cards = cardsRef.current
    const targets = cards.filter((c) => ids.includes(c.id))
    if (!targets.length) return
    const missing = targets.filter((c) => c.status === 'missing').length
    const present = targets.length - missing
    let message: string
    if (targets.length === 1) {
      const c = targets[0]
      message = missing ? `Forget “${displayName(c)}”? The file is already gone.` : `Move “${displayName(c)}” to the Recycle Bin and remove it from the library?`
    } else {
      const parts: string[] = []
      if (present) parts.push(`move ${plural(present, 'screenshot', 'screenshots')} to the Recycle Bin`)
      if (missing) parts.push(`forget ${plural(missing, 'missing entry', 'missing entries')}`)
      const lead = parts.join(' and ')
      message = `${lead[0].toUpperCase()}${lead.slice(1)}, and remove them from the library?`
    }
    const ok = await cmd.confirm(message, targets.length === 1 ? 'Delete screenshot' : `Delete ${targets.length} screenshots`)
    if (!ok) return
    try {
      const r = await cmd.deleteScreenshots(targets.map((c) => c.id))
      const gone = new Set(r.deleted)
      // Explorer-style: the selection moves on to whatever now sits where the first one was.
      const firstIdx = Math.max(0, cards.findIndex((c) => gone.has(c.id)))
      const remaining = cards.filter((c) => !gone.has(c.id))
      const next = remaining[Math.min(firstIdx, remaining.length - 1)]
      selectOnly(next?.id ?? null)
      setPreviewId((p) => (p != null && gone.has(p) ? (next?.id ?? null) : p))
      say(describeDelete(r), r.deleted.length ? r.undo_token : undefined)
    } catch (e) { say(errorMessage(e)) }
  }, [cmd, say, selectOnly])

  const undo = useCallback(async (token: number) => {
    setFlash(null)
    try {
      const r = await cmd.undoDelete(token)
      say(describeUndo(r))
      if (r.restored.length) selectOnly(r.restored[0])
    } catch (e) { say(errorMessage(e)) }
  }, [cmd, say, selectOnly])

  const moveMany = useCallback(async (ids: number[], choice: DestinationChoice) => {
    try { say(describeMove(await cmd.moveScreenshots(ids, choice))) } catch (e) { say(errorMessage(e)) }
  }, [cmd, say])
  const addTagsMany = useCallback(async (ids: number[], tags: string[]) => {
    try {
      const n = await cmd.addTags(ids, tags)
      say(n ? `Tagged ${plural(n, 'screenshot', 'screenshots')}` : 'Nothing to tag: they already have those tags')
    } catch (e) { say(errorMessage(e)) }
  }, [cmd, say])

  const menuItems = (id: number): MenuItem[] => {
    const sel = selectedRef.current
    const ids = sel.has(id) && sel.size > 1 ? [...sel] : [id]
    if (ids.length > 1) {
      const n = ids.length
      return [
        { label: `Copy ${n} files`, shortcut: 'Ctrl+C', onSelect: () => void copyMany(ids) },
        { label: `Move ${n} to…`, onSelect: () => setPanelFocus({ what: 'move', seq: ++seqRef.current }) },
        { label: `Add tags to ${n}…`, onSelect: () => setPanelFocus({ what: 'tags', seq: ++seqRef.current }) },
        'separator',
        { label: `Delete ${n}`, shortcut: 'Del', danger: true, onSelect: () => void deleteMany(ids) },
      ]
    }
    const card = lib.cards.find((c) => c.id === id)
    if (!card) return []
    const missing = card.status === 'missing'
    const items: MenuItem[] = [
      { label: 'Preview', shortcut: 'Space', disabled: missing, onSelect: () => preview(id) },
      { label: 'Open', shortcut: 'Enter', disabled: missing, onSelect: () => open(id) },
      { label: 'Show in folder', disabled: missing, onSelect: () => reveal(id) },
      'separator',
      { label: 'Edit details', shortcut: 'F2', onSelect: () => edit(id) },
      { label: 'Copy', shortcut: 'Ctrl+C', disabled: missing, onSelect: () => void copyMany([id]) },
    ]
    if (card.pending_move_to != null) items.push({ label: 'Retry move', onSelect: () => void retry(id) })
    items.push('separator', { label: missing ? 'Remove from library' : 'Delete', shortcut: 'Del', danger: true, onSelect: () => void deleteMany([id]) })
    return items
  }

  // Files come and go behind the app's back; re-check them every minute while the library is open.
  useEffect(() => {
    const t = setInterval(() => { void cmd.reconcileNow() }, 60_000)
    return () => clearInterval(t)
  }, [cmd])

  const loadDestinations = () => { void cmd.listDestinations().then(setDestinations) }
  useEffect(loadDestinations, [cmd])
  useEffect(() => { let un: (() => void) | undefined; cmd.on('settings:changed', loadDestinations).then((u) => { un = u }); return () => un?.() }, [cmd])
  useEffect(() => { let un: (() => void) | undefined; cmd.on('library:view', (p) => setView(p.view)).then((u) => { un = u }); return () => un?.() }, [cmd])

  // Explorer drag-and-drop.
  useEffect(() => {
    const subs: Array<() => void> = []
    cmd.on('files:drag', (p) => setDragging(p.active)).then((u) => subs.push(u))
    cmd.on('files:drop', (p) => { setDragging(false); void addFiles(p.paths) }).then((u) => subs.push(u))
    return () => subs.forEach((u) => u())
  }, [cmd, addFiles])

  // Keyboard works wherever focus is, as long as the user is not typing or inside an overlay.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (overlayOpen || isTyping(e.target)) return
      const ctrl = e.ctrlKey || e.metaKey
      const cards = cardsRef.current
      const sel = selectedRef.current
      const cur = cursorRef.current
      const idx = cards.findIndex((c) => c.id === cur)
      const cols = () => columnsOf(gridRef.current)
      const targets = () => (sel.size ? [...sel] : cur != null ? [cur] : [])
      const stepTo = (i: number) => {
        const target = cards[Math.max(0, Math.min(cards.length - 1, i))]
        if (!target) return
        if (e.shiftKey) rangeTo(target.id, false)
        else if (ctrl) setCursor(target.id)
        else selectOnly(target.id)
      }
      const step = (delta: number) => { if (idx < 0) stepTo(delta < 0 ? cards.length - 1 : 0); else stepTo(idx + delta) }
      const k = e.key.toLowerCase()
      if (ctrl && k === 'f') { e.preventDefault(); searchRef.current?.focus(); return }
      if (ctrl && k === 'a') { e.preventDefault(); selectAll(); return }
      if (ctrl && k === 'c') { e.preventDefault(); const t = targets(); if (t.length) void copyMany(t); return }
      if (ctrl && k === 'v') { e.preventDefault(); void paste(); return }
      if (ctrl && e.key === ' ') { e.preventDefault(); if (cur != null) toggle(cur); return }
      if (e.altKey) return
      switch (e.key) {
        case '/': if (!ctrl) { e.preventDefault(); searchRef.current?.focus() } break
        case '?': case 'F1': e.preventDefault(); setHelp(true); break
        case 'Escape': if (sel.size || cur != null) { selectOnly(null); focusGrid() } break
        case 'ArrowRight': e.preventDefault(); step(1); break
        case 'ArrowLeft': e.preventDefault(); step(-1); break
        case 'ArrowDown': e.preventDefault(); step(cols()); break
        case 'ArrowUp': e.preventDefault(); step(-cols()); break
        case 'Home': e.preventDefault(); stepTo(0); break
        case 'End': e.preventDefault(); stepTo(cards.length - 1); break
        case 'PageDown': e.preventDefault(); step(cols() * 3); break
        case 'PageUp': e.preventDefault(); step(-cols() * 3); break
        case 'Enter': if (!ctrl && cur != null && !isButton(e.target)) { e.preventDefault(); open(cur) } break
        case ' ': if (cur != null && !isButton(e.target)) { e.preventDefault(); preview(cur) } break
        case 'F2': if (cur != null) { e.preventDefault(); edit(cur) } break
        case 'Delete': { const t = targets(); if (t.length) { e.preventDefault(); void deleteMany(t) } break }
        case 'ContextMenu': if (cur != null) { e.preventDefault(); openMenuForSelected(cur) } break
        case 'F10': if (e.shiftKey && cur != null) { e.preventDefault(); openMenuForSelected(cur) } break
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [overlayOpen, copyMany, paste, open, edit, preview, deleteMany, focusGrid, openMenuForSelected, rangeTo, selectOnly, selectAll, toggle])

  // Cards that disappeared (deleted, filtered out) leave the selection.
  useEffect(() => {
    setSelected((s) => {
      const keep = [...s].filter((id) => lib.cards.some((c) => c.id === id))
      return keep.length === s.size ? s : new Set(keep)
    })
    if (cursor != null && !lib.cards.some((c) => c.id === cursor)) setCursor(null)
  }, [lib.cards, cursor])
  useEffect(() => { if (previewId != null && !lib.cards.some((c) => c.id === previewId)) setPreviewId(null) }, [lib.cards, previewId])
  useEffect(() => { if (view === 'grid') focusGrid() }, [view, focusGrid])

  const ctx: PanelContext | null = single == null ? null : {
    onChanged: () => void lib.reload(),
    onClose: () => { selectOnly(null); focusGrid() },
    onDelete: () => void deleteMany([single]),
    onCopy: () => void copyMany([single]),
    editRequest,
    tagSuggestions,
  }
  const count = lib.cards.length
  const q = lib.q.trim()
  const selectedIds = [...selected]
  const toolBtn = 'rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm hover:bg-neutral-700'
  const onCardSelect = (id: number, e: MouseEvent) => clickCard(id, e)

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="text-sm font-semibold">snapnote</div>
        <nav className="flex items-center gap-1 text-sm">
          <button className={`rounded px-2 py-1 ${view === 'grid' ? 'bg-neutral-800' : ''}`} onClick={() => setView('grid')}>Library</button>
          <button className={`rounded px-2 py-1 ${view === 'settings' ? 'bg-neutral-800' : ''}`} onClick={() => setView('settings')}>Settings</button>
          <button className="ml-2 rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setHelp(true)}>?</button>
        </nav>
      </header>
      <FirstRunNotice />
      {flash && (
        <div role="status" className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
          <span>{flash.text}</span>
          {flash.undoToken != null && <button className="rounded bg-neutral-700 px-2 py-0.5 text-neutral-100 hover:bg-neutral-600" onClick={() => void undo(flash.undoToken!)}>Undo</button>}
        </div>
      )}
      {view === 'settings' ? (
        <div className="flex-1 overflow-auto">{settings}</div>
      ) : (
        <>
          <SearchBar ref={searchRef} q={lib.q} onQ={lib.setQ} sort={lib.sort} onSort={lib.setSort}
            extra={<button className={toolBtn} title="Paste an image, or files copied in Explorer (Ctrl+V)" onClick={() => void paste()}>Paste</button>} />
          <div className="flex min-h-0 flex-1">
            <Sidebar counts={lib.counts} destinations={destinations} destination={lib.destination} unlabeledOnly={lib.unlabeledOnly} tag={lib.tag}
              onAll={() => { lib.setDestination(null); lib.setUnlabeledOnly(false) }}
              onUnlabeled={() => { lib.setDestination(null); lib.setUnlabeledOnly(true) }}
              onDestination={(id) => { lib.setDestination(id); lib.setUnlabeledOnly(false) }}
              onTag={lib.setTag} onManage={() => setView('settings')} />
            {/* A column, so the results line sits at the bottom when the grid is short without adding height. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              <Grid ref={gridRef} cards={lib.cards} selected={selected} cursorId={cursor} onSelect={onCardSelect} onOpen={open} onMenu={openMenu}
                emptyText={q || lib.tag || lib.destination != null || lib.unlabeledOnly ? 'No screenshots match.' : 'No screenshots yet. Take one with Win+Shift+S, paste one with Ctrl+V, or drag images in from Explorer.'} />
              {(count > 0 || q) && (
                <div className="flex items-center justify-center gap-3 p-3 text-xs text-neutral-400">
                  <span>
                    {q ? `${count} result${count === 1 ? '' : 's'} for “${q}”${lib.hasMore ? ' so far' : ''}` : `Showing ${count}${lib.hasMore ? '' : ' (all)'}`}
                    {selected.size > 1 ? ` · ${selected.size} selected` : ''}
                  </span>
                  {lib.hasMore && <button className="rounded bg-neutral-800 px-2 py-1 text-neutral-200" onClick={lib.loadMore}>Load more</button>}
                </div>
              )}
            </div>
            {sidePanel && ctx && single != null && (
              <aside className="w-80 shrink-0 overflow-auto border-l border-neutral-800">{sidePanel(single, ctx)}</aside>
            )}
            {selected.size > 1 && (
              <aside className="w-80 shrink-0 overflow-auto border-l border-neutral-800">
                <MultiPanel count={selected.size} destinations={destinations} tagSuggestions={tagSuggestions} focus={panelFocus}
                  onMove={(choice) => void moveMany(selectedIds, choice)} onAddTags={(tags) => void addTagsMany(selectedIds, tags)}
                  onCopy={() => void copyMany(selectedIds)} onDelete={() => void deleteMany(selectedIds)}
                  onClear={() => { selectOnly(null); focusGrid() }} onBrowse={() => cmd.pickFolder()} />
              </aside>
            )}
          </div>
        </>
      )}
      {menu && <ContextMenu key={menu.seq} x={menu.x} y={menu.y} items={menuItems(menu.id)} onClose={() => setMenu(null)} />}
      {previewCard && (
        <Lightbox card={previewCard} index={previewIndex} count={count}
          onStep={(d) => { const n = lib.cards[previewIndex + d]; if (n) { setPreviewId(n.id); selectOnly(n.id) } }}
          onClose={() => { setPreviewId(null); focusGrid() }}
          onOpen={() => open(previewCard.id)} onCopy={() => void copyMany([previewCard.id])}
          onEdit={() => { setPreviewId(null); edit(previewCard.id) }} onDelete={() => void deleteMany([previewCard.id])} />
      )}
      {help && <ShortcutsHelp onClose={() => { setHelp(false); focusGrid() }} />}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-sky-950/70">
          <div className="rounded-lg border-2 border-dashed border-sky-400 px-8 py-6 text-lg">Drop images to add them to the library</div>
        </div>
      )}
    </div>
  )
}
