import type { IntentLabel } from './types.ts'

const FAULT = /故障|报错|失败|无法|不能用|崩溃|异常|超时/
const COMPLAINT = /投诉|差评|太差|生气|失望/
const PURCHASE = /价格|报价|多少钱|购买|开通|续费|付费/
const QUESTION = /[?？]|怎么|如何|什么|怎样|吗|呢|哪|几|是否/
const ACK = /谢谢|收到|明白|好的|知晓|了解了/
const PRODUCT = /离线|同步|权限|功能|文档|FAQ|faq|接口|API|api|账号|登录|报错|缓存|角色|资源|粒度|模型/
const CHAT = /你好|您好|在吗|在不在|哈哈|呵呵|天气|吃饭|周末|早安|晚安|早上好|最近怎样|忙吗|再见|拜拜|出门/

export function intentHint(intent: IntentLabel): { tone: 'ok' | 'wait' | 'warn'; text: string } {
  switch (intent) {
    case '闲聊':
      return { tone: 'wait', text: '闲聊，不必马上回' }
    case '确认':
      return { tone: 'ok', text: '对方在确认，回一句就够' }
    case '投诉':
      return { tone: 'warn', text: '先接住情绪，再谈事情' }
    case '故障':
      return { tone: 'warn', text: '对方卡住了，宜先帮着看' }
    case '购买':
      return { tone: 'wait', text: '涉及价格，别答应资料里没有的数字' }
    default:
      return { tone: 'ok', text: '可以回，先接上对方刚才的话' }
  }
}

export function classifyIntent(text: string): IntentLabel {
  const value = text.trim()
  if (!value) return '闲聊'
  if (FAULT.test(value)) return '故障'
  if (COMPLAINT.test(value)) return '投诉'
  if (PURCHASE.test(value)) return '购买'
  const question = QUESTION.test(value)
  if (!question && ACK.test(value)) return '确认'
  if (!PRODUCT.test(value) && (CHAT.test(value) || !question)) return '闲聊'
  return '询问'
}
