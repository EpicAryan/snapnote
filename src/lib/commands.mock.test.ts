import { describe, expect, it } from 'vitest'
import { createMockCommands } from './commands.mock'

describe('mock commands', () => {
  it('seeds a Default destination and lists screenshots newest first', async () => {
    const { commands } = createMockCommands()
    const dests = await commands.listDestinations()
    expect(dests[0]).toMatchObject({ name: 'Default', is_default: true })
    const cards = await commands.listScreenshots({})
    expect(cards.map((c) => c.original_name)).toEqual(['Screenshot 2026-09-26 015747.png', 'Screenshot 2026-09-25 155014.png', 'Screenshot 2026-09-25 120602.png'])
  })

  it('saveMetadata renames, moves, and is visible in list and search', async () => {
    const { commands } = createMockCommands()
    const embee = await commands.createDestination('Embee', 'D:\\Work\\Embee')
    const [first] = await commands.listScreenshots({})
    const r = await commands.saveMetadata(first.id, 'Invoice Timeout', 'notes', { kind: 'existing', id: embee.id })
    expect(r).toMatchObject({ moved: true, renamed: true, path: 'D:\\Work\\Embee\\2026-09-26 invoice-timeout.png' })
    expect((await commands.listScreenshots({ q: 'inv' })).map((c) => c.id)).toEqual([first.id])
    expect((await commands.listScreenshots({ destination_id: embee.id })).length).toBe(1)
    expect((await commands.listScreenshots({ unlabeled_only: true })).length).toBe(2)
  })

  it('browse choice creates a destination named after the folder', async () => {
    const { commands } = createMockCommands()
    const [first] = await commands.listScreenshots({})
    const r = await commands.saveMetadata(first.id, '', '', { kind: 'browse', path: 'D:\\ClientX' })
    expect(r.destination.name).toBe('ClientX')
    expect((await commands.listDestinations()).length).toBe(2)
  })

  it('emit delivers to subscribed handlers and unlisten stops it', async () => {
    const { commands, emit } = createMockCommands()
    const seen: number[] = []
    const un = await commands.on('toast:show', (p) => seen.push(p.id))
    emit('toast:show', { id: 7 })
    un()
    emit('toast:show', { id: 8 })
    expect(seen).toEqual([7])
  })

  it('records window calls for assertions', async () => {
    const { commands, calls } = createMockCommands()
    await commands.hideToast()
    await commands.openPopupFor(3)
    expect(calls).toEqual([['hideToast'], ['openPopupFor', 3]])
  })

  it('confirm and paste follow the test knobs', async () => {
    const mock = createMockCommands()
    expect(await mock.commands.confirm('sure?')).toBe(true)
    mock.setConfirmResult(false)
    expect(await mock.commands.confirm('sure?')).toBe(false)
    expect(await mock.commands.pasteClipboardImage()).toMatch(/Screenshot .*\.png$/)
    mock.setClipboardHasImage(false)
    await expect(mock.commands.pasteClipboardImage()).rejects.toMatchObject({ code: 'InvalidInput' })
    await mock.commands.copyImage(2)
    expect(mock.calls).toContainEqual(['copyImage', 2])
    expect(await mock.commands.reconcileNow()).toBe(0)
  })

  it('setSetting validates like the backend', async () => {
    const { commands } = createMockCommands()
    await expect(commands.setSetting('toast_seconds', 'abc')).rejects.toMatchObject({ code: 'InvalidInput' })
    await commands.setSetting('toast_seconds', '12')
    expect((await commands.getSettings()).toast_seconds).toBe(12)
  })
})
