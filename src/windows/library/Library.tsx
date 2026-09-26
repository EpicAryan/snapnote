import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ContextMenu, type MenuItem } from '../../components/ContextMenu'
import { useCommands } from '../../lib/CommandsContext'
import { describeAdd, displayName } from '../../lib/format'
import type { AddReport, Destination, ScreenshotCard } from '../../lib/types'
import { errorMessage } from '../../lib/types'
import { FirstRunNotice } from './FirstRunNotice'
import { columnsOf, Grid } from './Grid'
import { Lightbox } from './Lightbox'
import { SearchBar } from './SearchBar'
import { ShortcutsHelp } from './ShortcutsHelp'
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
}

interface Props {
  sidePanel?: (id: number, ctx: PanelContext) => ReactNode
  settings?: ReactNode
}

const tagOf = (t: EventTarget | null) => (t as HTMLElement | null)?.tagName ?? ''
const isTyping = (t: EventTarget | null) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagOf(t))
const isButton = (t: EventTarget | null) => ['BUTTON', 'A'].includes(tagOf(t))

export function Library({ sidePanel, settings }: Props = {}) {
  const cmd = useCommands()
  const lib = useLibraryQuery()
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<LibraryView>('grid')
  const [flash, setFlash] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: number; x: number; y: number; seq: number } | null>(null)
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [help, setHelp] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [editRequest, setEditRequest] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuSeq = useRef(0)
  const cardsRef = useRef<ScreenshotCard[]>([])
  cardsRef.current = lib.cards
  const selectedRef = useRef<number | null>(null)
  selectedRef.current = selectedId

  const previewCard = previewId != null ? lib.cards.find((c) => c.id === previewId) : undefined
  const previewIndex = previewCard ? lib.cards.indexOf(previewCard) : -1
  const overlayOpen = menu != null || previewCard != null || help

  const focusGrid = useCallback(() => { gridRef.current?.focus() }, [])

  const say = useCallback((text: string) => {
    setFlash(text)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 3000)
  }, [])

  const copy = useCallback(async (id: number) => {
    try { await cmd.copyScreenshot(id); say('Copied. Paste it into a folder, a chat or an image editor.') } catch (e) { say(errorMessage(e)) }
  }, [cmd, say])

  // A single file that is already tracked is worth pointing at instead of adding again.
  const report = useCallback((r: AddReport) => {
    say(describeAdd(r))
    if (r.added.length === 0 && r.existing.length === 1) setSelectedId(r.existing[0])
  }, [say])

  const paste = useCallback(async () => {
    try { report(await cmd.pasteClipboard()) } catch (e) { say(errorMessage(e)) }
  }, [cmd, report, say])

  const addFiles = useCallback(async (paths: string[]) => {
    try { report(await cmd.addFiles(paths)) } catch (e) { say(errorMessage(e)) }
  }, [cmd, report, say])

  const open = useCallback((id: number) => { void cmd.openFile(id).catch((e) => say(errorMessage(e))) }, [cmd, say])
  const reveal = useCallback((id: number) => { void cmd.revealFile(id).catch((e) => say(errorMessage(e))) }, [cmd, say])
  const edit = useCallback((id: number) => { setSelectedId(id); setEditRequest((n) => n + 1) }, [])
  const preview = useCallback((id: number) => {
    if (cardsRef.current.find((c) => c.id === id)?.status !== 'missing') setPreviewId(id)
  }, [])
  const retry = useCallback(async (id: number) => {
    try { const r = await cmd.retryMove(id); say(r.warning ?? `Moved to ${r.destination.name}`) } catch (e) { say(errorMessage(e)) }
  }, [cmd, say])
  const openMenu = useCallback((id: number, x: number, y: number) => {
    setSelectedId(id)
    setMenu({ id, x, y, seq: ++menuSeq.current })
  }, [])
  const openMenuForSelected = useCallback((id: number) => {
    const r = gridRef.current?.querySelector<HTMLElement>(`[data-card="${id}"]`)?.getBoundingClientRect()
    openMenu(id, (r?.left ?? 0) + 16, (r?.top ?? 0) + 16)
  }, [openMenu])

  const deleteCard = useCallback(async (id: number) => {
    const cards = cardsRef.current
    const idx = cards.findIndex((c) => c.id === id)
    const card = cards[idx]
    if (!card) return
    const missing = card.status === 'missing'
    const ok = await cmd.confirm(
      missing ? `Forget “${displayName(card)}”? The file is already gone.` : `Move “${displayName(card)}” to the Recycle Bin and remove it from the library?`,
      'Delete screenshot',
    )
    if (!ok) return
    try {
      if (missing) await cmd.removeFromLibrary(id)
      else await cmd.deleteFile(id)
      // Explorer-style: the selection moves on to the next card.
      const next = cards[idx + 1] ?? cards[idx - 1]
      setSelectedId(next?.id ?? null)
      setPreviewId((p) => (p === id ? (next?.id ?? null) : p))
      say(missing ? 'Removed from the library' : 'Moved to the Recycle Bin')
    } catch (e) { say(errorMessage(e)) }
  }, [cmd, say])

  const menuItems = (id: number): MenuItem[] => {
    const card = lib.cards.find((c) => c.id === id)
    if (!card) return []
    const missing = card.status === 'missing'
    const items: MenuItem[] = [
      { label: 'Preview', shortcut: 'Space', disabled: missing, onSelect: () => preview(id) },
      { label: 'Open', shortcut: 'Enter', disabled: missing, onSelect: () => open(id) },
      { label: 'Show in folder', disabled: missing, onSelect: () => reveal(id) },
      'separator',
      { label: 'Edit details', shortcut: 'F2', onSelect: () => edit(id) },
      { label: 'Copy', shortcut: 'Ctrl+C', disabled: missing, onSelect: () => void copy(id) },
    ]
    if (card.pending_move_to != null) items.push({ label: 'Retry move', onSelect: () => void retry(id) })
    items.push('separator', { label: missing ? 'Remove from library' : 'Delete', shortcut: 'Del', danger: true, onSelect: () => void deleteCard(id) })
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
      const idx = cards.findIndex((c) => c.id === sel)
      const cols = () => columnsOf(gridRef.current)
      const moveTo = (i: number) => { const next = cards[Math.max(0, Math.min(cards.length - 1, i))]; if (next) setSelectedId(next.id) }
      const move = (delta: number) => { if (idx < 0) moveTo(delta < 0 ? cards.length - 1 : 0); else moveTo(idx + delta) }
      if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); return }
      if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); if (sel != null) void copy(sel); return }
      if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); void paste(); return }
      if (ctrl || e.altKey) return
      switch (e.key) {
        case '/': e.preventDefault(); searchRef.current?.focus(); break
        case '?': case 'F1': e.preventDefault(); setHelp(true); break
        case 'Escape': if (sel != null) { setSelectedId(null); focusGrid() } break
        case 'ArrowRight': e.preventDefault(); move(1); break
        case 'ArrowLeft': e.preventDefault(); move(-1); break
        case 'ArrowDown': e.preventDefault(); move(cols()); break
        case 'ArrowUp': e.preventDefault(); move(-cols()); break
        case 'Home': e.preventDefault(); moveTo(0); break
        case 'End': e.preventDefault(); moveTo(cards.length - 1); break
        case 'PageDown': e.preventDefault(); move(cols() * 3); break
        case 'PageUp': e.preventDefault(); move(-cols() * 3); break
        case 'Enter': if (sel != null && !isButton(e.target)) { e.preventDefault(); open(sel) } break
        case ' ': if (sel != null && !isButton(e.target)) { e.preventDefault(); preview(sel) } break
        case 'F2': if (sel != null) { e.preventDefault(); edit(sel) } break
        case 'Delete': if (sel != null) { e.preventDefault(); void deleteCard(sel) } break
        case 'ContextMenu': if (sel != null) { e.preventDefault(); openMenuForSelected(sel) } break
        case 'F10': if (e.shiftKey && sel != null) { e.preventDefault(); openMenuForSelected(sel) } break
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [overlayOpen, copy, paste, open, edit, preview, deleteCard, focusGrid, openMenuForSelected])

  useEffect(() => { if (selectedId != null && !lib.cards.some((c) => c.id === selectedId)) setSelectedId(null) }, [lib.cards, selectedId])
  useEffect(() => { if (previewId != null && !lib.cards.some((c) => c.id === previewId)) setPreviewId(null) }, [lib.cards, previewId])
  useEffect(() => { if (view === 'grid') focusGrid() }, [view, focusGrid])

  const ctx: PanelContext | null = selectedId == null ? null : {
    onChanged: () => void lib.reload(),
    onClose: () => { setSelectedId(null); focusGrid() },
    onDelete: () => void deleteCard(selectedId),
    onCopy: () => void copy(selectedId),
    editRequest,
  }
  const count = lib.cards.length
  const q = lib.q.trim()
  const toolBtn = 'rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm hover:bg-neutral-700'

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
      {flash && <div role="status" className="border-b border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">{flash}</div>}
      {view === 'settings' ? (
        <div className="flex-1 overflow-auto">{settings}</div>
      ) : (
        <>
          <SearchBar ref={searchRef} q={lib.q} onQ={lib.setQ} destinations={destinations} destination={lib.destination} onDestination={lib.setDestination}
            unlabeledOnly={lib.unlabeledOnly} onUnlabeledOnly={lib.setUnlabeledOnly} sort={lib.sort} onSort={lib.setSort}
            extra={<button className={toolBtn} title="Paste an image, or files copied in Explorer (Ctrl+V)" onClick={() => void paste()}>Paste</button>} />
          <div className="flex min-h-0 flex-1">
            <div className="flex-1 overflow-auto">
              <Grid ref={gridRef} cards={lib.cards} selectedId={selectedId} onSelect={setSelectedId} onOpen={open} onMenu={openMenu}
                emptyText={q ? 'No screenshots match.' : 'No screenshots yet. Take one with Win+Shift+S, paste one with Ctrl+V, or drag images in from Explorer.'} />
              {(count > 0 || q) && (
                <div className="flex items-center justify-center gap-3 p-3 text-xs text-neutral-400">
                  <span>
                    {q ? `${count} result${count === 1 ? '' : 's'} for “${q}”${lib.hasMore ? ' so far' : ''}` : `Showing ${count}${lib.hasMore ? '' : ' (all)'}`}
                  </span>
                  {lib.hasMore && <button className="rounded bg-neutral-800 px-2 py-1 text-neutral-200" onClick={lib.loadMore}>Load more</button>}
                </div>
              )}
            </div>
            {sidePanel && ctx && selectedId != null && (
              <aside className="w-80 shrink-0 overflow-auto border-l border-neutral-800">{sidePanel(selectedId, ctx)}</aside>
            )}
          </div>
        </>
      )}
      {menu && <ContextMenu key={menu.seq} x={menu.x} y={menu.y} items={menuItems(menu.id)} onClose={() => setMenu(null)} />}
      {previewCard && (
        <Lightbox card={previewCard} index={previewIndex} count={count}
          onStep={(d) => { const n = lib.cards[previewIndex + d]; if (n) { setPreviewId(n.id); setSelectedId(n.id) } }}
          onClose={() => { setPreviewId(null); focusGrid() }}
          onOpen={() => open(previewCard.id)} onCopy={() => void copy(previewCard.id)}
          onEdit={() => { setPreviewId(null); edit(previewCard.id) }} onDelete={() => void deleteCard(previewCard.id)} />
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
