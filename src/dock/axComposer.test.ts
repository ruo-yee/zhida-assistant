import { describe, expect, it } from 'vitest'
import { pickComposer, type ComposerShape } from './axComposer.ts'

function shape(partial: Partial<ComposerShape> & Pick<ComposerShape, 'role'>): ComposerShape {
  return {
    identifier: '',
    title: '',
    width: 0,
    height: 0,
    ...partial,
  }
}

describe('pickComposer', () => {
  it('prefers the chat input identifier over a larger text area', () => {
    const search = { id: 'search', ...shape({ role: 'AXTextField', title: '搜索', width: 200, height: 28 }) }
    const named = { id: 'input', ...shape({ role: 'AXTextArea', identifier: 'chat_input_field', width: 120, height: 32 }) }
    const big = { id: 'big', ...shape({ role: 'AXTextArea', width: 900, height: 80 }) }
    const picked = pickComposer([search, big, named], (item) => item)
    expect(picked?.id).toBe('input')
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
})
