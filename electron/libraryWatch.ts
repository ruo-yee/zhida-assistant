import { watch, type FSWatcher } from 'node:fs'
import { libraryFingerprint } from '../src/domain/knowledge/folderIndex.ts'
import { LIBRARY_REFRESH_MS, createRefreshGate, libraryPathShouldRefresh, refreshDecision } from '../src/domain/knowledge/libraryWatch.ts'

const POLL_MS = 1500

interface ActiveWatch {
  folder: string
  kind: 'folder' | 'obsidian'
  watcher: FSWatcher | null
  timer: ReturnType<typeof setInterval>
  gate: ReturnType<typeof createRefreshGate>
  fingerprint: string
  notify: () => void
}

let active: ActiveWatch | null = null

/**
 * Re-index when notes under the selected folder change.
 * A recursive watch is used where the platform allows it. A short poll
 * covers nested edits the watch does not see. Hidden files are ignored.
 */
export function startLibraryWatch(folder: string, kind: 'folder' | 'obsidian', notify: () => void) {
  const root = folder.trim()
  if (!root) {
    stopLibraryWatch()
    return
  }
  if (active && active.folder === root && active.kind === kind) return
  stopLibraryWatch()
  const state: ActiveWatch = {
    folder: root,
    kind,
    watcher: null,
    timer: setInterval(() => {
      void check()
    }, POLL_MS),
    gate: createRefreshGate(LIBRARY_REFRESH_MS),
    fingerprint: '',
    notify,
  }
  active = state
  state.watcher = openWatch(root, (filename) => {
    if (filename && !libraryPathShouldRefresh(String(filename))) return
    void check()
  })
  void check()

  let checking = false
  let again = false
  async function check() {
    if (active !== state) return
    if (checking) {
      again = true
      return
    }
    checking = true
    try {
      do {
        again = false
        let next = 'code:unreadable'
        try {
          next = await libraryFingerprint(state.folder, state.kind)
        } catch {
          next = 'code:unreadable'
        }
        if (active !== state) return
        if (refreshDecision(state.fingerprint, next) === 'refresh') state.gate.poke(state.notify)
        state.fingerprint = next
      } while (again && active === state)
    } finally {
      checking = false
    }
  }
}

export function stopLibraryWatch() {
  if (!active) return
  active.gate.cancel()
  clearInterval(active.timer)
  active.watcher?.close()
  active = null
}

function openWatch(root: string, onEvent: (filename: string | null) => void): FSWatcher | null {
  const handle = (_event: string, filename: string | null) => onEvent(filename)
  try {
    return watch(root, { recursive: true }, handle)
  } catch {
    try {
      return watch(root, handle)
    } catch {
      return null
    }
  }
}
