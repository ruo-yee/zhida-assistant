import type { IntentLabel } from './types.ts'

const FAULT = /故障|报错|失败|无法|不能用|崩溃|异常|超时/
const COMPLAINT = /投诉|差评|太差|生气|失望/
const PURCHASE = /价格|报价|多少钱|购买|开通|续费|付费/
const QUESTION = /[?？]|怎么|如何|什么|怎样|吗|呢|哪|几|是否/
const ACK = /谢谢|收到|明白|好的|知晓|了解了/

export function classifyIntent(text: string): IntentLabel {
  const value = text.trim()
  if (!value) return '询问'
  if (FAULT.test(value)) return '故障'
  if (COMPLAINT.test(value)) return '投诉'
  if (PURCHASE.test(value)) return '购买'
  if (!QUESTION.test(value) && ACK.test(value)) return '确认'
  return '询问'
}
