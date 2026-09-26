import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommandsProvider } from '../../lib/CommandsContext'
import { createMockCommands } from '../../lib/commands.mock'
import { SidePanel } from './SidePanel'

async function setup(id: number | null, seed?: Parameters<typeof createMockCommands>[0]) {
  const mock = createMockCommands(seed)
  const onChanged = vi.fn()
  render(<CommandsProvider commands={mock.commands}><SidePanel id={id} onChanged={onChanged} /></CommandsProvider>)
  if (id != null) await screen.findByLabelText('Label')
  return { mock, onChanged }
}

describe('SidePanel', () => {
  it('shows a hint when nothing is selected', async () => {
    await setup(null)
    expect(screen.getByText(/Select a screenshot/)).toBeInTheDocument()
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

  it('Open and Reveal call the backend', async () => {
    const { mock } = await setup(2)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reveal in Explorer' }))
    await waitFor(() => expect(mock.calls).toEqual([['openFile', 2], ['revealFile', 2]]))
  })

  it('Retry move appears only when a move is pending and clears it', async () => {
    const { mock } = await setup(1, { screenshots: [{ pending_move_to: 1 }] })
    fireEvent.click(screen.getByRole('button', { name: 'Retry move' }))
    await waitFor(() => expect(mock.state.screenshots[0].pending_move_to).toBeNull())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry move' })).toBeNull())
  })

  it('Remove from library needs confirmation and then removes', async () => {
    const { mock, onChanged } = await setup(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove from library' }))
    expect(mock.state.screenshots.find((s) => s.id === 1)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    await waitFor(() => expect(mock.state.screenshots.find((s) => s.id === 1)).toBeUndefined())
    expect(onChanged).toHaveBeenCalled()
  })

  it('Delete file needs confirmation and calls deleteFile', async () => {
    const { mock } = await setup(1)
    fireEvent.click(screen.getByRole('button', { name: 'Delete file' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(mock.calls).toContainEqual(['deleteFile', 1]))
  })

  it('ignores a slow response for a previously selected screenshot', async () => {
    const mock = createMockCommands({ screenshots: [{ label: 'one' }, { label: 'two' }] })
    const original = mock.commands.getScreenshot
    mock.commands.getScreenshot = async (id) => { if (id === 1) await new Promise((r) => setTimeout(r, 80)); return original(id) }
    const { rerender } = render(<CommandsProvider commands={mock.commands}><SidePanel id={1} onChanged={() => {}} /></CommandsProvider>)
    rerender(<CommandsProvider commands={mock.commands}><SidePanel id={2} onChanged={() => {}} /></CommandsProvider>)
    await screen.findByLabelText('Label')
    await new Promise((r) => setTimeout(r, 150))
    expect(screen.getByLabelText('Label')).toHaveValue('two')
  })

  it('has a close button that reports back to the parent', async () => {
    const mock = createMockCommands()
    const onClose = vi.fn()
    render(<CommandsProvider commands={mock.commands}><SidePanel id={1} onChanged={() => {}} onClose={onClose} /></CommandsProvider>)
    await screen.findByLabelText('Label')
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Copy image puts the screenshot on the clipboard', async () => {
    const { mock } = await setup(2)
    fireEvent.click(screen.getByRole('button', { name: 'Copy image' }))
    await waitFor(() => expect(mock.calls).toContainEqual(['copyImage', 2]))
    await screen.findByText(/Copied/)
  })

  it('missing rows show the badge and hide Open/Reveal/Delete file', async () => {
    await setup(1, { screenshots: [{ status: 'missing' }] })
    expect(screen.getByText('Missing')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete file' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy image' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove from library' })).toBeInTheDocument()
  })
})
