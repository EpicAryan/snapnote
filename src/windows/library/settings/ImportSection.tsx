import { useEffect, useState } from 'react'
import { useCommands } from '../../../lib/CommandsContext'
import { forgetAllThumbnails } from '../../../lib/useThumbnail'
import { errorMessage } from '../../../lib/types'

export function ImportSection() {
  const cmd = useCommands()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<string | null>(null)
  useEffect(() => { let un: (() => void) | undefined; cmd.on('import:progress', setProgress).then((u) => { un = u }); return () => un?.() }, [cmd])
  const run = async () => {
    setResult(null); setProgress({ done: 0, total: 0 })
    try { const r = await cmd.importExisting(); setResult(`Imported ${r.added}, skipped ${r.skipped}`) } catch (e) { setResult(errorMessage(e)) } finally { setProgress(null) }
  }
  return (
    <section className="flex flex-col gap-2 text-xs">
      <h2 className="text-sm font-semibold">Maintenance</h2>
      <div className="flex flex-wrap items-center gap-2">
        <button className="rounded bg-neutral-800 px-2 py-1" disabled={progress !== null} onClick={() => void run()}>Import existing screenshots</button>
        {progress && progress.total > 0 && <span>{progress.done} / {progress.total}</span>}
        {result && <span className="text-neutral-300">{result}</span>}
      </div>
      <div className="flex gap-2">
        <button className="rounded bg-neutral-800 px-2 py-1" onClick={() => { forgetAllThumbnails(); void cmd.clearThumbnailCache() }}>Clear thumbnail cache</button>
        <button className="rounded bg-neutral-800 px-2 py-1" onClick={() => void cmd.openDataFolder()}>Open data folder</button>
      </div>
    </section>
  )
}
