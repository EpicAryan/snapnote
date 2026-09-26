import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles.css'
import { CommandsProvider } from '../../lib/CommandsContext'
import { tauriCommands } from '../../lib/commands.tauri'
import { Library } from './Library'
import { SidePanel } from './SidePanel'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CommandsProvider commands={tauriCommands}>
      <Library sidePanel={(id, onChanged) => <SidePanel id={id} onChanged={onChanged} />} />
    </CommandsProvider>
  </StrictMode>,
)
