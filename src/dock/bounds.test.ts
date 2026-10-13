import { describe, expect, it } from 'vitest'
import { boundsNearlyEqual, computeDockBounds } from './bounds.ts'

const workArea = { x: 0, y: 0, width: 1920, height: 1080 }

describe('computeDockBounds', () => {
  it('sits flush on the right edge and matches WeChat height', () => {
    const placed = computeDockBounds({
      host: { x: 100, y: 80, width: 900, height: 700 },
      workArea,
      preferredWidth: 440,
    })
    expect(placed).toEqual({ x: 1000, y: 80, width: 440, height: 700, side: 'right' })
  })

  it('moves to the left edge when the right side has no room', () => {
    const placed = computeDockBounds({
      host: { x: 1600, y: 40, width: 300, height: 800 },
      workArea,
      preferredWidth: 440,
    })
    expect(placed.side).toBe('left')
    expect(placed.x + placed.width).toBe(1600)
    expect(placed.width).toBe(440)
    expect(placed.y).toBe(40)
    expect(placed.height).toBe(800)
  })

  it('clamps a window taller than the work area', () => {
    const placed = computeDockBounds({
      host: { x: 200, y: -40, width: 800, height: 2000 },
      workArea,
      preferredWidth: 440,
    })
    expect(placed.y).toBe(0)
    expect(placed.height).toBe(1080)
    expect(placed.x).toBe(1000)
  })

  it('treats one-pixel jitter as the same bounds', () => {
    const a = { x: 10, y: 20, width: 440, height: 700 }
    expect(boundsNearlyEqual(a, { ...a, x: 11 })).toBe(true)
    expect(boundsNearlyEqual(a, { ...a, x: 14 })).toBe(false)
  })
})
