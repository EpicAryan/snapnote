import { useCallback, useEffect, useState } from 'react'
import { useCommands } from '../../../lib/CommandsContext'
import type { Settings } from '../../../lib/types'
import { DestinationsSection } from './DestinationsSection'
import { GeneralSection } from './GeneralSection'
import { ImportSection } from './ImportSection'
import { WatchFolderSection } from './WatchFolderSection'

export function SettingsScreen() {
  const cmd = useCommands()
  const [settings, setSettings] = useState<Settings | null>(null)
  const reload = useCallback(() => { void cmd.getSettings().then(setSettings) }, [cmd])
  useEffect(reload, [reload])
  if (!settings) return null
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <WatchFolderSection settings={settings} onChange={reload} />
      <DestinationsSection />
      <GeneralSection settings={settings} onChange={reload} />
      <ImportSection />
    </div>
  )
}
