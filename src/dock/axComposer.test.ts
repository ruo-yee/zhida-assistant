import { describe, expect, it } from 'vitest'
import {
  COMPOSER_BOTTOM_INSET,
  composerPoint,
  fallbackPaneLeft,
  mouseEventPoint,
  pickLargestTextArea,
  type TextAreaShape,
} from './axComposer.ts'

function shape(partial: Partial<TextAreaShape> & Pick<TextAreaShape, 'role'>): TextAreaShape {
  return { width: 0, height: 0, ...partial }
}

describe('composerPoint', () => {
  it('uses the chat-pane bottom band, not a fraction of a tall window', () => {
    const frame = { x: 80, y: 40, width: 1100, height: 900 }
    const point = composerPoint(frame)
    expect(point).not.toBeNull()
    expect(frame.y + frame.height - (point?.y ?? 0)).toBe(COMPOSER_BOTTOM_INSET)
    expect(point!.y).toBeGreaterThan(frame.y + frame.height * 0.84)
    expect(point!.x).toBeGreaterThanOrEqual(frame.x + fallbackPaneLeft(frame.width))
    expect(point!.x).toBeLessThanOrEqual(frame.x + frame.width - 88)
  })

  it('refuses a window too small to contain a composer', () => {
    expect(composerPoint({ x: 0, y: 0, width: 100, height: 100 })).toBeNull()
  })

  it('flips the click into CoreGraphics bottom-left points', () => {
    expect(mouseEventPoint({ x: 400, y: 860 }, 900)).toEqual({ x: 400, y: 40 })
    expect(mouseEventPoint({ x: 10, y: 10 }, 0)).toBeNull()
  })
})

describe('pickLargestTextArea', () => {
  const chat = { x: 100, y: 80, width: 900, height: 700 }

  it('picks the largest text area inside the chat window', () => {
    const outside = { id: 'other', ...shape({ role: 'AXTextArea', x: 2000, y: 80, width: 800, height: 200 }) }
    const small = { id: 'small', ...shape({ role: 'AXTextArea', x: 400, y: 600, width: 200, height: 40 }) }
    const composer = { id: 'box', ...shape({ role: 'AXTextArea', x: 420, y: 700, width: 480, height: 48 }) }
    const search = { id: 'search', ...shape({ role: 'AXTextField', x: 120, y: 90, width: 240, height: 28 }) }
    expect(pickLargestTextArea([outside, search, small, composer], (item) => item, chat)?.id).toBe('box')
  })

  it('accepts the only text area when its frame is not exposed', () => {
    const only = { id: 'box', ...shape({ role: 'AXTextArea' }) }
    expect(pickLargestTextArea([only], (item) => item, chat)?.id).toBe('box')
  })
})
