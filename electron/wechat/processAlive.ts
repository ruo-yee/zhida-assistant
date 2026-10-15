import { parseWeChatLiveness, wechatLivenessScript } from '../../src/dock/hostTrust.ts'
import { runCommand } from '../runCommand.ts'

/** True when NSWorkspace sees WeChat. Does not use the Accessibility API. */
export async function wechatProcessAlive() {
  if (process.platform !== 'darwin') return false
  const result = await runCommand('osascript', ['-l', 'JavaScript', '-e', wechatLivenessScript()], 2000)
  return parseWeChatLiveness(result.stdout)?.running ?? false
}
