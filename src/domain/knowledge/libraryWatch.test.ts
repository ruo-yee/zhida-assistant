import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { indexLibraryFolder, libraryFingerprint } from './folderIndex.ts'
import { retrievalLibrary } from './library.ts'
import { createRefreshGate, libraryPathShouldRefresh, refreshDecision } from './libraryWatch.ts'

describe('library refresh', () => {
  it('ignores hidden and non-note events, and refreshes markdown changes', () => {
    expect(libraryPathShouldRefresh('.obsidian/app.json')).toBe(false)
    expect(libraryPathShouldRefresh('images/logo.png')).toBe(false)
    expect(libraryPathShouldRefresh('笔记/退款.md')).toBe(true)
    expect(libraryPathShouldRefresh('运费.txt')).toBe(true)
    expect(libraryPathShouldRefresh('nested')).toBe(true)
    expect(refreshDecision('', 'code:empty')).toBe('baseline')
    expect(refreshDecision('a', 'a')).toBe('same')
    expect(refreshDecision('a', 'b')).toBe('refresh')
  })

  it('waits out a burst and runs one refresh', () => {
    const pending: Array<() => void> = []
    const gate = createRefreshGate(600, {
      set(fn) {
        pending.push(fn)
        return pending.length
      },
      clear() {
        pending.pop()
      },
    })
    let runs = 0
    gate.poke(() => {
      runs += 1
    })
    gate.poke(() => {
      runs += 1
    })
    expect(pending).toHaveLength(1)
    pending[0]?.()
    expect(runs).toBe(1)
    gate.cancel()
  })

  it('sees an edit, an added note, and a deletion without a new folder pick', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'zhida-watch-'))
    try {
      await writeFile(path.join(root, '退款.md'), '# 退款\n\n七天内可退')
      const first = await libraryFingerprint(root, 'folder')
      const indexed = await indexLibraryFolder(root, 'folder')
      expect(indexed.ok).toBe(true)
      if (!indexed.ok) return

      await writeFile(path.join(root, '退款.md'), '# 退款\n\n三十天内可退')
      const edited = await libraryFingerprint(root, 'folder')
      expect(refreshDecision(first, edited)).toBe('refresh')
      const afterEdit = await indexLibraryFolder(root, 'folder')
      expect(afterEdit.ok).toBe(true)
      if (!afterEdit.ok) return
      expect(afterEdit.files[0]?.body).toContain('三十天内可退')

      await writeFile(path.join(root, '运费.txt'), '运费不退')
      const added = await libraryFingerprint(root, 'folder')
      expect(added).not.toBe(edited)

      await rm(path.join(root, '运费.txt'))
      const removed = await libraryFingerprint(root, 'folder')
      expect(removed).not.toBe(added)
      expect(removed).toBe(edited)

      await writeFile(path.join(root, '.secret.md'), '不要索引')
      expect(await libraryFingerprint(root, 'folder')).toBe(removed)

      const library = retrievalLibrary({
        source: 'folder',
        files: afterEdit.files,
        notes: [],
        enabledDocIds: [],
      })
      expect(library.fallback).toBe(false)
      expect(library.docs.some((doc) => doc.body.includes('三十天内可退'))).toBe(true)

      await rm(path.join(root, '退款.md'))
      expect(await libraryFingerprint(root, 'folder')).toBe('code:empty')
      const empty = retrievalLibrary({ source: 'folder', files: [], notes: [], enabledDocIds: ['faq-offline'] })
      expect(empty.fallback).toBe(true)
      expect(empty.docs.some((doc) => doc.id === 'faq-offline')).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
