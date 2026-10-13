import { createNoteId, NOTE_BODY_LIMIT, NOTE_TITLE_LIMIT, todayStamp, type LocalNote } from './library.ts'

const TEXT_FILE = /\.(md|markdown|txt)$/i

export function isDroppedTextFile(name: string) {
  return TEXT_FILE.test(name)
}

export function libraryDropPlan(input: { path: string; kind: 'folder' | 'obsidian' | 'unknown' }):
  | { action: 'switch'; source: 'folder' | 'obsidian'; path: string }
  | { action: 'ignore' } {
  if (!input.path.trim()) return { action: 'ignore' }
  if (input.kind === 'obsidian') return { action: 'switch', source: 'obsidian', path: input.path }
  if (input.kind === 'folder') return { action: 'switch', source: 'folder', path: input.path }
  return { action: 'ignore' }
}

export function noteFromDroppedText(name: string, body: string, now = new Date()): LocalNote | null {
  const text = body.replace(/\u0000/g, '').trim().slice(0, NOTE_BODY_LIMIT)
  if (!text) return null
  const title = name.replace(/\.[^.]+$/, '').trim().slice(0, NOTE_TITLE_LIMIT) || '未命名'
  return { id: createNoteId(), title, body: text, updatedAt: todayStamp(now) }
}
