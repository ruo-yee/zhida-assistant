import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL_BASE, DEFAULT_MODEL_NAME, SETTINGS_VERSION, migrateModelSettings, persistableSettings } from './settings.ts'

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
      modelMode: 'openai' as const,
      openaiBase: DEFAULT_MODEL_BASE,
      openaiModel: DEFAULT_MODEL_NAME,
      openaiKey: 'sk-secret',
      settingsVersion: SETTINGS_VERSION,
    }
    expect(persistableSettings(settings, true).openaiKey).toBe('')
    expect(persistableSettings(settings, false).openaiKey).toBe('sk-secret')
  })
})
