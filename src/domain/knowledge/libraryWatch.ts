/** Quiet period after the last relevant file change before retrieval re-indexes. */
export const LIBRARY_REFRESH_MS = 600

const TEXT = new Set(['.md', '.markdown', '.txt'])

/**
 * A watch event for a hidden path or a non-note file does not need a re-index.
 * A directory event has no extension and may contain new notes, so it does.
 */
export function libraryPathShouldRefresh(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\/+/, '').trim()
  if (!normalized) return true
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part.startsWith('.'))) return false
  const name = parts[parts.length - 1] ?? ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return true
  return TEXT.has(name.slice(dot).toLowerCase())
}

/** The first observation is the baseline. Only a later difference re-indexes. */
export function refreshDecision(previous: string, next: string): 'baseline' | 'same' | 'refresh' {
  if (!previous) return 'baseline'
  if (previous === next) return 'same'
  return 'refresh'
}

/**
 * One refresh after changes go quiet. A second change before the delay
 * replaces the pending refresh instead of running twice.
 */
export function createRefreshGate(
  delayMs: number,
  clock: {
    set(fn: () => void, ms: number): unknown
    clear(id: unknown): void
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
) {
  let timer: unknown = null
  return {
    poke(run: () => void) {
      if (timer) clock.clear(timer)
      timer = clock.set(() => {
        timer = null
        run()
      }, delayMs)
    },
    cancel() {
      if (timer) clock.clear(timer)
      timer = null
    },
  }
}
