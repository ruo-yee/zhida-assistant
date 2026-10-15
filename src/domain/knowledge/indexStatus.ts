import type { KnowledgeSource } from './library.ts'

export type IndexPhase = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'desktop'
export type IndexFailure = 'missing' | 'not-vault' | 'empty' | 'unreadable'

export interface IndexedFile {
  id: string
  title: string
  body: string
}

export type FolderIndexResult = { ok: true; files: IndexedFile[] } | { ok: false; code: IndexFailure }

export function folderLabel(folder: string) {
  const trimmed = folder.trim().replace(/[\\/]+$/, '')
  if (!trimmed) return ''
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] || trimmed
}

export function describeLibrary(input: {
  source: KnowledgeSource
  enabledCount: number
  phase: IndexPhase
  fileCount: number
  code: IndexFailure | null
  fallback: boolean
}): { tone: 'ok' | 'wait' | 'warn'; text: string } {
  if (input.source === 'builtin') {
    return { tone: 'ok', text: `正在使用 · ${input.enabledCount} 篇可检索` }
  }
  if (input.phase === 'desktop') return { tone: 'warn', text: '在桌面版里选择文件夹' }
  if (input.phase === 'loading') return { tone: 'wait', text: '正在读取…' }
  if (input.phase === 'idle') return { tone: 'warn', text: '未选择文件夹' }
  if (input.code === 'not-vault') return { tone: 'warn', text: '这不是 Obsidian 库' }
  if (input.code === 'empty') {
    return { tone: 'warn', text: input.fallback ? '没有 Markdown 或文本。回复仍用内置知识库' : '没有 Markdown 或文本' }
  }
  if (input.phase === 'error' || input.code === 'missing' || input.code === 'unreadable') {
    return { tone: 'warn', text: input.fallback ? '读不到这个文件夹。回复仍用内置知识库' : '读不到这个文件夹' }
  }
  return { tone: 'ok', text: `已索引 ${input.fileCount} 篇` }
}
