import { createContext, useContext, type ReactNode } from 'react'
import type { Commands } from './commands'

const Ctx = createContext<Commands | null>(null)

export function CommandsProvider({ commands, children }: { commands: Commands; children: ReactNode }) {
  return <Ctx.Provider value={commands}>{children}</Ctx.Provider>
}

export function useCommands(): Commands {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCommands must be used inside <CommandsProvider>')
  return c
}
