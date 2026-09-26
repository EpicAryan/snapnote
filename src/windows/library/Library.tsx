import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useCommands } from '../../lib/CommandsContext'
import { displayName } from '../../lib/format'
import type { Destination } from '../../lib/types'
import { errorMessage } from '../../lib/types'
import { FirstRunNotice } from './FirstRunNotice'
import { Grid } from './Grid'
import { SearchBar } from './SearchBar'
import { useLibraryQuery } from './useLibraryQuery'

export type LibraryView = 'grid' | 'settings'

export function Library({ sidePanel, settings }: { sidePanel?: (id: number | null, onChanged: () => void, onClose: () => void) => ReactNode; settings?: ReactNode } = {}) {
  const cmd = useCommands()
  const lib = useLibraryQuery()
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<LibraryView>('grid')
  const [flash, setFlash] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedRef = useRef<number | null>(null)
  selectedRef.current = selectedId

  const say = useCallback((text: string) => {
    setFlash(text)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 2500)
  }, [])

  const copySelected = useCallback(async () => {
    const id = selectedRef.current
    if (id == null) return
    try { await cmd.copyImage(id); say('Copied image to the clipboard') } catch (e) { say(errorMessage(e)) }
  }, [cmd, say])

  const pasteImage = useCallback(async () => {
    try {
      const path = await cmd.pasteClipboardImage()
      say(`Saved clipboard image as ${path.split(/[\\/]/).pop()}`)
    } catch (e) { say(errorMessage(e)) }
  }, [cmd, say])

  const deleteCard = useCallback(async (id: number) => {
    const card = lib.cards.find((c) => c.id === id)
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
      setSelectedId(null)
      say(missing ? 'Removed from the library' : 'Moved to the Recycle Bin')
    } catch (e) { say(errorMessage(e)) }
  }, [cmd, say, lib.cards])

  // Files come and go behind the app's back; re-check them every minute while the library is open.
  useEffect(() => {
    const t = setInterval(() => { void cmd.reconcileNow() }, 60_000)
    return () => clearInterval(t)
  }, [cmd])

  const loadDestinations = () => { void cmd.listDestinations().then(setDestinations) }
  useEffect(loadDestinations, [cmd])
  useEffect(() => { let un: (() => void) | undefined; cmd.on('settings:changed', loadDestinations).then((u) => { un = u }); return () => un?.() }, [cmd])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (typing) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'Escape') setSelectedId(null)
      if (e.ctrlKey && e.key.toLowerCase() === 'c') { e.preventDefault(); void copySelected() }
      if (e.ctrlKey && e.key.toLowerCase() === 'v') { e.preventDefault(); void pasteImage() }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [copySelected, pasteImage])

  useEffect(() => { if (selectedId != null && !lib.cards.some((c) => c.id === selectedId)) setSelectedId(null) }, [lib.cards, selectedId])

  useEffect(() => { let un: (() => void) | undefined; cmd.on('library:view', (p) => setView(p.view)).then((u) => { un = u }); return () => un?.() }, [cmd])

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="text-sm font-semibold">snapnote</div>
        <nav className="flex gap-1 text-sm">
          <button className={`rounded px-2 py-1 ${view === 'grid' ? 'bg-neutral-800' : ''}`} onClick={() => setView('grid')}>Library</button>
          <button className={`rounded px-2 py-1 ${view === 'settings' ? 'bg-neutral-800' : ''}`} onClick={() => setView('settings')}>Settings</button>
        </nav>
      </header>
      <FirstRunNotice />
      {flash && <div className="border-b border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">{flash}</div>}
      {view === 'settings' ? (
        <div className="flex-1 overflow-auto">{settings}</div>
      ) : (
        <>
          <SearchBar ref={searchRef} q={lib.q} onQ={lib.setQ} destinations={destinations} destination={lib.destination} onDestination={lib.setDestination}
            unlabeledOnly={lib.unlabeledOnly} onUnlabeledOnly={lib.setUnlabeledOnly} sort={lib.sort} onSort={lib.setSort}
            extra={<button className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm" title="Save the clipboard image as a screenshot (Ctrl+V)" onClick={() => void pasteImage()}>Paste image</button>} />
          <div className="flex min-h-0 flex-1">
            <div className="flex-1 overflow-auto">
              <Grid cards={lib.cards} selectedId={selectedId} onSelect={setSelectedId} onOpen={(id) => void cmd.openFile(id)} onDeleteRequest={(id) => void deleteCard(id)} />
              {(lib.cards.length > 0 || lib.q.trim()) && (
                <div className="flex items-center justify-center gap-3 p-3 text-xs text-neutral-400">
                  <span>
                    {lib.q.trim()
                      ? `${lib.cards.length} result${lib.cards.length === 1 ? '' : 's'} for “${lib.q.trim()}”${lib.hasMore ? ' so far' : ''}`
                      : `Showing ${lib.cards.length}${lib.hasMore ? '' : ' (all)'}`}
                  </span>
                  {lib.hasMore && <button className="rounded bg-neutral-800 px-2 py-1 text-neutral-200" onClick={lib.loadMore}>Load more</button>}
                </div>
              )}
            </div>
            {sidePanel && <aside className="w-80 shrink-0 overflow-auto border-l border-neutral-800">{sidePanel(selectedId, () => void lib.reload(), () => setSelectedId(null))}</aside>}
          </div>
        </>
      )}
    </div>
  )
}
