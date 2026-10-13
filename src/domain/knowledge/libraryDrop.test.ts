import { describe, expect, it } from 'vitest'
import { isDroppedTextFile, libraryDropPlan, noteFromDroppedText } from './libraryDrop.ts'

describe('libraryDropPlan', () => {
  it('switches the knowledge source when a folder or Obsidian vault is dropped', () => {
    expect(libraryDropPlan({ path: '/vault', kind: 'obsidian' })).toEqual({
      action: 'switch',
      source: 'obsidian',
      path: '/vault',
    })
    expect(libraryDropPlan({ path: '/notes', kind: 'folder' }).action).toBe('switch')
    expect(libraryDropPlan({ path: '/notes/a.md', kind: 'unknown' })).toEqual({ action: 'ignore' })
  })

  it('keeps a dropped markdown file as a searchable note', () => {
    expect(isDroppedTextFile('报价.md')).toBe(true)
    expect(isDroppedTextFile('photo.png')).toBe(false)
    const note = noteFromDroppedText('报价.md', '  标准版每年 199 元  ')
    expect(note?.title).toBe('报价')
    expect(note?.body).toContain('199')
    expect(noteFromDroppedText('空.txt', '   ')).toBeNull()
  })
})
