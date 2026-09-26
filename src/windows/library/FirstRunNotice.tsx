import { useEffect, useState } from 'react'
import { useCommands } from '../../lib/CommandsContext'

export function FirstRunNotice() {
  const cmd = useCommands()
  const [show, setShow] = useState(false)
  useEffect(() => {
    void cmd.getSettings().then((s) => {
      if (s.first_run_done) return
      setShow(true)
      // Being shown once is enough: otherwise the library keeps opening by itself at every
      // launch (and after every update) until the button is clicked.
      void cmd.setSetting('first_run_done', 'true')
    })
  }, [cmd])
  if (!show) return null
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sky-900 bg-sky-950/60 px-3 py-2 text-xs">
      <div>
        snapnote is running in your tray and <strong>starts with Windows</strong>. Take a screenshot with Win+Shift+S to see the toast.
        You can turn autostart off in Settings, and use “Import existing screenshots” there to bring in your old ones.
      </div>
      <button className="rounded bg-sky-700 px-2 py-1" onClick={() => setShow(false)}>Got it</button>
    </div>
  )
}
