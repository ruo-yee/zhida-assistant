import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { FolderIndexResult, IndexedFile } from './indexStatus.ts'

export const MAX_LIBRARY_FILES = 80
export const MAX_LIBRARY_CHARS = 20_000
export const MAX_LIBRARY_DEPTH = 5

const TEXT = new Set(['.md', '.markdown', '.txt'])

/** A dropped directory becomes the knowledge source. A file stays unknown so the caller can read it as a note. */
export async function classifyDroppedPath(target: string): Promise<'folder' | 'obsidian' | 'unknown'> {
  const root = target.trim()
  if (!root) return 'unknown'
  let info
  try {
    info = await stat(root)
  } catch {
    return 'unknown'
  }
  if (!info.isDirectory()) return 'unknown'
  try {
    const marker = await stat(path.join(root, '.obsidian'))
    if (marker.isDirectory()) return 'obsidian'
  } catch {
    return 'folder'
  }
  return 'folder'
}

/** Read Markdown and text notes on this machine. Skips hidden folders. Does not upload anything. */
export async function indexLibraryFolder(folder: string, kind: 'folder' | 'obsidian'): Promise<FolderIndexResult> {
  const root = folder.trim()
  if (!root) return { ok: false, code: 'missing' }
  let info
  try {
    info = await stat(root)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return { ok: false, code: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unreadable' }
  }
  if (!info.isDirectory()) return { ok: false, code: 'unreadable' }
  if (kind === 'obsidian') {
    try {
      const marker = await stat(path.join(root, '.obsidian'))
      if (!marker.isDirectory()) return { ok: false, code: 'not-vault' }
    } catch {
      return { ok: false, code: 'not-vault' }
    }
  }
  const files: IndexedFile[] = []
  try {
    await walk(root, root, 0, files)
  } catch {
    return { ok: false, code: 'unreadable' }
  }
  if (files.length === 0) return { ok: false, code: 'empty' }
  return { ok: true, files }
}

async function walk(root: string, dir: string, depth: number, files: IndexedFile[]) {
  if (files.length >= MAX_LIBRARY_FILES) return
  const entries = await readdir(dir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  for (const entry of entries) {
    if (files.length >= MAX_LIBRARY_FILES) return
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (depth >= MAX_LIBRARY_DEPTH) continue
      await walk(root, full, depth + 1, files)
      continue
    }
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!TEXT.has(ext)) continue
    let raw = ''
    try {
      raw = await readFile(full, 'utf8')
    } catch {
      continue
    }
    const body = raw.replace(/\u0000/g, '').slice(0, MAX_LIBRARY_CHARS)
    const relative = path.relative(root, full)
    files.push({
      id: fileId(relative, files),
      title: heading(body) || path.basename(entry.name, path.extname(entry.name)),
      body,
    })
  }
}

function heading(body: string) {
  const line = body.split(/\r?\n/).find((item) => /^#{1,6}\s+\S/.test(item))
  return line?.replace(/^#{1,6}\s+/, '').trim().slice(0, 80) || ''
}

function fileId(relative: string, files: IndexedFile[]) {
  const base = relative.replace(/\\/g, '/').replace(/\.[^.]+$/, '')
  const slug = base
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  const stem = `ext-${slug || 'file'}`
  let id = stem
  let n = 2
  while (files.some((file) => file.id === id)) {
    id = `${stem}-${n}`
    n += 1
  }
  return id
}
