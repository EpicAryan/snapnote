import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles.css'
import { CommandsProvider } from '../../lib/CommandsContext'
import { tauriCommands } from '../../lib/commands.tauri'
import { Library } from './Library'
import { SidePanel } from './SidePanel'
import { SettingsScreen } from './settings/SettingsScreen'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CommandsProvider commands={tauriCommands}>
      <Library sidePanel={(id, onChanged, onClose) => <SidePanel id={id} onChanged={onChanged} onClose={onClose} />} settings={<SettingsScreen />} />
    </CommandsProvider>
  </StrictMode>,
)
