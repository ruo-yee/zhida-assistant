import { describe, expect, it } from 'vitest'
import { composerPoint, MIN_INPUT_AREA, pickLargestTextArea, type TextAreaShape } from './axComposer.ts'

function shape(partial: Partial<TextAreaShape> & Pick<TextAreaShape, 'role'>): TextAreaShape {
  return { width: 0, height: 0, ...partial }
}

describe('composerPoint', () => {
  it('matches wechat_send._composer_point: 62% across, 72 points above the bottom', () => {
    const frame = { x: 80, y: 40, width: 1100, height: 900 }
    expect(composerPoint(frame)).toEqual({
      x: 80 + 1100 * 0.62,
      y: 40 + 900 - 72,
    })
    const fromBottom = frame.y + frame.height - composerPoint(frame).y
    expect(fromBottom).toBe(72)
    expect(fromBottom).toBeLessThan(frame.height * 0.16)
  })
})

describe('pickLargestTextArea', () => {
  it('keeps the largest text area only when its area reaches 10000', () => {
    const tiny = { id: 'tiny', ...shape({ role: 'AXTextArea', width: 200, height: 40 }) }
    const composer = { id: 'box', ...shape({ role: 'AXTextArea', width: 400, height: 40 }) }
    const search = { id: 'search', ...shape({ role: 'AXTextField', width: 500, height: 40 }) }
    expect(tiny.width * tiny.height).toBeLessThan(MIN_INPUT_AREA)
    expect(pickLargestTextArea([search, tiny], (item) => item)).toBeNull()
    expect(pickLargestTextArea([search, tiny, composer], (item) => item)?.id).toBe('box')
  })
})
