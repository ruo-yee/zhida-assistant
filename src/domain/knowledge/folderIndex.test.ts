import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyDroppedPath } from './folderIndex.ts'

describe('classifyDroppedPath', () => {
  it('tells an Obsidian vault from a plain folder and a file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'zhida-drop-'))
    const notes = path.join(root, 'notes')
    const vault = path.join(root, 'vault')
    const file = path.join(root, 'note.md')
    await mkdir(notes)
    await mkdir(path.join(vault, '.obsidian'), { recursive: true })
    await writeFile(file, 'hello')
    expect(await classifyDroppedPath(notes)).toBe('folder')
    expect(await classifyDroppedPath(vault)).toBe('obsidian')
    expect(await classifyDroppedPath(file)).toBe('unknown')
  })
})
