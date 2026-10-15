import { describe, expect, it } from 'vitest'
import {
  isComposerIdentifier,
  pickComposer,
  shouldExpandForComposer,
  type ComposerShape,
  type ComposerWindow,
} from './axComposer.ts'

function shape(partial: Partial<ComposerShape> & Pick<ComposerShape, 'role'>): ComposerShape {
  return {
    identifier: '',
    title: '',
    width: 0,
    height: 0,
    ...partial,
  }
}

const chat: ComposerWindow = { x: 100, y: 80, width: 900, height: 700 }

describe('pickComposer', () => {
  it('prefers the chat input identifier over a larger text area', () => {
    const search = { id: 'search', ...shape({ role: 'AXTextField', title: '搜索', width: 200, height: 28 }) }
    const named = { id: 'input', ...shape({ role: 'AXTextArea', identifier: 'chat_input_field', width: 120, height: 32 }) }
    const big = { id: 'big', ...shape({ role: 'AXTextArea', width: 900, height: 80 }) }
    const picked = pickComposer([search, big, named], (item) => item)
    expect(picked?.id).toBe('input')
  })

  it('accepts a dotted path that ends at the chat input', () => {
    const named = {
      id: 'input',
      ...shape({ role: 'AXTextArea', identifier: 'chat_pane.chat_input_field', width: 120, height: 32, x: 200, y: 200 }),
    }
    const bubble = { id: 'bubble', ...shape({ role: 'AXTextArea', width: 640, height: 80, x: 280, y: 400 }) }
    expect(isComposerIdentifier('chat_pane.chat_input_field')).toBe(true)
    expect(isComposerIdentifier('chat_input_field.extra')).toBe(false)
    expect(pickComposer([bubble, named], (item) => item, chat)?.id).toBe('input')
  })

  it('uses the largest text area and ignores the search field', () => {
    const search = { id: 'search', ...shape({ role: 'AXTextField', identifier: 'search_field', title: '搜索', width: 280, height: 32 }) }
    const composer = { id: 'box', ...shape({ role: 'AXTextArea', width: 640, height: 48 }) }
    const tiny = { id: 'tiny', ...shape({ role: 'AXTextArea', width: 40, height: 16 }) }
    expect(pickComposer([search, tiny, composer], (item) => item)?.id).toBe('box')
  })

  it('accepts the only text area when its size is not exposed', () => {
    const only = { id: 'box', ...shape({ role: 'AXTextArea' }) }
    expect(pickComposer([only], (item) => item)?.id).toBe('box')
    expect(pickComposer([{ id: 'search', ...shape({ role: 'AXTextField', title: '搜索', width: 200, height: 24 }) }], (item) => item)).toBeNull()
  })

  it('picks the wide box in the composer strip and not a message bubble', () => {
    const bubble = {
      id: 'bubble',
      ...shape({ role: 'AXTextArea', width: 420, height: 90, x: 280, y: 360 }),
    }
    const videoCaption = {
      id: 'caption',
      ...shape({ role: 'AXTextArea', width: 240, height: 40, x: 300, y: 620 }),
    }
    const composer = {
      id: 'box',
      ...shape({ role: 'AXTextArea', width: 560, height: 44, x: 280, y: 716 }),
    }
    expect(pickComposer([bubble, videoCaption, composer], (item) => item, chat)?.id).toBe('box')
  })

  it('does not treat message text as the composer', () => {
    const bubble = {
      id: 'bubble',
      ...shape({ role: 'AXTextArea', width: 640, height: 120, x: 280, y: 400 }),
    }
    expect(pickComposer([bubble], (item) => item, chat)).toBeNull()
  })
})

describe('shouldExpandForComposer', () => {
  it('skips message lists, media, and large scroll areas', () => {
    expect(shouldExpandForComposer('AXList', '', 4)).toBe(false)
    expect(shouldExpandForComposer('AXOutline', '', 20)).toBe(false)
    expect(shouldExpandForComposer('AXImage', '', 0)).toBe(false)
    expect(shouldExpandForComposer('AXButton', '', 1)).toBe(false)
    expect(shouldExpandForComposer('AXWebArea', '', 3)).toBe(false)
    expect(shouldExpandForComposer('AXScrollArea', '', 40)).toBe(false)
    expect(shouldExpandForComposer('AXScrollArea', '', 2)).toBe(true)
    expect(shouldExpandForComposer('AXScrollArea', 'chat_input_field', 40)).toBe(true)
    expect(shouldExpandForComposer('AXGroup', '', 6)).toBe(true)
  })
})
