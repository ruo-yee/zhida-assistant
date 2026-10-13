import type { DockPlacement, Rect } from './types.ts'

export function computeDockBounds(options: {
  host: Rect
  workArea: Rect
  preferredWidth: number
  gap?: number
  minWidth?: number
}): DockPlacement {
  const gap = options.gap ?? 0
  const minWidth = options.minWidth ?? 320
  const { host, workArea: work } = options
  const preferredWidth = Math.min(options.preferredWidth, work.width)

  const roomRight = work.x + work.width - (host.x + host.width) - gap
  const roomLeft = host.x - gap - work.x
  const side = roomRight >= Math.min(preferredWidth, minWidth) || roomRight >= roomLeft ? 'right' : 'left'
  const available = Math.max(0, side === 'right' ? roomRight : roomLeft)
  const width = Math.round(Math.min(preferredWidth, Math.max(available, Math.min(minWidth, work.width))))

  let x = side === 'right' ? host.x + host.width + gap : host.x - gap - width
  let y = host.y
  let height = host.height

  if (x < work.x) x = work.x
  if (x + width > work.x + work.width) x = work.x + work.width - width

  if (y < work.y) {
    height -= work.y - y
    y = work.y
  }
  if (y + height > work.y + work.height) height = work.y + work.height - y
  if (height < 240) {
    height = Math.min(work.height, 240)
    y = Math.min(Math.max(y, work.y), work.y + work.height - height)
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width,
    height: Math.round(height),
    side,
  }
}

export function boundsNearlyEqual(a: Rect, b: Rect, tolerance = 1) {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  )
}
