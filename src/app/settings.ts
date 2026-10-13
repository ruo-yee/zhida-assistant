import { CORPUS } from '../domain/knowledge/corpus.ts'
import type { Persona } from '../domain/types.ts'

export type ThemeName = 'light' | 'dark'
export type ModelMode = 'local' | 'openai'

export interface Settings {
  theme: ThemeName
  persona: Persona
  enabledDocIds: string[]
  modelMode: ModelMode
  openaiBase: string
  openaiModel: string
  openaiKey: string
}

const KEY = 'zhida-settings'
const PERSONAS: Persona[] = ['professional', 'warm', 'technical']
const DOC_IDS = new Set(CORPUS.map((doc) => doc.id))

export function defaultSettings(): Settings {
  const envKey = import.meta.env.VITE_OPENAI_API_KEY?.trim() ?? ''
  return {
    theme: preferredTheme(),
    persona: 'professional',
    enabledDocIds: CORPUS.map((doc) => doc.id),
    modelMode: 'local',
    openaiBase: import.meta.env.VITE_OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
    openaiModel: import.meta.env.VITE_OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    openaiKey: envKey,
  }
}

export function loadSettings(): Settings {
  const fallback = defaultSettings()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Settings>
    const enabled = Array.isArray(parsed.enabledDocIds)
      ? parsed.enabledDocIds.filter((id): id is string => typeof id === 'string' && DOC_IDS.has(id))
      : fallback.enabledDocIds
    return {
      theme: parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : fallback.theme,
      persona: PERSONAS.includes(parsed.persona as Persona) ? (parsed.persona as Persona) : fallback.persona,
      enabledDocIds: enabled,
      modelMode: parsed.modelMode === 'openai' ? 'openai' : 'local',
      openaiBase: typeof parsed.openaiBase === 'string' && parsed.openaiBase.trim() ? parsed.openaiBase : fallback.openaiBase,
      openaiModel:
        typeof parsed.openaiModel === 'string' && parsed.openaiModel.trim() ? parsed.openaiModel : fallback.openaiModel,
      openaiKey: typeof parsed.openaiKey === 'string' ? parsed.openaiKey : fallback.openaiKey,
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
