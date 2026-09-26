import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommandsProvider } from '../../lib/CommandsContext'
import { createMockCommands } from '../../lib/commands.mock'
import { Library, type PanelContext } from './Library'

type Mock = ReturnType<typeof createMockCommands>
type Panel = (id: number, ctx: PanelContext) => ReactNode

function renderLib(mock: Mock, sidePanel?: Panel, settings?: ReactNode) {
  return render(<CommandsProvider commands={mock.commands}><Library sidePanel={sidePanel} settings={settings} /></CommandsProvider>)
}

async function setup(sidePanel?: Panel) {
  const mock = createMockCommands()
  const embee = await mock.commands.createDestination('Embee', 'D:\\Work\\Embee')
  await mock.commands.saveMetadata(1, 'Invoice timeout', 'DB timeout while syncing', [], { kind: 'existing', id: embee.id })
  await mock.commands.saveMetadata(2, 'Login page bug', '', [], { kind: 'existing', id: 1 })
  renderLib(mock, sidePanel)
  await screen.findAllByTestId('card')
  return { mock, embee }
}

const cards = () => screen.getAllByTestId('card')
const cardNames = () => cards().map((c) => within(c).getByTestId('card-title').textContent)
const selectedNames = () => cards().filter((c) => c.getAttribute('aria-selected') === 'true').map((c) => within(c).getByTestId('card-title').textContent)
const selectedName = () => selectedNames()[0]
const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document.body, { key: k, ...init })
const sidebar = () => screen.getByRole('navigation', { name: 'Filters' })

afterEach(() => vi.useRealTimers())

describe('Library', () => {
  it('lists all screenshots newest first with label or filename, destination and date', async () => {
    await setup()
    expect(cardNames()).toEqual(['Invoice timeout', 'Login page bug', 'Screenshot 2026-09-25 120602.png'])
    const first = cards()[0]
    expect(within(first).getByText('Embee')).toBeInTheDocument()
    expect(within(first).getByText('26 Sep 2026')).toBeInTheDocument()
    expect(within(first).getByText('DB timeout while syncing')).toBeInTheDocument()
    expect(await within(first).findByRole('img')).toHaveAttribute('src', 'mock://thumb/1')
  })

  it('search narrows results after the debounce, including by tag', async () => {
    const { mock } = await setup()
    await mock.commands.addTags([3], ['receipt'])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sync' } })
    await waitFor(() => expect(cardNames()).toEqual(['Invoice timeout']))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'rece' } })
    await waitFor(() => expect(cardNames()).toEqual(['Screenshot 2026-09-25 120602.png']))
  })

  it('the sidebar filters by folder, unlabeled and tag, and shows counts', async () => {
    const { mock } = await setup()
    await act(async () => { await mock.commands.addTags([1, 2], ['urgent']) })
    await within(sidebar()).findByRole('button', { name: '#urgent, 2' })
    expect(within(sidebar()).getByRole('button', { name: 'All screenshots, 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sidebar()).getByRole('button', { name: 'Embee, 1' })).toBeInTheDocument()
    fireEvent.click(within(sidebar()).getByRole('button', { name: /^Embee/ }))
    await waitFor(() => expect(cardNames()).toEqual(['Invoice timeout']))
    fireEvent.click(within(sidebar()).getByRole('button', { name: /^Unlabeled/ }))
    await waitFor(() => expect(cardNames()).toEqual(['Screenshot 2026-09-25 120602.png']))
    fireEvent.click(within(sidebar()).getByRole('button', { name: /^All screenshots/ }))
    fireEvent.click(within(sidebar()).getByRole('button', { name: /^#urgent/ }))
    await waitFor(() => expect(cardNames()).toEqual(['Invoice timeout', 'Login page bug']))
    expect(within(cards()[0]).getByText('#urgent')).toBeInTheDocument()
    fireEvent.click(within(sidebar()).getByRole('button', { name: /^#urgent/ }))
    await waitFor(() => expect(cardNames()).toHaveLength(3))
  })

  it('Manage in the sidebar opens settings', async () => {
    const mock = createMockCommands()
    renderLib(mock, undefined, <div>SETTINGS PANE</div>)
    await screen.findAllByTestId('card')
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Manage' }))
    expect(screen.getByText('SETTINGS PANE')).toBeInTheDocument()
  })

  it('sort toggles to oldest first', async () => {
    await setup()
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'oldest' } })
    await waitFor(() => expect(cardNames()[0]).toBe('Screenshot 2026-09-25 120602.png'))
  })

  it('keyboard: arrows move selection, Enter opens the file, / focuses search', async () => {
    const { mock } = await setup()
    const grid = screen.getByTestId('grid')
    fireEvent.click(cards()[0])
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect(cards()[1]).toHaveAttribute('aria-selected', 'true')
    expect(cards()[0]).toHaveAttribute('aria-selected', 'false')
    fireEvent.keyDown(grid, { key: 'Enter' })
    await waitFor(() => expect(mock.calls).toContainEqual(['openFile', 2]))
    fireEvent.keyDown(document.body, { key: '/' })
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('keyboard works without clicking first, and Home/End jump to the ends', async () => {
    await setup()
    expect(screen.getByTestId('grid')).toHaveFocus()
    key('ArrowRight')
    expect(selectedName()).toBe('Invoice timeout')
    key('End')
    expect(selectedName()).toBe('Screenshot 2026-09-25 120602.png')
    key('Home')
    expect(selectedName()).toBe('Invoice timeout')
    key('ArrowLeft')
    expect(selectedName()).toBe('Invoice timeout')
  })

  it('ArrowDown and ArrowUp move by one row of the real layout', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ path: `C:\\S\\s${i}.png`, original_name: `s${i}.png`, captured_at: `2026-01-01T00:${String(10 + i)}:00` }))
    const mock = createMockCommands({ screenshots: many })
    // jsdom has no layout: pretend the grid wraps every three cards.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        if (!this.hasAttribute('data-card') || !this.parentElement) return 0
        return Math.floor(Array.from(this.parentElement.children).indexOf(this) / 3) * 100
      },
    })
    try {
      renderLib(mock)
      await screen.findAllByTestId('card')
      fireEvent.click(cards()[0])
      key('ArrowDown')
      expect(cards()[3]).toHaveAttribute('aria-selected', 'true')
      key('ArrowDown')
      expect(cards()[6]).toHaveAttribute('aria-selected', 'true')
      key('ArrowUp')
      expect(cards()[3]).toHaveAttribute('aria-selected', 'true')
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'offsetTop', original)
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetTop
    }
  })

  it('Ctrl+click toggles, Shift+click ranges, Ctrl+A selects all, Escape clears', async () => {
    await setup()
    fireEvent.click(cards()[0])
    fireEvent.click(cards()[2], { ctrlKey: true })
    expect(selectedNames()).toEqual(['Invoice timeout', 'Screenshot 2026-09-25 120602.png'])
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.click(cards()[1], { shiftKey: true })
    expect(selectedNames()).toEqual(['Login page bug', 'Screenshot 2026-09-25 120602.png'])
    fireEvent.click(cards()[2], { ctrlKey: true })
    expect(selectedNames()).toEqual(['Login page bug'])
    key('a', { ctrlKey: true })
    expect(selectedNames()).toHaveLength(3)
    expect(screen.getByText('3 selected')).toBeInTheDocument()
    key('Escape')
    expect(selectedNames()).toHaveLength(0)
    expect(screen.queryByText(/selected$/)).toBeNull()
  })

  it('Shift+arrows extend the selection from the anchor; Ctrl+Space toggles the cursor card', async () => {
    await setup()
    fireEvent.click(cards()[0])
    key('ArrowRight', { shiftKey: true })
    key('ArrowRight', { shiftKey: true })
    expect(selectedNames()).toHaveLength(3)
    key('ArrowLeft', { shiftKey: true })
    expect(selectedNames()).toEqual(['Invoice timeout', 'Login page bug'])
    key(' ', { ctrlKey: true })
    expect(selectedNames()).toEqual(['Invoice timeout'])
  })

  it('refreshes when a screenshot:new event arrives', async () => {
    const { mock } = await setup()
    mock.state.screenshots.push({ ...mock.state.screenshots[0], id: 99, label: 'Brand new', captured_at: '2026-09-27T00:00:00', path: 'C:\\x\\new.png', original_name: 'new.png' })
    await act(async () => { mock.emit('screenshot:new', { id: 99 }) })
    await waitFor(() => expect(cardNames()[0]).toBe('Brand new'))
  })

  it('shows a Missing badge for missing rows', async () => {
    const mock = createMockCommands({ screenshots: [{ status: 'missing', label: 'lost' }] })
    renderLib(mock)
    await screen.findByText('Missing')
  })

  it('switches to the settings view when the tray asks for it', async () => {
    const mock = createMockCommands()
    renderLib(mock, undefined, <div>SETTINGS PANE</div>)
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
    renderLib(mock)
    await waitFor(() => expect(cards()).toHaveLength(200))
    expect(screen.getByText(/Showing 200/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(cards()).toHaveLength(400))
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(cards()).toHaveLength(450))
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

  it('shows the details pane only while one card is selected; its button and Escape close it', async () => {
    await setup((id, ctx) => <div>PANEL {id}<button onClick={ctx.onClose}>close panel</button></div>)
    expect(screen.queryByText(/PANEL/)).toBeNull()
    fireEvent.click(cards()[0])
    expect(screen.getByText(/PANEL 1/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'close panel' }))
    expect(screen.queryByText(/PANEL/)).toBeNull()
    expect(cards()[0]).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('grid')).toHaveFocus()
    fireEvent.click(cards()[1])
    expect(screen.getByText(/PANEL 2/)).toBeInTheDocument()
    fireEvent.click(cards()[2], { ctrlKey: true })
    expect(screen.queryByText(/PANEL/)).toBeNull()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    key('Escape')
    expect(screen.queryByText('2 selected')).toBeNull()
  })

  it('Delete asks for confirmation, sends the file to the Recycle Bin, selects the next card and offers Undo', async () => {
    const { mock } = await setup()
    fireEvent.click(cards()[0])
    fireEvent.keyDown(screen.getByTestId('grid'), { key: 'Delete' })
    await waitFor(() => expect(mock.calls).toContainEqual(['confirm', expect.stringContaining('Recycle Bin')]))
    await waitFor(() => expect(mock.calls).toContainEqual(['deleteScreenshots', [1]]))
    await waitFor(() => expect(cardNames()).toEqual(['Login page bug', 'Screenshot 2026-09-25 120602.png']))
    expect(selectedName()).toBe('Login page bug')
    await screen.findByText(/Moved 1 screenshot to the Recycle Bin/)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(mock.calls).toContainEqual(['undoDelete', 1]))
    await waitFor(() => expect(cardNames()).toHaveLength(3))
    await screen.findByText(/Restored 1 screenshot/)
    expect(selectedName()).toBe('Invoice timeout')
  })

  it('deleting a multi-selection asks once with the count and Undo brings all of them back', async () => {
    const { mock } = await setup()
    fireEvent.click(cards()[0])
    fireEvent.click(cards()[1], { ctrlKey: true })
    key('Delete')
    await waitFor(() => expect(mock.calls).toContainEqual(['confirm', 'Move 2 screenshots to the Recycle Bin, and remove them from the library?']))
    await waitFor(() => expect(mock.calls).toContainEqual(['deleteScreenshots', [1, 2]]))
    await waitFor(() => expect(cardNames()).toEqual(['Screenshot 2026-09-25 120602.png']))
    expect(selectedName()).toBe('Screenshot 2026-09-25 120602.png')
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(cardNames()).toHaveLength(3))
    await screen.findByText(/Restored 2 screenshots/)
    expect(mock.state.trash).toHaveLength(0)
  })

  it('a declined confirmation deletes nothing', async () => {
    const { mock } = await setup()
    mock.setConfirmResult(false)
    fireEvent.click(cards()[0])
    key('Delete')
    await waitFor(() => expect(mock.calls).toContainEqual(['confirm', expect.any(String)]))
    expect(mock.calls).not.toContainEqual(['deleteScreenshots', [1]])
    expect(cardNames()).toHaveLength(3)
  })

  it('Delete on a missing card only forgets the entry', async () => {
    const mock = createMockCommands({ screenshots: [{ status: 'missing', label: 'lost' }] })
    renderLib(mock)
    fireEvent.click((await screen.findAllByTestId('card'))[0])
    key('Delete')
    await waitFor(() => expect(mock.calls).toContainEqual(['confirm', expect.stringContaining('already gone')]))
    await waitFor(() => expect(mock.state.screenshots).toHaveLength(0))
    await screen.findByText(/removed 1 missing entry/)
  })

  it('Ctrl+C copies the selection as files and says so', async () => {
    const { mock } = await setup()
    fireEvent.click(cards()[1])
    key('c', { ctrlKey: true })
    await waitFor(() => expect(mock.calls).toContainEqual(['copyScreenshots', [2]]))
    await screen.findByText(/Copied\. Paste it/)
    fireEvent.click(cards()[2], { ctrlKey: true })
    key('c', { ctrlKey: true })
    await waitFor(() => expect(mock.calls).toContainEqual(['copyScreenshots', [2, 3]]))
    await screen.findByText(/Copied 2 files/)
  })

  it('the multi panel moves the selection to a folder and adds tags', async () => {
    const { mock, embee } = await setup()
    fireEvent.click(cards()[1])
    fireEvent.click(cards()[2], { ctrlKey: true })
    const panel = screen.getByText('2 selected').closest('aside')!
    fireEvent.change(within(panel).getByLabelText('Move to'), { target: { value: String(embee.id) } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(mock.calls).toContainEqual(['moveScreenshots', [2, 3], { kind: 'existing', id: embee.id }]))
    await screen.findByText(/Moved 2 to Embee/)
    await waitFor(() => expect(within(cards()[1]).getByText('Embee')).toBeInTheDocument())
    const tagInput = within(panel).getByLabelText('Tags to add')
    fireEvent.change(tagInput, { target: { value: 'Client X' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(mock.calls).toContainEqual(['addTags', [2, 3], ['client-x']]))
    await waitFor(() => expect(within(cards()[1]).getByText('#client-x')).toBeInTheDocument())
    await screen.findByText(/Tagged 2 screenshots/)
  })

  it('Ctrl+V and the Paste button save a clipboard image into the Screenshots folder', async () => {
    const { mock } = await setup()
    key('v', { ctrlKey: true })
    await waitFor(() => expect(mock.calls).toContainEqual(['pasteClipboard']))
    await screen.findByText(/Added Screenshot 2026-09-26 120000.png/)
    await waitFor(() => expect(cardNames()).toContain('Screenshot 2026-09-26 120000.png'))
    mock.setClipboard({})
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
    await screen.findByText(/Nothing to paste/)
  })

  it('pasting files copied in Explorer adds the images and reports what was skipped', async () => {
    const { mock } = await setup()
    mock.setClipboard({ files: ['D:\\Pics\\holiday.jpg', 'D:\\Pics\\notes.txt'] })
    key('v', { ctrlKey: true })
    await screen.findByText('Added holiday.png · skipped notes.txt (not an image)')
    await waitFor(() => expect(cardNames()).toContain('holiday.png'))
  })

  it('pasting a file that is already in the library selects it', async () => {
    const { mock } = await setup()
    mock.setClipboard({ files: [mock.state.screenshots[2].path] })
    key('v', { ctrlKey: true })
    await screen.findByText('1 already in the library')
    expect(cards()[2]).toHaveAttribute('aria-selected', 'true')
  })

  it('files dropped from Explorer are added, with an overlay while dragging', async () => {
    const { mock } = await setup()
    await act(async () => { mock.emit('files:drag', { active: true }) })
    expect(screen.getByText(/Drop images/)).toBeInTheDocument()
    await act(async () => { mock.emit('files:drag', { active: false }) })
    expect(screen.queryByText(/Drop images/)).toBeNull()
    await act(async () => { mock.emit('files:drop', { paths: ['D:\\Pics\\a.png', 'D:\\Pics\\b.png'] }) })
    await waitFor(() => expect(mock.calls).toContainEqual(['addFiles', ['D:\\Pics\\a.png', 'D:\\Pics\\b.png']]))
    await screen.findByText('Added 2 images')
  })

  it('right-click opens a menu whose Delete asks and then deletes', async () => {
    const { mock } = await setup()
    fireEvent.contextMenu(cards()[0], { clientX: 40, clientY: 50 })
    const menu = screen.getByRole('menu')
    expect(cards()[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete/ }))
    expect(screen.queryByRole('menu')).toBeNull()
    await waitFor(() => expect(mock.calls).toContainEqual(['confirm', expect.stringContaining('Invoice timeout')]))
    await waitFor(() => expect(mock.calls).toContainEqual(['deleteScreenshots', [1]]))
  })

  it('right-clicking inside a multi-selection offers batch actions', async () => {
    const { mock } = await setup()
    fireEvent.click(cards()[0])
    fireEvent.click(cards()[2], { ctrlKey: true })
    fireEvent.contextMenu(cards()[2])
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /Copy 2 files/ })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete 2/ }))
    await waitFor(() => expect(mock.calls).toContainEqual(['confirm', expect.stringContaining('2 screenshots')]))
    await waitFor(() => expect(mock.calls).toContainEqual(['deleteScreenshots', [1, 3]]))
  })

  it('right-clicking outside the selection switches to that card alone', async () => {
    await setup()
    fireEvent.click(cards()[0])
    fireEvent.click(cards()[1], { ctrlKey: true })
    fireEvent.contextMenu(cards()[2])
    expect(selectedNames()).toEqual(['Screenshot 2026-09-25 120602.png'])
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Preview/ })).toBeInTheDocument()
  })

  it('the ⋯ button on a card opens the same menu; Copy copies', async () => {
    const { mock } = await setup()
    fireEvent.click(within(cards()[1]).getByRole('button', { name: 'More actions' }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^Copy/ }))
    await waitFor(() => expect(mock.calls).toContainEqual(['copyScreenshots', [2]]))
  })

  it('the menu opens from the keyboard and is keyboard driven', async () => {
    const { mock } = await setup()
    fireEvent.click(cards()[0])
    key('F10', { shiftKey: true })
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'End' })
    fireEvent.keyDown(menu, { key: 'Enter' })
    await waitFor(() => expect(mock.calls).toContainEqual(['confirm', expect.stringContaining('Recycle Bin')]))
    key('ContextMenu')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a missing card cannot be previewed, opened or copied from the menu', async () => {
    const mock = createMockCommands({ screenshots: [{ status: 'missing', label: 'lost' }] })
    renderLib(mock)
    fireEvent.contextMenu((await screen.findAllByTestId('card'))[0])
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: /Preview/ })).toBeDisabled()
    expect(within(menu).getByRole('menuitem', { name: /^Open/ })).toBeDisabled()
    expect(within(menu).getByRole('menuitem', { name: /^Copy/ })).toBeDisabled()
    expect(within(menu).getByRole('menuitem', { name: /Remove from library/ })).toBeEnabled()
  })

  it('Space previews the selected card, arrows walk the list, Escape closes', async () => {
    const { mock } = await setup()
    fireEvent.click(cards()[0])
    key(' ')
    const dialog = await screen.findByRole('dialog', { name: 'Preview' })
    expect(within(dialog).getByText('Invoice timeout')).toBeInTheDocument()
    expect(await within(dialog).findByRole('img')).toHaveAttribute('src', expect.stringMatching(/^data:image\/png/))
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(within(screen.getByRole('dialog', { name: 'Preview' })).getByText('Login page bug')).toBeInTheDocument()
    expect(selectedName()).toBe('Login page bug')
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Preview' }), { key: 'Enter' })
    await waitFor(() => expect(mock.calls).toContainEqual(['openFile', 2]))
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Preview' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Preview' })).toBeNull()
    expect(screen.getByTestId('grid')).toHaveFocus()
  })

  it('F2 asks the details pane to edit the label', async () => {
    await setup((id, ctx) => <div>edit:{ctx.editRequest} for {id}</div>)
    fireEvent.click(cards()[1])
    expect(screen.getByText('edit:0 for 2')).toBeInTheDocument()
    key('F2')
    expect(screen.getByText('edit:1 for 2')).toBeInTheDocument()
  })

  it('? opens the shortcut list and Escape closes it', async () => {
    await setup()
    key('?')
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(within(dialog).getByText('Ctrl+V')).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull()
  })

  it('re-checks files on disk every minute', async () => {
    vi.useFakeTimers()
    try {
      const mock = createMockCommands()
      renderLib(mock)
      await act(async () => { await Promise.resolve() })
      expect(mock.calls).not.toContainEqual(['reconcileNow'])
      await act(async () => { vi.advanceTimersByTime(60_000) })
      expect(mock.calls).toContainEqual(['reconcileNow'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the empty state when nothing matches', async () => {
    await setup()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz' } })
    await screen.findByText(/No screenshots match/)
  })
})
