import type { HostActionResult, HostBridgeStatus } from '../../src/domain/wechat/hostTypes.ts'
import { MacWeChatHost } from './macHost.ts'

export interface WeChatHost {
  poll(): Promise<HostBridgeStatus>
  insertText(text: string): Promise<HostActionResult>
  sendText(text: string): Promise<HostActionResult>
}

class IdleWeChatHost implements WeChatHost {
  private platform: string
  private detail: string

  constructor(platform: string, detail: string) {
    this.platform = platform
    this.detail = detail
  }

  async poll(): Promise<HostBridgeStatus> {
    return {
      platform: this.platform,
      available: false,
      axTrusted: false,
      wechatRunning: false,
      dbReady: false,
      detail: this.detail,
      session: null,
    }
  }

  async insertText(): Promise<HostActionResult> {
    return { ok: false, handled: false, reason: this.detail }
  }

  async sendText(): Promise<HostActionResult> {
    return { ok: false, handled: false, reason: this.detail }
  }
}

export function createWeChatHost(platform = process.platform): WeChatHost {
  if (platform === 'darwin') return new MacWeChatHost()
  if (platform === 'win32') {
    return new IdleWeChatHost(platform, 'Windows 上还不能读取微信数据库或写入输入框。演示窗仍可使用。')
  }
  return new IdleWeChatHost(platform, '此环境只运行演示窗，不会连接本机微信。')
}
