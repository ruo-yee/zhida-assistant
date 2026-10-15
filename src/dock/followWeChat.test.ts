import { describe, expect, it } from 'vitest'
import { followWeChatVisibility } from './followWeChat.ts'

describe('followWeChatVisibility', () => {
  it('shows the assistant when WeChat has a window and hides it after WeChat goes away', () => {
    expect(followWeChatVisibility({ seen: false, visible: false, hasBounds: true, reason: 'ok' })).toEqual({
      seen: true,
      show: true,
      hide: false,
    })
    expect(followWeChatVisibility({ seen: false, visible: true, hasBounds: false, reason: 'hidden' })).toEqual({
      seen: false,
      show: false,
      hide: true,
    })
    expect(followWeChatVisibility({ seen: true, visible: false, hasBounds: false, reason: 'hidden' })).toMatchObject({
      hide: false,
      show: false,
    })
    expect(followWeChatVisibility({ seen: true, visible: true, hasBounds: false, reason: 'permission' })).toMatchObject({
      hide: false,
    })
    expect(followWeChatVisibility({ seen: false, visible: true, hasBounds: false, reason: 'not-running' })).toMatchObject({
      hide: false,
      seen: false,
    })
  })
})
