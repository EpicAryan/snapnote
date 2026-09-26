import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CommandsProvider } from '../../../lib/CommandsContext'
import { createMockCommands } from '../../../lib/commands.mock'
import { SettingsScreen } from './SettingsScreen'

async function setup(seed?: Parameters<typeof createMockCommands>[0]) {
  const mock = createMockCommands(seed)
  render(<CommandsProvider commands={mock.commands}><SettingsScreen /></CommandsProvider>)
  await screen.findByText('Watch folder')
  return mock
}

describe('SettingsScreen', () => {
  it('shows the detected watch folder and allows override and reset', async () => {
    const mock = await setup()
    expect(await screen.findByText(/OneDrive\\Pictures\\Screenshots/)).toBeInTheDocument()
    mock.setPickFolderResult('E:\\Shots')
    fireEvent.click(screen.getByRole('button', { name: 'Change…' }))
    await waitFor(() => expect(mock.state.settings.watch_folder_override).toBe('E:\\Shots'))
    fireEvent.click(await screen.findByRole('button', { name: 'Reset to detected' }))
    await waitFor(() => expect(mock.state.settings.watch_folder_override).toBe(''))
  })

  it('adds, edits, reorders and deletes destinations', async () => {
    const mock = await setup()
    const section = screen.getByTestId('destinations')
    fireEvent.change(within(section).getByLabelText('Name'), { target: { value: 'Embee' } })
    mock.setPickFolderResult('D:\\Work\\Embee')
    fireEvent.click(within(section).getByRole('button', { name: 'Pick folder' }))
    await within(section).findByText('D:\\Work\\Embee')
    fireEvent.click(within(section).getByRole('button', { name: 'Add destination' }))
    await within(section).findByText('Embee')

    fireEvent.change(within(section).getByLabelText('Name'), { target: { value: 'ClientX' } })
    mock.setPickFolderResult('D:\\ClientX')
    fireEvent.click(within(section).getByRole('button', { name: 'Pick folder' }))
    await within(section).findByText('D:\\ClientX')
    fireEvent.click(within(section).getByRole('button', { name: 'Add destination' }))
    await within(section).findByText('ClientX')

    const rows = () => within(section).getAllByTestId('dest-row').map((r) => within(r).getByTestId('dest-name').textContent)
    expect(rows()).toEqual(['Embee', 'ClientX'])
    fireEvent.click(within(within(section).getAllByTestId('dest-row')[1]).getByRole('button', { name: 'Move up' }))
    await waitFor(() => expect(rows()).toEqual(['ClientX', 'Embee']))

    fireEvent.click(within(within(section).getAllByTestId('dest-row')[0]).getByRole('button', { name: 'Rename' }))
    fireEvent.change(within(section).getByLabelText('New name'), { target: { value: 'Client X' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(rows()).toEqual(['Client X', 'Embee']))

    fireEvent.click(within(within(section).getAllByTestId('dest-row')[0]).getByRole('button', { name: 'Delete' }))
    fireEvent.click(within(section).getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(rows()).toEqual(['Embee']))
  })

  it('rejects a destination inside the watch folder with the backend message', async () => {
    const mock = await setup()
    const section = screen.getByTestId('destinations')
    fireEvent.change(within(section).getByLabelText('Name'), { target: { value: 'Bad' } })
    mock.setPickFolderResult('C:\\Users\\me\\OneDrive\\Pictures\\Screenshots\\sub')
    fireEvent.click(within(section).getByRole('button', { name: 'Pick folder' }))
    await within(section).findByText(/Screenshots\\sub/)
    fireEvent.click(within(section).getByRole('button', { name: 'Add destination' }))
    await within(section).findByText(/cannot be the Screenshots folder/)
  })

  it('hotkey, toast seconds, rename and autostart persist with validation', async () => {
    const mock = await setup()
    const hot = screen.getByLabelText('Label hotkey')
    fireEvent.change(hot, { target: { value: 'L' } })
    fireEvent.blur(hot)
    expect(screen.getByText(/needs a modifier/)).toBeInTheDocument()
    expect(mock.state.settings.label_hotkey).toBe('Ctrl+Shift+L')
    fireEvent.change(hot, { target: { value: 'ctrl+alt+l' } })
    fireEvent.blur(hot)
    await waitFor(() => expect(mock.state.settings.label_hotkey).toBe('Ctrl+Alt+L'))

    const secs = screen.getByLabelText('Toast seconds')
    fireEvent.change(secs, { target: { value: '12' } })
    fireEvent.blur(secs)
    await waitFor(() => expect(mock.state.settings.toast_seconds).toBe(12))

    fireEvent.click(screen.getByLabelText('Rename file when labeled'))
    await waitFor(() => expect(mock.state.settings.rename_on_label).toBe(false))
    fireEvent.click(screen.getByLabelText('Start with Windows'))
    await waitFor(() => expect(mock.state.settings.autostart).toBe(false))
  })

  it('shows hotkey registration errors from the backend', async () => {
    const mock = await setup()
    await act(async () => { mock.emit('hotkey:error', { message: 'Ctrl+Alt+L is already in use' }) })
    expect(screen.getByText(/already in use/)).toBeInTheDocument()
  })

  it('import runs with progress and reports the result', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Import existing screenshots' }))
    await screen.findByText(/Imported 2, skipped 0/)
  })

  it('clear cache and open data folder call the backend', async () => {
    const mock = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Clear thumbnail cache' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open data folder' }))
    await waitFor(() => expect(mock.calls).toEqual(expect.arrayContaining([['clearThumbnailCache'], ['openDataFolder']])))
  })
})
