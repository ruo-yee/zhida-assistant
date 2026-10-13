import { describe, expect, it } from 'vitest'
import { retrievalLibrary } from './library.ts'

describe('retrievalLibrary', () => {
  it('keeps the built-in corpus until a folder or Obsidian index has files', () => {
    const builtin = retrievalLibrary({ source: 'builtin', files: [], notes: [], enabledDocIds: ['faq-offline'] })
    expect(builtin.fallback).toBe(false)
    expect(builtin.docs.some((doc) => doc.id === 'faq-offline')).toBe(true)
    expect(builtin.enabledDocIds).toEqual(['faq-offline'])

    const waiting = retrievalLibrary({ source: 'folder', files: [], notes: [], enabledDocIds: ['faq-offline'] })
    expect(waiting.fallback).toBe(true)
    expect(waiting.docs.some((doc) => doc.id === 'faq-offline')).toBe(true)

    const external = retrievalLibrary({
      source: 'obsidian',
      files: [{ id: 'note', title: '同步', body: '断网时先写在本地。' }],
      notes: [],
      enabledDocIds: ['faq-offline'],
    })
    expect(external.fallback).toBe(false)
    expect(external.enabledDocIds).toBeUndefined()
    expect(external.docs.map((doc) => doc.title)).toEqual(['同步'])
    expect(external.docs[0]?.sourceLabel).toBe('Obsidian')
  })
})