import { describe, expect, it } from 'vitest'
import { MockWeChatBridge } from './MockWeChatBridge.ts'
import { createSeedSession } from './seed.ts'

describe('MockWeChatBridge', () => {
  it('inserts into the composer and sends a new agent message', async () => {
    const bridge = new MockWeChatBridge(createSeedSession())
    await bridge.insertText('先插入这段')
    expect(bridge.getSnapshot().composerText).toBe('先插入这段')
    expect(bridge.getDraftEcho()?.text).toBe('先插入这段')

    const before = (await bridge.getActiveSession()).messages.length
    await bridge.sendText('直接发出去')
    const session = await bridge.getActiveSession()
    expect(session.messages).toHaveLength(before + 1)
    expect(session.messages.at(-1)?.role).toBe('agent')
    expect(session.messages.at(-1)?.text).toBe('直接发出去')
    expect(session.composerText).toBe('')
    expect(bridge.getDraftEcho()).toBeNull()
    expect(bridge.getLastSentId()).toBe(session.messages.at(-1)?.id)
  })

  it('ignores blank sends and keeps the session clone isolated', async () => {
    const bridge = new MockWeChatBridge(createSeedSession())
    await bridge.sendText('   ')
    const session = await bridge.getActiveSession()
    session.composerText = 'mutated'
    expect(bridge.getSnapshot().composerText).toBe('')
    expect(bridge.getSnapshot().messages).toHaveLength(5)
  })
})
