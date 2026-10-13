import { CORPUS } from '../domain/knowledge/corpus.ts'
import { migratePersonaSettings, type SavedPersona } from '../domain/reply/personas.ts'
import type { Persona } from '../domain/types.ts'

export type ThemeName = 'light' | 'dark'
export type ModelMode = 'local' | 'openai'

/** Local Ollama. A cloud endpoint is used only when the user or env sets one. */
export const DEFAULT_MODEL_BASE = 'http://127.0.0.1:11434/v1'
export const DEFAULT_MODEL_NAME = 'qwen2.5:7b'
export const SETTINGS_VERSION = 2
const LEGACY_CLOUD_BASE = 'https://api.openai.com/v1'

export interface Settings {
  theme: ThemeName
  persona: Persona
  activePersonaId: string
  customPersonas: SavedPersona[]
  enabledDocIds: string[]
  modelMode: ModelMode
  openaiBase: string
  openaiModel: string
  openaiKey: string
  settingsVersion: number
}

export function migrateModelSettings(
  stored: Partial<Settings> | null | undefined,
  env: { baseUrl?: string; model?: string; apiKey?: string } = {},
): Pick<Settings, 'modelMode' | 'openaiBase' | 'openaiModel' | 'openaiKey' | 'settingsVersion'> {
  const defaults = {
    modelMode: 'openai' as const,
    openaiBase: env.baseUrl?.trim() || DEFAULT_MODEL_BASE,
    openaiModel: env.model?.trim() || DEFAULT_MODEL_NAME,
    openaiKey: env.apiKey?.trim() || '',
    settingsVersion: SETTINGS_VERSION,
  }
  if (stored?.settingsVersion === SETTINGS_VERSION) {
    return {
      modelMode: stored.modelMode === 'local' ? 'local' : 'openai',
      openaiBase: typeof stored.openaiBase === 'string' && stored.openaiBase.trim() ? stored.openaiBase : defaults.openaiBase,
      openaiModel:
        typeof stored.openaiModel === 'string' && stored.openaiModel.trim() ? stored.openaiModel : defaults.openaiModel,
      openaiKey: typeof stored.openaiKey === 'string' ? stored.openaiKey : defaults.openaiKey,
      settingsVersion: SETTINGS_VERSION,
    }
  }
  if (stored?.modelMode === 'openai' && typeof stored.openaiBase === 'string' && stored.openaiBase.trim()) {
    return {
      modelMode: 'openai',
      openaiBase: stored.openaiBase,
      openaiModel:
        typeof stored.openaiModel === 'string' && stored.openaiModel.trim() ? stored.openaiModel : defaults.openaiModel,
      openaiKey: typeof stored.openaiKey === 'string' ? stored.openaiKey : defaults.openaiKey,
      settingsVersion: SETTINGS_VERSION,
    }
  }
  const savedBase = typeof stored?.openaiBase === 'string' ? stored.openaiBase.trim().replace(/\/$/, '') : ''
  const savedModel = typeof stored?.openaiModel === 'string' ? stored.openaiModel.trim() : ''
  return {
    modelMode: 'openai',
    openaiBase: savedBase && savedBase !== LEGACY_CLOUD_BASE ? stored?.openaiBase?.trim() || defaults.openaiBase : defaults.openaiBase,
    openaiModel: savedModel && savedModel !== 'gpt-4o-mini' ? savedModel : defaults.openaiModel,
    openaiKey: typeof stored?.openaiKey === 'string' ? stored.openaiKey : defaults.openaiKey,
    settingsVersion: SETTINGS_VERSION,
  }
}

const KEY = 'zhida-settings'
const PERSONAS: Persona[] = ['professional', 'warm', 'technical']
const DOC_IDS = new Set(CORPUS.map((doc) => doc.id))

export function defaultSettings(): Settings {
  const model = migrateModelSettings(null, {
    baseUrl: import.meta.env.VITE_OPENAI_BASE_URL,
    model: import.meta.env.VITE_OPENAI_MODEL,
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  })
  return {
    theme: preferredTheme(),
    persona: 'professional',
    activePersonaId: 'support',
    customPersonas: [],
    enabledDocIds: CORPUS.map((doc) => doc.id),
    ...model,
  }
}

export function loadSettings(): Settings {
  const fallback = defaultSettings()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Settings> & { personaRole?: unknown; customPersona?: unknown }
    const enabled = Array.isArray(parsed.enabledDocIds)
      ? parsed.enabledDocIds.filter((id): id is string => typeof id === 'string' && DOC_IDS.has(id))
      : fallback.enabledDocIds
    const personas = migratePersonaSettings(parsed)
    const model = migrateModelSettings(parsed, {
      baseUrl: import.meta.env.VITE_OPENAI_BASE_URL,
      model: import.meta.env.VITE_OPENAI_MODEL,
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    })
    return {
      theme: parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : fallback.theme,
      persona: PERSONAS.includes(parsed.persona as Persona) ? (parsed.persona as Persona) : fallback.persona,
      activePersonaId: personas.activePersonaId,
      customPersonas: personas.customPersonas,
      enabledDocIds: enabled,
      ...model,
    }
  } catch {
    return fallback
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

function preferredTheme(): ThemeName {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
