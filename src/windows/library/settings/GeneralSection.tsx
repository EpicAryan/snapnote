import { useEffect, useState } from 'react'
import { useCommands } from '../../../lib/CommandsContext'
import { isValidHotkey, normalizeHotkey } from '../../../lib/hotkey'
import type { Settings } from '../../../lib/types'
import { errorMessage } from '../../../lib/types'

export function GeneralSection({ settings, onChange }: { settings: Settings; onChange(): void }) {
  const cmd = useCommands()
  const [hotkey, setHotkey] = useState(settings.label_hotkey)
  const [secs, setSecs] = useState(String(settings.toast_seconds))
  const [hotkeyMsg, setHotkeyMsg] = useState<string | null>(null)
  const [secsMsg, setSecsMsg] = useState<string | null>(null)
  const [backendHotkeyError, setBackendHotkeyError] = useState<string | null>(null)

  // Sync each input from its own setting only, so saving one field never clobbers another mid-edit.
  useEffect(() => { setHotkey(settings.label_hotkey) }, [settings.label_hotkey])
  useEffect(() => { setSecs(String(settings.toast_seconds)) }, [settings.toast_seconds])
  useEffect(() => { let un: (() => void) | undefined; cmd.on('hotkey:error', (p) => setBackendHotkeyError(p.message)).then((u) => { un = u }); return () => un?.() }, [cmd])

  const commitHotkey = async () => {
    if (!isValidHotkey(hotkey)) { setHotkeyMsg('Hotkey needs a modifier (Ctrl, Alt or Win) plus one key, e.g. Ctrl+Shift+L'); return }
    setHotkeyMsg(null); setBackendHotkeyError(null)
    try { await cmd.setSetting('label_hotkey', normalizeHotkey(hotkey)); onChange() } catch (e) { setHotkeyMsg(errorMessage(e)) }
  }
  const commitSecs = async () => {
    try { await cmd.setSetting('toast_seconds', secs.trim()); setSecsMsg(null); onChange() } catch (e) { setSecsMsg(errorMessage(e)) }
  }
  const toggle = (key: 'rename_on_label' | 'autostart') => async (checked: boolean) => { await cmd.setSetting(key, String(checked)); onChange() }

  return (
    <section className="flex flex-col gap-3 text-xs">
      <h2 className="text-sm font-semibold">General</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor="hotkey">Label hotkey</label>
        <input id="hotkey" value={hotkey} onChange={(e) => setHotkey(e.target.value)} onBlur={() => void commitHotkey()} onKeyDown={(e) => { if (e.key === 'Enter') void commitHotkey() }} className="w-48 rounded border border-neutral-700 bg-neutral-800 px-2 py-1" />
        {hotkeyMsg && <div className="text-red-400">{hotkeyMsg}</div>}
        {backendHotkeyError && <div className="text-amber-400">{backendHotkeyError}</div>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="toast-secs">Toast seconds</label>
        <input id="toast-secs" inputMode="numeric" value={secs} onChange={(e) => setSecs(e.target.value)} onBlur={() => void commitSecs()} className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1" />
        {secsMsg && <div className="text-red-400">{secsMsg}</div>}
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" aria-label="Rename file when labeled" checked={settings.rename_on_label} onChange={(e) => void toggle('rename_on_label')(e.target.checked)} />Rename file when labeled</label>
      <label className="flex items-center gap-2"><input type="checkbox" aria-label="Start with Windows" checked={settings.autostart} onChange={(e) => void toggle('autostart')(e.target.checked)} />Start with Windows</label>
    </section>
  )
}
