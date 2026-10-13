import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { indexLibraryFolder, MAX_LIBRARY_CHARS } from './folderIndex.ts'
import { describeLibrary, folderLabel } from './indexStatus.ts'

describe('describeLibrary', () => {
  it('names the built-in library and a missing external folder', () => {
    expect(
      describeLibrary({
        source: 'builtin',
        enabledCount: 4,
        phase: 'idle',
        fileCount: 0,
        code: null,
        fallback: false,
      }).text,
    ).toBe('正在使用 · 4 篇可检索')
    expect(
      describeLibrary({
        source: 'obsidian',
        enabledCount: 4,
        phase: 'empty',
        fileCount: 0,
        code: 'not-vault',
        fallback: true,
      }).text,
    ).toBe('这不是 Obsidian 库')
    expect(
      describeLibrary({
        source: 'folder',
        enabledCount: 4,
        phase: 'desktop',
        fileCount: 0,
        code: null,
        fallback: true,
      }).text,
    ).toBe('在桌面版里选择文件夹')
    expect(folderLabel('/Users/me/我的笔记/')).toBe('我的笔记')
  })
})

describe('indexLibraryFolder', () => {
  it('reads notes, rejects a plain folder as Obsidian, and skips hidden directories', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'zhida-lib-'))
    await writeFile(path.join(root, '退款规则.md'), `# 退款规则\n\n${'七天内可退。'.repeat(4000)}`)
    await mkdir(path.join(root, '.secret'))
    await writeFile(path.join(root, '.secret', 'hidden.md'), '不要索引')
    await mkdir(path.join(root, 'nested'))
    await writeFile(path.join(root, 'nested', '运费.txt'), '运费不退')

    const indexed = await indexLibraryFolder(root, 'folder')
    expect(indexed.ok).toBe(true)
    if (!indexed.ok) return
    expect(indexed.files.map((file) => file.title)).toEqual(['退款规则', '运费'])
    expect(indexed.files[0]?.id).toBe('ext-退款规则')
    expect(indexed.files[0]?.body.length).toBe(MAX_LIBRARY_CHARS)
    expect(indexed.files.some((file) => file.body.includes('不要索引'))).toBe(false)

    expect(await indexLibraryFolder(root, 'obsidian')).toEqual({ ok: false, code: 'not-vault' })
    await mkdir(path.join(root, '.obsidian'))
    const vault = await indexLibraryFolder(root, 'obsidian')
    expect(vault.ok).toBe(true)
    expect(await indexLibraryFolder(path.join(root, 'missing'), 'folder')).toEqual({ ok: false, code: 'missing' })
    await mkdir(path.join(root, 'blank'))
    expect(await indexLibraryFolder(path.join(root, 'blank'), 'folder')).toEqual({ ok: false, code: 'empty' })
  })
})
