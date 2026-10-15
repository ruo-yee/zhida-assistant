import { DARWIN_COMPOSER_SCRIPT } from '../hostScripts.ts'
import { runCommand } from '../runCommand.ts'

/**
 * System Events text area of the visible WeChat window.
 * This is the insert path when AXWindows is empty and the in-process tree
 * has no composer. It writes the value and does not press Return.
 */
export async function readSystemComposer(): Promise<string | null> {
  return runComposer('read', '')
}

export async function writeSystemComposer(text: string): Promise<string | null> {
  return runComposer('write', text)
}

async function runComposer(mode: 'read' | 'write', text: string) {
  const result = await runCommand('osascript', ['-l', 'JavaScript', '-e', DARWIN_COMPOSER_SCRIPT, mode, text], 4000)
  const line = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith('VALUE\t') || item.startsWith('VALUE '))
  if (!line) return null
  return line.slice(6)
}
