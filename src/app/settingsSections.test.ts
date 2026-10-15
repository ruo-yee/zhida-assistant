import { describe, expect, it } from 'vitest'
import { MODEL_PAGE_FIELDS, SETTINGS_SECTIONS } from './settingsSections.ts'

describe('model settings page', () => {
  it('puts 大模型 first and always lists the endpoint, key, and model name', () => {
    expect(SETTINGS_SECTIONS.map((item) => item.label)).toEqual(['大模型', '人设', '知识库', '外观'])
    expect(MODEL_PAGE_FIELDS.map((field) => field.label)).toEqual(['接口地址', 'API Key', '模型名'])
    expect(MODEL_PAGE_FIELDS.find((field) => field.id === 'base')?.placeholder).toBe('http://127.0.0.1:11434/v1')
    expect(MODEL_PAGE_FIELDS.find((field) => field.id === 'key')?.kind).toBe('secret')
  })
})
