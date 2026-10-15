import { describe, expect, it } from 'vitest'
import { isTodoLine, sessionGlance } from './sessionGlance.ts'

describe('sessionGlance', () => {
  it('summarizes the latest customer line and keeps todo-like lines', () => {
    const glance = sessionGlance(
      [
        { id: '1', role: 'customer', text: '大家好' },
        { id: '2', role: 'agent', text: '在的' },
        { id: '3', role: 'customer', text: '记得明天把合同发到群里' },
      ],
      'group',
    )
    expect(glance.summary).toContain('群里最近')
    expect(glance.summary).toContain('合同')
    expect(glance.todos).toEqual(['记得明天把合同发到群里'])
    expect(isTodoLine('随便聊聊')).toBe(false)
  })
})
