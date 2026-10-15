import type { WeChatMessage } from '../wechat/WeChatBridge.ts'

const TODO = /待办|记得|别忘|明天|下周|跟进|麻烦|需要你|@/

export function isTodoLine(text: string) {
  return TODO.test(text)
}

export function sessionGlance(messages: WeChatMessage[], chatType: 'private' | 'group') {
  const recent = messages.slice(-8)
  const lastOther = [...recent].reverse().find((message) => message.role === 'customer')
  const summary = lastOther
    ? `${chatType === 'group' ? '群里最近' : '对方最近'}：${clip(lastOther.text, 42)}`
    : '还没有读到对方的消息'
  const todos = recent.filter((message) => isTodoLine(message.text)).map((message) => clip(message.text, 48))
  return { summary, todos }
}

function clip(text: string, max: number) {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max)}…` : line
}
