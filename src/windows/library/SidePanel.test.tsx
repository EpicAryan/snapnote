import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommandsProvider } from '../../lib/CommandsContext'
import { createMockCommands } from '../../lib/commands.mock'
import { SidePanel } from './SidePanel'

async function setup(id: number | null, seed?: Parameters<typeof createMockCommands>[0]) {
  const mock = createMockCommands(seed)
  const onChanged = vi.fn()
  const onDelete = vi.fn()
  const onCopy = vi.fn()
  const ui = (i: number | null, editRequest = 0) => (
    <CommandsProvider commands={mock.commands}><SidePanel id={i} onChanged={onChanged} onDelete={onDelete} onCopy={onCopy} editRequest={editRequest} /></CommandsProvider>
  )
  const view = render(ui(id))
  if (id != null) await screen.findByLabelText('Label')
  return { mock, onChanged, onDelete, onCopy, view, ui }
}

describe('SidePanel', () => {
  it('renders nothing when no card is selected', async () => {
    const { view } = await setup(null)
    expect(view.container).toBeEmptyDOMElement()
  })

  it('shows preview, fields, original name, path and date', async () => {
    await setup(1)
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringMatching(/^data:image\/png/))
    expect(screen.getByText('Screenshot 2026-09-26 015747.png')).toBeInTheDocument()
    expect(screen.getByText(/OneDrive\\Pictures\\Screenshots/)).toBeInTheDocument()
    expect(screen.getByText('26 Sep 2026')).toBeInTheDocument()
  })

  it('edits round-trip through saveMetadata and notify the parent', async () => {
    const { mock, onChanged } = await setup(1)
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Edited' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'more' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/Saved · renamed/)
    expect(mock.state.screenshots[0]).toMatchObject({ label: 'Edited', notes: 'more' })
    expect(onChanged).toHaveBeenCalled()
  })

  it('Open and Show in folder call the backend', async () => {
    const { mock } = await setup(2)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show in folder' }))
    await waitFor(() => expect(mock.calls).toEqual([['openFile', 2], ['revealFile', 2]]))
  })

  it('Retry move appears only when a move is pending and clears it', async () => {
    const { mock } = await setup(1, { screenshots: [{ pending_move_to: 1 }] })
    fireEvent.click(screen.getByRole('button', { name: 'Retry move' }))
    await waitFor(() => expect(mock.state.screenshots[0].pending_move_to).toBeNull())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry move' })).toBeNull())
  })

  it('Remove from library needs confirmation, keeps the file and then removes the entry', async () => {
    const { mock, onChanged } = await setup(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove from library' }))
    expect(mock.state.screenshots.find((s) => s.id === 1)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    await waitFor(() => expect(mock.state.screenshots.find((s) => s.id === 1)).toBeUndefined())
    expect(mock.calls).not.toContainEqual(['deleteFile', 1])
    expect(onChanged).toHaveBeenCalled()
  })

  it('Delete and Copy hand off to the library, which confirms and reports', async () => {
    const { onDelete, onCopy } = await setup(1)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('ignores a slow response for a previously selected screenshot', async () => {
    const mock = createMockCommands({ screenshots: [{ label: 'one' }, { label: 'two' }] })
    const original = mock.commands.getScreenshot
    mock.commands.getScreenshot = async (id) => { if (id === 1) await new Promise((r) => setTimeout(r, 80)); return original(id) }
    const ui = (id: number) => <CommandsProvider commands={mock.commands}><SidePanel id={id} onChanged={() => {}} onDelete={() => {}} onCopy={() => {}} /></CommandsProvider>
    const { rerender } = render(ui(1))
    rerender(ui(2))
    await screen.findByLabelText('Label')
    await new Promise((r) => setTimeout(r, 150))
    expect(screen.getByLabelText('Label')).toHaveValue('two')
  })

  it('has a close button that reports back to the parent', async () => {
    const mock = createMockCommands()
    const onClose = vi.fn()
    render(<CommandsProvider commands={mock.commands}><SidePanel id={1} onChanged={() => {}} onClose={onClose} onDelete={() => {}} onCopy={() => {}} /></CommandsProvider>)
    await screen.findByLabelText('Label')
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('an edit request focuses and selects the label input', async () => {
    const { view, ui } = await setup(1)
    expect(screen.getByLabelText('Label')).not.toHaveFocus()
    view.rerender(ui(1, 1))
    await waitFor(() => expect(screen.getByLabelText('Label')).toHaveFocus())
  })

  it('missing rows show the badge, hide Open/Show/Copy, and offer only Remove from library', async () => {
    const { onDelete } = await setup(1, { screenshots: [{ status: 'missing' }] })
    expect(screen.getByText('Missing')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show in folder' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from library' }))
    expect(onDelete).toHaveBeenCalled()
  })
})

describe('SidePanel tags', () => {
  it('tags round-trip through saveMetadata and suggestions can be clicked', async () => {
    const mock = createMockCommands()
    render(<CommandsProvider commands={mock.commands}><SidePanel id={1} onChanged={() => {}} onDelete={() => {}} onCopy={() => {}} tagSuggestions={['urgent']} /></CommandsProvider>)
    await screen.findByLabelText('Label')
    const input = screen.getByLabelText('Tags')
    fireEvent.change(input, { target: { value: 'Client X, invoice' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Remove tag client-x' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag invoice' }))
    fireEvent.click(screen.getByRole('button', { name: '+ urgent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mock.state.screenshots[0].tags).toEqual(['client-x', 'urgent']))
  })
})
