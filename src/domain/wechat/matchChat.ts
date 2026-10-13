import type { IndexedChat } from './messageSql.ts'

const COUNT_SUFFIX = /\s*[(（]\s*\d{1,5}\s*[)）]?\s*$/u
const APP_NAMES = new Set(['微信', 'WeChat', 'Weixin'])

export function stripCountSuffix(value: string) {
  return value.replace(COUNT_SUFFIX, '').trim()
}

export function usableTitle(value: string) {
  const title = stripCountSuffix(value).normalize('NFC').trim()
  if (!title || APP_NAMES.has(title)) return ''
  return title
}

function fold(value: string) {
  return stripCountSuffix(value).normalize('NFC').trim().toLowerCase()
}

export function matchChat(title: string, chats: IndexedChat[]): IndexedChat | null {
  const wanted = fold(usableTitle(title))
  if (!wanted) return null
  const hits = chats.filter((chat) => chat.aliases.some((alias) => fold(alias) === wanted))
  return hits.length === 1 ? hits[0] : null
}
