import { spawn } from 'node:child_process'

export function runCommand(command: string, args: string[], timeoutMs = 2500) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result: { stdout: string; stderr: string; code: number | null }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({ stdout, stderr: stderr || 'timeout', code: null })
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      finish({ stdout, stderr: error.message, code: null })
    })
    child.on('close', (code) => {
      finish({ stdout, stderr, code })
    })
  })
}
