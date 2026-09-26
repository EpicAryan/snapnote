import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CommandsProvider } from '../../lib/CommandsContext'
import { createMockCommands } from '../../lib/commands.mock'
import { FirstRunNotice } from './FirstRunNotice'

describe('FirstRunNotice', () => {
  it('shows once, marks itself seen as soon as it appears, and the button hides it', async () => {
    const mock = createMockCommands()
    render(<CommandsProvider commands={mock.commands}><FirstRunNotice /></CommandsProvider>)
    await screen.findByText(/starts with Windows/)
    // Seen is enough: the library must not open by itself at the next launch even if the
    // button is never clicked (for example after an update).
    await waitFor(() => expect(mock.state.settings.first_run_done).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByText(/starts with Windows/)).toBeNull()
  })

  it('does not render when already seen', async () => {
    const mock = createMockCommands({ settings: { first_run_done: true } })
    render(<CommandsProvider commands={mock.commands}><FirstRunNotice /></CommandsProvider>)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByText(/starts with Windows/)).toBeNull()
  })
})
