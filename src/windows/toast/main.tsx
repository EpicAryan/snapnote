import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles.css'
import { CommandsProvider } from '../../lib/CommandsContext'
import { tauriCommands } from '../../lib/commands.tauri'
import { Toast } from './Toast'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CommandsProvider commands={tauriCommands}>
      <Toast />
    </CommandsProvider>
  </StrictMode>,
)
