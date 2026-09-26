import { useCallback, useEffect, useState } from 'react'
import { useCommands } from '../../lib/CommandsContext'
import type { RecentLabel, Screenshot } from '../../lib/types'
import { useCountdown } from './useCountdown'

interface Shown {
  shot: Screenshot
  thumb: string | null
  hotkey: string
  seconds: number
  nonce: number
  recent: RecentLabel[]
}

export function Toast() {
  const cmd = useCommands()
  const [shown, setShown] = useState<Shown | null>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let alive = true
    const unsubs: Array<() => void> = []
    cmd.on('toast:show', async ({ id }) => {
      const [shot, settings, recent] = await Promise.all([cmd.getScreenshot(id), cmd.getSettings(), cmd.recentLabels().catch(() => [] as RecentLabel[])])
      let thumb: string | null = null
      try { thumb = await cmd.thumbnailUrl(id) } catch { thumb = null }
      if (!alive) return
      setPaused(false)
      setShown({ shot, thumb, hotkey: settings.label_hotkey, seconds: settings.toast_seconds, nonce: Date.now() + Math.random(), recent: recent.slice(0, 3) })
    }).then((u) => unsubs.push(u))
    cmd.on('toast:hide', () => setShown(null)).then((u) => unsubs.push(u))
    return () => { alive = false; unsubs.forEach((u) => u()) }
  }, [cmd])

  const onDone = useCallback(() => {
    setShown(null)
    void cmd.hideToast()
  }, [cmd])

  useCountdown(shown ? shown.nonce : null, (shown?.seconds ?? 8) * 1000, paused, onDone)

  // One click applies a recent label together with the destination it went to last time.
  const quick = async (r: RecentLabel) => {
    if (!shown) return
    const { shot } = shown
    setShown(null)
    try {
      await cmd.saveMetadata(shot.id, r.label, shot.notes, shot.tags, { kind: 'existing', id: r.destination_id })
      await cmd.hideToast()
    } catch {
      void cmd.openPopupFor(shot.id)
    }
  }

  if (!shown) return null

  return (
    <div
      data-testid="toast"
      role="button"
      tabIndex={-1}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => { const id = shown.shot.id; setShown(null); void cmd.openPopupFor(id) }}
      className="flex h-full w-full cursor-pointer select-none flex-col justify-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-neutral-100 shadow-lg"
    >
      <div className="flex items-center gap-3">
        {shown.thumb && <img src={shown.thumb} alt="Screenshot thumbnail" className="h-14 w-20 rounded object-cover" />}
        <div className="min-w-0">
          <div className="text-sm font-medium">Screenshot saved</div>
          <div className="truncate text-xs text-neutral-400">{shown.hotkey} to label · click to label</div>
        </div>
      </div>
      {shown.recent.length > 0 && (
        <div className="flex items-center gap-1 overflow-hidden text-xs">
          {shown.recent.map((r) => (
            <button key={r.label} type="button" title={`Label “${r.label}” and file under ${r.destination_name}`}
              className="max-w-28 truncate rounded bg-neutral-800 px-1.5 py-0.5 hover:bg-sky-800"
              onClick={(e) => { e.stopPropagation(); void quick(r) }}>{r.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
