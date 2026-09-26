import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandsProvider } from '../../lib/CommandsContext'
import { createMockCommands } from '../../lib/commands.mock'
import { Toast } from './Toast'

function setup(seed?: Parameters<typeof createMockCommands>[0]) {
  const mock = createMockCommands(seed)
  render(
    <CommandsProvider commands={mock.commands}>
      <Toast />
    </CommandsProvider>,
  )
  return mock
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

describe('Toast', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders nothing until a toast:show arrives, then shows hint with the configured hotkey', async () => {
    const mock = setup({ settings: { label_hotkey: 'Ctrl+Alt+L' } })
    expect(screen.queryByText(/Screenshot saved/)).toBeNull()
    await flush()
    act(() => mock.emit('toast:show', { id: 1 }))
    await flush()
    expect(screen.getByText('Screenshot saved')).toBeInTheDocument()
    expect(screen.getByText(/Ctrl\+Alt\+L to label/)).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'mock://thumb/1')
  })

  it('asks Rust to hide after toast_seconds', async () => {
    const mock = setup({ settings: { toast_seconds: 3 } })
    await flush()
    act(() => mock.emit('toast:show', { id: 1 }))
    await flush()
    act(() => { vi.advanceTimersByTime(2900) })
    expect(mock.calls).toEqual([])
    act(() => { vi.advanceTimersByTime(200) })
    await flush()
    expect(mock.calls).toEqual([['hideToast']])
    expect(screen.queryByText('Screenshot saved')).toBeNull()
  })

  it('hovering pauses the countdown', async () => {
    const mock = setup({ settings: { toast_seconds: 2 } })
    await flush()
    act(() => mock.emit('toast:show', { id: 1 }))
    await flush()
    fireEvent.mouseEnter(screen.getByTestId('toast'))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(mock.calls).toEqual([])
    fireEvent.mouseLeave(screen.getByTestId('toast'))
    act(() => { vi.advanceTimersByTime(2100) })
    await flush()
    expect(mock.calls).toEqual([['hideToast']])
  })

  it('a second toast:show switches to the newest screenshot and restarts the timer', async () => {
    const mock = setup({ settings: { toast_seconds: 2 } })
    await flush()
    act(() => mock.emit('toast:show', { id: 1 }))
    await flush()
    act(() => { vi.advanceTimersByTime(1500) })
    act(() => mock.emit('toast:show', { id: 2 }))
    await flush()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'mock://thumb/2')
    act(() => { vi.advanceTimersByTime(1500) })
    expect(mock.calls).toEqual([])
    act(() => { vi.advanceTimersByTime(600) })
    await flush()
    expect(mock.calls).toEqual([['hideToast']])
  })

  it('click opens the popup for the shown screenshot', async () => {
    const mock = setup()
    await flush()
    act(() => mock.emit('toast:show', { id: 3 }))
    await flush()
    fireEvent.click(screen.getByTestId('toast'))
    await flush()
    expect(mock.calls).toEqual([['openPopupFor', 3]])
  })

  it('toast:hide from Rust clears the toast without calling hideToast again', async () => {
    const mock = setup()
    await flush()
    act(() => mock.emit('toast:show', { id: 1 }))
    await flush()
    act(() => mock.emit('toast:hide', {}))
    await flush()
    expect(screen.queryByText('Screenshot saved')).toBeNull()
    expect(mock.calls).toEqual([])
  })

  it('still shows when the thumbnail fails', async () => {
    const mock = setup()
    mock.commands.thumbnailUrl = async () => { throw { code: 'Image', message: 'bad png' } }
    await flush()
    act(() => mock.emit('toast:show', { id: 1 }))
    await flush()
    expect(screen.getByText('Screenshot saved')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
