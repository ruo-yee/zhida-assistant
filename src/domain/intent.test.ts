import { describe, expect, it } from 'vitest'
import { classifyIntent } from './intent.ts'

describe('classifyIntent', () => {
  it('keeps the seeded permission question as 询问', () => {
    expect(classifyIntent('明白了，第二个问题是权限控制的最小粒度是怎样的？')).toBe('询问')
    expect(classifyIntent('你好！关于产品 FAQ，我想再确认几个问题，可以吗？')).toBe('询问')
  })

  it('separates acknowledgement from faults and purchase', () => {
    expect(classifyIntent('好的，收到，谢谢')).toBe('确认')
    expect(classifyIntent('同步失败，客户端报错了')).toBe('故障')
    expect(classifyIntent('这个功能多少钱，怎么开通')).toBe('购买')
    expect(classifyIntent('我要投诉，等太久了')).toBe('投诉')
  })
})
