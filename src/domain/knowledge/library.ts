import { CORPUS, type KnowledgeDoc } from './corpus.ts'

/** The library shipped with the app. Search reads this, plus notes saved on the device. */
export const BUILTIN_SOURCE = 'builtin' as const
export const FOLDER_SOURCE = 'folder' as const
export const OBSIDIAN_SOURCE = 'obsidian' as const

export type KnowledgeSource = typeof BUILTIN_SOURCE | typeof FOLDER_SOURCE | typeof OBSIDIAN_SOURCE

export const LOCAL_NOTE_LIMIT = 40
export const NOTE_TITLE_LIMIT = 40
export const NOTE_BODY_LIMIT = 4000
export const LIBRARY_PATH_LIMIT = 300

export interface LocalNote {
  id: string
  title: string
  body: string
  updatedAt: string
}

export interface KnowledgeLibrarySettings {
  knowledgeSource: KnowledgeSource
  folderPath: string
  obsidianPath: string
  localNotes: LocalNote[]
  enabledDocIds: string[]
}

const NOTE_ID = /^note-[a-z0-9-]{4,80}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

export function todayStamp(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createNoteId() {
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function cleanNoteTitle(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, NOTE_TITLE_LIMIT)
}

export function cleanNoteBody(value: string) {
  return value.replace(/\r\n/g, '\n').slice(0, NOTE_BODY_LIMIT)
}

export function blankNote(now = new Date()): LocalNote {
  return { id: createNoteId(), title: '未命名笔记', body: '', updatedAt: todayStamp(now) }
}

export function noteKeywords(title: string, body: string) {
  const keywords: string[] = []
  const push = (value: string) => {
    const term = value.trim()
    if (term.length < 2 || term.length > 16 || keywords.includes(term)) return
    keywords.push(term)
  }
  push(title)
  for (let index = 0; index < title.length - 1 && keywords.length < 4; index += 2) {
    push(title.slice(index, index + 2))
  }
  const clauses = body.split(/[\s,，。！？、；：\n]+/)
  for (const clause of clauses) {
    if (keywords.length >= 8) break
    push(clause.slice(0, 12))
  }
  return keywords.slice(0, 8)
}

export function noteToDoc(note: LocalNote): KnowledgeDoc {
  const title = cleanNoteTitle(note.title) || '未命名笔记'
  const body = cleanNoteBody(note.body)
  const keywords = noteKeywords(title, body)
  const excerpt = body.replace(/\s+/g, ' ').trim().slice(0, 80) || '本机笔记，还没有正文。'
  return {
    id: note.id,
    title,
    version: '笔记',
    sourceLabel: '内置知识库',
    updatedAt: note.updatedAt,
    excerpt,
    body: body || title,
    icon: 'doc',
    keywords: keywords.length > 0 ? keywords : [title],
    anchors: keywords.slice(0, 2).length > 0 ? keywords.slice(0, 2) : [title],
  }
}

/** Packaged documents plus notes written in the app. This is the default library. */
export function builtinDocuments(notes: LocalNote[]): KnowledgeDoc[] {
  return [...CORPUS, ...notes.map(noteToDoc)]
}

/**
 * External files replace the built-in corpus only after a non-empty index.
 * Otherwise search stays on the built-in library. This result is not 上下文.
 */
export function retrievalLibrary(input: {
  source: KnowledgeSource
  files: Array<{ id: string; title: string; body: string }>
  notes: LocalNote[]
  enabledDocIds: string[]
}): { docs: KnowledgeDoc[]; enabledDocIds?: string[]; fallback: boolean } {
  const notes = input.notes.map(noteToDoc)
  if ((input.source === FOLDER_SOURCE || input.source === OBSIDIAN_SOURCE) && input.files.length > 0) {
    const label = input.source === OBSIDIAN_SOURCE ? 'Obsidian' : '本地文件夹'
    return { docs: [...externalDocuments(input.files, label), ...notes], fallback: false }
  }
  const docs = builtinDocuments(input.notes)
  const enabled = new Set(input.enabledDocIds.filter((id) => docs.some((doc) => doc.id === id)))
  for (const note of input.notes) enabled.add(note.id)
  return {
    docs,
    enabledDocIds: [...enabled],
    fallback: input.source !== BUILTIN_SOURCE,
  }
}

export function externalDocuments(
  files: Array<{ id: string; title: string; body: string }>,
  sourceLabel: string,
): KnowledgeDoc[] {
  return files.map((file) => {
    const doc = noteToDoc({
      id: file.id,
      title: file.title,
      body: file.body,
      updatedAt: todayStamp(),
    })
    return { ...doc, version: '文件', sourceLabel }
  })
}

export function normalizeKnowledgeSettings(stored: {
  knowledgeSource?: unknown
  vaultPath?: unknown
  folderPath?: unknown
  obsidianPath?: unknown
  localNotes?: unknown
  enabledDocIds?: unknown
} | null | undefined): KnowledgeLibrarySettings {
  const localNotes = normalizeNotes(stored?.localNotes)
  const known = new Set<string>([...CORPUS.map((doc) => doc.id), ...localNotes.map((note) => note.id)])
  const enabledDocIds = Array.isArray(stored?.enabledDocIds)
    ? stored.enabledDocIds.filter((id): id is string => typeof id === 'string' && known.has(id))
    : CORPUS.map((doc) => doc.id)
  const legacyPath = cleanPath(stored?.vaultPath)
  const source = normalizeSource(stored?.knowledgeSource)
  return {
    knowledgeSource: source,
    folderPath: cleanPath(stored?.folderPath) || (stored?.knowledgeSource === 'vault' ? legacyPath : ''),
    obsidianPath: cleanPath(stored?.obsidianPath),
    localNotes,
    enabledDocIds,
  }
}

function normalizeSource(value: unknown): KnowledgeSource {
  if (value === FOLDER_SOURCE || value === 'vault') return FOLDER_SOURCE
  if (value === OBSIDIAN_SOURCE) return OBSIDIAN_SOURCE
  return BUILTIN_SOURCE
}

function cleanPath(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, LIBRARY_PATH_LIMIT) : ''
}

function normalizeNotes(value: unknown): LocalNote[] {
  if (!Array.isArray(value)) return []
  const notes: LocalNote[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<LocalNote>
    if (typeof row.id !== 'string' || !NOTE_ID.test(row.id) || notes.some((note) => note.id === row.id)) continue
    notes.push({
      id: row.id,
      title: cleanNoteTitle(typeof row.title === 'string' ? row.title : '') || '未命名笔记',
      body: cleanNoteBody(typeof row.body === 'string' ? row.body : ''),
      updatedAt: typeof row.updatedAt === 'string' && DAY.test(row.updatedAt) ? row.updatedAt : todayStamp(),
    })
    if (notes.length >= LOCAL_NOTE_LIMIT) break
  }
  return notes
}
