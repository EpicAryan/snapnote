import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CommandsProvider } from '../../lib/CommandsContext'
import { createMockCommands } from '../../lib/commands.mock'
import { Popup } from './Popup'

/** `prepare` runs before the popup opens, e.g. to add destinations the popup should list. */
async function openFor(id: number, prepare?: (mock: ReturnType<typeof createMockCommands>) => Promise<void>) {
  const mock = createMockCommands()
  if (prepare) await prepare(mock)
  render(
    <CommandsProvider commands={mock.commands}>
      <Popup />
    </CommandsProvider>,
  )
  await act(async () => { mock.emit('popup:open', { id }) })
  await screen.findByLabelText('Label')
  return mock
}

describe('Popup', () => {
  it('shows the screenshot, focuses Label, and defaults destination to Default', async () => {
    await openFor(1)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'mock://thumb/1')
    expect(screen.getByLabelText('Label')).toHaveFocus()
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('1')
  })

  it('Enter in Label saves label and notes and asks to hide after the result', async () => {
    const mock = await openFor(1)
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Invoice Timeout' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'DB timeout' } })
    fireEvent.keyDown(screen.getByLabelText('Label'), { key: 'Enter' })
    await screen.findByText(/Saved · renamed/)
    expect(mock.state.screenshots[0]).toMatchObject({ label: 'Invoice Timeout', notes: 'DB timeout' })
    await waitFor(() => expect(mock.calls).toContainEqual(['hidePopup']), { timeout: 3000 })
  })

  it('Ctrl+Enter inside Notes saves; plain Enter in Notes does not', async () => {
    const mock = await openFor(1)
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'line' } })
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Enter' })
    expect(mock.state.screenshots[0].notes).toBe('')
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(mock.state.screenshots[0].notes).toBe('line'))
  })

  it('Escape hides without saving', async () => {
    const mock = await openFor(1)
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'typed' } })
    fireEvent.keyDown(screen.getByLabelText('Label'), { key: 'Escape' })
    expect(mock.calls).toEqual([['hidePopup']])
    expect(mock.state.screenshots[0].label).toBe('')
  })

  it('choosing a destination moves the file and reports it', async () => {
    let embeeId = 0
    await openFor(1, async (m) => { embeeId = (await m.commands.createDestination('Embee', 'D:\\Work\\Embee')).id })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: String(embeeId) } })
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'sync' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/Saved · moved to Embee · renamed/)
  })

  it('Browse picks a folder and saves there, adding a destination', async () => {
    const mock = await openFor(1)
    mock.setPickFolderResult('D:\\ClientX')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__browse' } })
    await waitFor(() => expect((screen.getByRole('combobox') as HTMLSelectElement).selectedOptions[0].text).toBe('D:\\ClientX'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/Saved · moved to ClientX/)
    expect(mock.state.destinations.map((d) => d.name)).toContain('ClientX')
  })

  it('missing destination folder offers Create or Use Default', async () => {
    let goneId = 0
    const mock = await openFor(1, async (m) => { goneId = (await m.commands.createDestination('Gone', 'D:\\NotThere')).id })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: String(goneId) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/doesn't exist/)
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }))
    await screen.findByText(/Saved · moved to Gone/)
    expect(mock.state.folders.has('D:\\NotThere')).toBe(true)
  })

  it('shows a warning when the backend could not move the file', async () => {
    let lockedId = 0
    await openFor(1, async (m) => {
      m.commands.folderExists = async () => true // bypass the prompt so the backend fails instead
      lockedId = (await m.commands.createDestination('Locked', 'D:\\Locked')).id
    })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: String(lockedId) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/couldn't be moved/)
  })

  it('a popup:open for an unknown id hides itself', async () => {
    const mock = createMockCommands()
    render(<CommandsProvider commands={mock.commands}><Popup /></CommandsProvider>)
    await act(async () => { mock.emit('popup:open', { id: 999 }) })
    await waitFor(() => expect(mock.calls).toEqual([['hidePopup']]))
  })
})
