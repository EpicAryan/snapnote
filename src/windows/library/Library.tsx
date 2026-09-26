import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCommands } from '../../lib/CommandsContext'
import type { Destination } from '../../lib/types'
import { FirstRunNotice } from './FirstRunNotice'
import { Grid } from './Grid'
import { SearchBar } from './SearchBar'
import { useLibraryQuery } from './useLibraryQuery'

export type LibraryView = 'grid' | 'settings'

export function Library({ sidePanel, settings }: { sidePanel?: (id: number | null, onChanged: () => void) => ReactNode; settings?: ReactNode } = {}) {
  const cmd = useCommands()
  const lib = useLibraryQuery()
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<LibraryView>('grid')
  const searchRef = useRef<HTMLInputElement>(null)

  const loadDestinations = () => { void cmd.listDestinations().then(setDestinations) }
  useEffect(loadDestinations, [cmd])
  useEffect(() => { let un: (() => void) | undefined; cmd.on('settings:changed', loadDestinations).then((u) => { un = u }); return () => un?.() }, [cmd])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); searchRef.current?.focus() }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

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
      {view === 'settings' ? (
        <div className="flex-1 overflow-auto">{settings}</div>
      ) : (
        <>
          <SearchBar ref={searchRef} q={lib.q} onQ={lib.setQ} destinations={destinations} destination={lib.destination} onDestination={lib.setDestination}
            unlabeledOnly={lib.unlabeledOnly} onUnlabeledOnly={lib.setUnlabeledOnly} sort={lib.sort} onSort={lib.setSort} />
          <div className="flex min-h-0 flex-1">
            <div className="flex-1 overflow-auto">
              <Grid cards={lib.cards} selectedId={selectedId} onSelect={setSelectedId} onOpen={(id) => void cmd.openFile(id)} onDeleteRequest={setSelectedId} />
              {lib.cards.length > 0 && (
                <div className="flex items-center justify-center gap-3 p-3 text-xs text-neutral-400">
                  <span>Showing {lib.cards.length}{lib.hasMore ? '' : ' (all)'}</span>
                  {lib.hasMore && <button className="rounded bg-neutral-800 px-2 py-1 text-neutral-200" onClick={lib.loadMore}>Load more</button>}
                </div>
              )}
            </div>
            {sidePanel && <aside className="w-80 shrink-0 overflow-auto border-l border-neutral-800">{sidePanel(selectedId, () => void lib.reload())}</aside>}
          </div>
        </>
      )}
    </div>
  )
}
