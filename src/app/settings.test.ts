import { describe, expect, it, vi } from 'vitest'
import { createKnowledgeRetriever } from '../domain/knowledge/KnowledgeRetriever.ts'
import { retrievalLibrary } from '../domain/knowledge/library.ts'
import {
  DEFAULT_MODEL_BASE,
  DEFAULT_MODEL_NAME,
  SETTINGS_VERSION,
  defaultSettings,
  loadSettings,
  migrateModelSettings,
  persistableSettings,
  saveSettings,
} from './settings.ts'

describe('migrateModelSettings', () => {
  it('starts new installs on the local model endpoint', () => {
    expect(migrateModelSettings(null)).toMatchObject({
      modelMode: 'openai',
      openaiBase: DEFAULT_MODEL_BASE,
      openaiModel: DEFAULT_MODEL_NAME,
      settingsVersion: SETTINGS_VERSION,
    })
  })

  it('turns an old local-draft default into the local model instead of the cloud URL', () => {
    const next = migrateModelSettings({
      modelMode: 'local',
      openaiBase: 'https://api.openai.com/v1',
      openaiModel: 'gpt-4o-mini',
    })
    expect(next.modelMode).toBe('openai')
    expect(next.openaiBase).toBe(DEFAULT_MODEL_BASE)
    expect(next.openaiModel).toBe(DEFAULT_MODEL_NAME)
  })

  it('keeps a chosen local endpoint and an explicit opt-out', () => {
    expect(
      migrateModelSettings({
        modelMode: 'local',
        openaiBase: 'http://127.0.0.1:11434/v1',
        openaiModel: 'qwen2.5:7b',
      }).openaiBase,
    ).toBe('http://127.0.0.1:11434/v1')
    expect(
      migrateModelSettings({
        settingsVersion: SETTINGS_VERSION,
        modelMode: 'local',
        openaiBase: DEFAULT_MODEL_BASE,
      }).modelMode,
    ).toBe('local')
  })

  it('drops the API key from localStorage when the desktop secret store is available', () => {
    const settings = {
      theme: 'light' as const,
      persona: 'professional' as const,
      activePersonaId: 'support',
      customPersonas: [],
      enabledDocIds: [],
      knowledgeSource: 'builtin' as const,
      folderPath: '',
      obsidianPath: '',
      localNotes: [],
      modelMode: 'openai' as const,
      openaiBase: DEFAULT_MODEL_BASE,
      openaiModel: DEFAULT_MODEL_NAME,
      openaiKey: 'sk-secret',
      settingsVersion: SETTINGS_VERSION,
    }
    expect(persistableSettings(settings, true).openaiKey).toBe('')
    expect(persistableSettings(settings, false).openaiKey).toBe('sk-secret')
  })

  it('keeps local notes after a restart and still searches them in the built-in library', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
    })
    try {
      const note = { id: 'note-ab12cd', title: '退货政策', body: '七天无理由退款，运费另计', updatedAt: '2026-10-14' }
      saveSettings(persistableSettings({ ...defaultSettings(), localNotes: [note], openaiKey: 'sk-secret' }, true))
      const loaded = loadSettings()
      expect(loaded.localNotes).toEqual([note])
      expect(loaded.openaiKey).toBe('')
      const library = retrievalLibrary({
        source: 'builtin',
        files: [],
        notes: loaded.localNotes,
        enabledDocIds: loaded.enabledDocIds,
      })
      const hits = await createKnowledgeRetriever(library.docs).search({
        messages: [{ role: 'customer', text: '退货政策 七天无理由退款' }],
        enabledDocIds: library.enabledDocIds,
      })
      expect(hits.some((hit) => hit.id === note.id)).toBe(true)
      expect(library.fallback).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
