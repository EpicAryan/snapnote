import { useEffect, useState } from 'react'
import { useCommands } from '../../../lib/CommandsContext'
import type { Settings } from '../../../lib/types'

export function WatchFolderSection({ settings, onChange }: { settings: Settings; onChange(): void }) {
  const cmd = useCommands()
  const [detected, setDetected] = useState('')
  useEffect(() => { void cmd.detectWatchFolder().then(setDetected) }, [cmd])
  const effective = settings.watch_folder_override || detected
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Watch folder</h2>
      <p className="text-xs text-neutral-400">Where Windows saves screenshots. New files here trigger the toast. Changing it takes effect immediately.</p>
      <div className="break-all rounded bg-neutral-900 p-2 text-xs">{effective}</div>
      <div className="flex gap-2">
        <button className="rounded bg-neutral-800 px-2 py-1 text-xs" onClick={async () => { const p = await cmd.pickFolder(); if (p) { await cmd.setSetting('watch_folder_override', p); onChange() } }}>Change…</button>
        {settings.watch_folder_override && <button className="rounded bg-neutral-800 px-2 py-1 text-xs" onClick={async () => { await cmd.setSetting('watch_folder_override', ''); onChange() }}>Reset to detected</button>}
      </div>
    </section>
  )
}
