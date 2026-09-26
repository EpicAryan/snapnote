import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles.css'
import { CommandsProvider } from '../../lib/CommandsContext'
import { tauriCommands } from '../../lib/commands.tauri'
import { Popup } from './Popup'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CommandsProvider commands={tauriCommands}>
      <Popup />
    </CommandsProvider>
  </StrictMode>,
)
