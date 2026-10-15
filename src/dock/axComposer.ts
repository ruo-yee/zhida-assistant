/** WeChat's chat composer. Exact identifier when the tree exposes one. */
export const COMPOSER_IDENTIFIER = 'chat_input_field'

export interface ComposerShape {
  role: string
  identifier: string
  title: string
  width: number
  height: number
  /** Top-left screen position. Absent when Accessibility did not expose AXPosition. */
  x?: number
  y?: number
}

export interface ComposerWindow {
  x: number
  y: number
  width: number
  height: number
}

const HISTORY_ROLES = new Set(['AXOutline', 'AXTable', 'AXList', 'AXImage', 'AXWebArea', 'AXButton'])

/** Exact id, or a path that ends at the chat input. */
export function isComposerIdentifier(identifier: string) {
  const text = identifier.trim()
  return text === COMPOSER_IDENTIFIER || text.endsWith(`.${COMPOSER_IDENTIFIER}`)
}

/**
 * Message history, the session list, and media are not the composer.
 * A large scroll area is the message list; the input's own scroll area is small.
 * The composer identifier is always walked, including when it sits on a group.
 */
export function shouldExpandForComposer(role: string, identifier: string, childCount: number) {
  if (isComposerIdentifier(identifier)) return true
  if (HISTORY_ROLES.has(role)) return false
  if (role === 'AXScrollArea' && childCount > 12) return false
  return true
}

/**
 * The writable chat box. Prefer the known identifier, then a wide text box
 * in the bottom band of the window, then the largest text area.
 * A search field is not the composer. Text that sits in the message list
 * is not the composer either — writing there must not be how insert lands.
 * One text area with no measured size is still the box — WeChat often hides
 * AXSize until the tree is warm.
 */
export function pickComposer<T>(
  items: T[],
  shapeOf: (item: T) => ComposerShape,
  window?: ComposerWindow | null,
): T | null {
  const text = items.filter((item) => {
    const role = shapeOf(item).role
    return role === 'AXTextArea' || role === 'AXTextField'
  })
  const named = text.find((item) => isComposerIdentifier(shapeOf(item).identifier))
  if (named) return named
  if (window && window.width >= 240 && window.height >= 240) {
    const band = text.filter((item) => inComposerBand(shapeOf(item), window))
    if (band.length > 0) return largest(band, shapeOf)
    const positioned = text.filter((item) => shapeOf(item).y != null)
    if (positioned.length > 0 && positioned.every((item) => inMessageRegion(shapeOf(item), window))) {
      return pickBySize(text.filter((item) => shapeOf(item).y == null), shapeOf)
    }
  }
  return pickBySize(text, shapeOf)
}

function pickBySize<T>(text: T[], shapeOf: (item: T) => ComposerShape): T | null {
  const areas = text.filter((item) => {
    const shape = shapeOf(item)
    return shape.role === 'AXTextArea' && shape.width >= 80 && shape.height >= 16
  })
  if (areas.length > 0) return largest(areas, shapeOf)
  const bare = text.filter((item) => shapeOf(item).role === 'AXTextArea')
  if (bare.length === 1) return bare[0] ?? null
  const fields = text.filter((item) => {
    const shape = shapeOf(item)
    if (shape.role !== 'AXTextField' || shape.width < 160) return false
    if (shape.identifier === 'search_field' || shape.title.includes('搜索')) return false
    return true
  })
  if (fields.length === 0) return null
  return largest(fields, shapeOf)
}

function largest<T>(items: T[], shapeOf: (item: T) => ComposerShape) {
  return [...items].sort((a, b) => area(shapeOf(b)) - area(shapeOf(a)))[0] ?? null
}

function area(shape: ComposerShape) {
  return shape.width * shape.height
}

/** Wide box whose bottom edge sits in the composer strip, not on a bubble. */
function inComposerBand(shape: ComposerShape, window: ComposerWindow) {
  if (shape.y == null || shape.width < 80 || shape.height < 16 || shape.height > 280) return false
  if (shape.identifier === 'search_field' || shape.title.includes('搜索')) return false
  if (shape.role === 'AXTextField' && shape.width < 160) return false
  if (shape.width < window.width * 0.32) return false
  const center = shape.y + shape.height / 2
  const bottomGap = window.y + window.height - (shape.y + shape.height)
  return center >= window.y + window.height * 0.75 && bottomGap <= window.height * 0.16 && bottomGap >= -8
}

function inMessageRegion(shape: ComposerShape, window: ComposerWindow) {
  if (shape.y == null) return false
  const center = shape.y + shape.height / 2
  return center < window.y + window.height * 0.72
}
