export const SETTINGS_SECTIONS = [
  { id: 'model', label: '大模型' },
  { id: 'persona', label: '人设' },
  { id: 'knowledge', label: '知识库' },
  { id: 'look', label: '外观' },
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']

/** Fields on the 大模型 page. They stay visible whether or not the model is on. */
export const MODEL_PAGE_FIELDS = [
  {
    id: 'base',
    label: '接口地址',
    placeholder: 'http://127.0.0.1:11434/v1',
    kind: 'url',
  },
  {
    id: 'key',
    label: 'API Key',
    placeholder: '本机 Ollama 可留空',
    kind: 'secret',
  },
  {
    id: 'model',
    label: '模型名',
    placeholder: 'qwen2.5:7b',
    kind: 'text',
  },
] as const

export type ModelPageFieldId = (typeof MODEL_PAGE_FIELDS)[number]['id']
