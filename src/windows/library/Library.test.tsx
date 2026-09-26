import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CommandsProvider } from '../../lib/CommandsContext'
import { createMockCommands } from '../../lib/commands.mock'
import { Library } from './Library'

async function setup() {
  const mock = createMockCommands()
  const embee = await mock.commands.createDestination('Embee', 'D:\\Work\\Embee')
  await mock.commands.saveMetadata(1, 'Invoice timeout', 'DB timeout while syncing', { kind: 'existing', id: embee.id })
  await mock.commands.saveMetadata(2, 'Login page bug', '', { kind: 'existing', id: 1 })
  render(<CommandsProvider commands={mock.commands}><Library /></CommandsProvider>)
  await screen.findAllByTestId('card')
  return { mock, embee }
}

const cardNames = () => screen.getAllByTestId('card').map((c) => within(c).getByTestId('card-title').textContent)

describe('Library', () => {
  it('lists all screenshots newest first with label or filename, destination and date', async () => {
    await setup()
    expect(cardNames()).toEqual(['Invoice timeout', 'Login page bug', 'Screenshot 2026-09-25 120602.png'])
    const first = screen.getAllByTestId('card')[0]
    expect(within(first).getByText('Embee')).toBeInTheDocument()
    expect(within(first).getByText('26 Sep 2026')).toBeInTheDocument()
    expect(within(first).getByText('DB timeout while syncing')).toBeInTheDocument()
    expect(await within(first).findByRole('img')).toHaveAttribute('src', 'mock://thumb/1')
  })

  it('search narrows results after the debounce', async () => {
    await setup()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sync' } })
    await waitFor(() => expect(cardNames()).toEqual(['Invoice timeout']))
  })

  it('destination filter and unlabeled toggle compose', async () => {
    const { embee } = await setup()
    fireEvent.change(screen.getByLabelText('Destination filter'), { target: { value: String(embee.id) } })
    await waitFor(() => expect(cardNames()).toEqual(['Invoice timeout']))
    fireEvent.change(screen.getByLabelText('Destination filter'), { target: { value: '' } })
    fireEvent.click(screen.getByLabelText('Unlabeled only'))
    await waitFor(() => expect(cardNames()).toEqual(['Screenshot 2026-09-25 120602.png']))
  })

  it('sort toggles to oldest first', async () => {
    await setup()
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'oldest' } })
    await waitFor(() => expect(cardNames()[0]).toBe('Screenshot 2026-09-25 120602.png'))
  })

  it('keyboard: arrows move selection, Enter opens the file, / focuses search', async () => {
    const { mock } = await setup()
    const grid = screen.getByTestId('grid')
    fireEvent.click(screen.getAllByTestId('card')[0])
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect(screen.getAllByTestId('card')[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(grid, { key: 'Enter' })
    await waitFor(() => expect(mock.calls).toContainEqual(['openFile', 2]))
    fireEvent.keyDown(document.body, { key: '/' })
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('refreshes when a screenshot:new event arrives', async () => {
    const { mock } = await setup()
    mock.state.screenshots.push({ ...mock.state.screenshots[0], id: 99, label: 'Brand new', captured_at: '2026-09-27T00:00:00', path: 'C:\\x\\new.png', original_name: 'new.png' })
    await act(async () => { mock.emit('screenshot:new', { id: 99 }) })
    await waitFor(() => expect(cardNames()[0]).toBe('Brand new'))
  })

  it('shows a Missing badge for missing rows', async () => {
    const mock = createMockCommands({ screenshots: [{ status: 'missing', label: 'lost' }] })
    render(<CommandsProvider commands={mock.commands}><Library /></CommandsProvider>)
    await screen.findByText('Missing')
  })

  it('switches to the settings view when the tray asks for it', async () => {
    const mock = createMockCommands()
    render(<CommandsProvider commands={mock.commands}><Library settings={<div>SETTINGS PANE</div>} /></CommandsProvider>)
    await screen.findAllByTestId('card')
    await act(async () => { mock.emit('library:view', { view: 'settings' }) })
    expect(screen.getByText('SETTINGS PANE')).toBeInTheDocument()
  })

  it('pages through large libraries with Load more', async () => {
    const many = Array.from({ length: 450 }, (_, i) => ({
      path: `C:\\S\\s${i}.png`,
      original_name: `s${i}.png`,
      captured_at: `2026-01-01T${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`,
    }))
    const mock = createMockCommands({ screenshots: many })
    render(<CommandsProvider commands={mock.commands}><Library /></CommandsProvider>)
    await waitFor(() => expect(screen.getAllByTestId('card')).toHaveLength(200))
    expect(screen.getByText(/Showing 200/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByTestId('card')).toHaveLength(400))
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByTestId('card')).toHaveLength(450))
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
    expect(screen.getByText(/Showing 450 \(all\)/)).toBeInTheDocument()
  })

  it('tells you how many results a search produced', async () => {
    await setup()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sync' } })
    await screen.findByText(/1 result for “sync”/)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
    await screen.findByText(/Showing 3 \(all\)/)
  })

  it('the side panel can be closed with its button or Escape', async () => {
    const mock = createMockCommands()
    render(
      <CommandsProvider commands={mock.commands}>
        <Library sidePanel={(id, _onChanged, onClose) => (id == null ? <div>PANEL CLOSED</div> : <button onClick={onClose}>close panel</button>)} />
      </CommandsProvider>,
    )
    const cards = await screen.findAllByTestId('card')
    fireEvent.click(cards[0])
    expect(cards[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'close panel' }))
    expect(screen.getByText('PANEL CLOSED')).toBeInTheDocument()
    fireEvent.click(cards[1])
    expect(cards[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByText('PANEL CLOSED')).toBeInTheDocument()
  })

  it('shows the empty state when nothing matches', async () => {
    await setup()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz' } })
    await screen.findByText(/No screenshots match/)
  })
})
