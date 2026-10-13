import { spawn } from 'node:child_process'

const HEX64 = /^[0-9a-f]{64}$/

export async function querySqlcipher(dbPath: string, key: string, sql: string) {
  if (!HEX64.test(key)) throw new Error('expected 64 hex characters for raw SQLCipher key')
  if (sql.includes(key)) throw new Error('refusing to run a statement that contains key material')
  const bin = process.env.SQLCIPHER_BIN || 'sqlcipher'
  const uri = `file:${encodeURI(dbPath)}?mode=ro`
  const script = [
    `PRAGMA key = "x'${key}'";`,
    'PRAGMA cipher_compatibility = 4;',
    'PRAGMA query_only = ON;',
    'PRAGMA busy_timeout = 2000;',
    '.mode json',
    sql.trim().replace(/;$/, '') + ';',
    '',
  ].join('\n')
  const result = await run(bin, [uri], script)
  if (/ENOENT|not found/i.test(result.stderr) || result.missing) {
    throw new Error('SQLCipher 命令不存在。macOS 上可执行 brew install sqlcipher，或设置 SQLCIPHER_BIN。')
  }
  if (result.code !== 0) throw new Error('SQLCipher 打开失败')
  const json = result.stdout.trim()
  if (!json) return [] as Array<Record<string, string | null>>
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('SQLCipher 打开失败')
  }
  if (!Array.isArray(parsed)) throw new Error('SQLCipher 打开失败')
  return parsed as Array<Record<string, string | null>>
}

function run(command: string, args: string[], stdin: string) {
  return new Promise<{ stdout: string; stderr: string; code: number | null; missing: boolean }>((resolve) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    let missing = false
    let settled = false
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr: missing ? 'ENOENT' : stderr.replace(/[0-9a-fA-F]{32,}/g, '[redacted]'), code, missing })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(null)
    }, 8000)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      missing = error.code === 'ENOENT'
      finish(null)
    })
    child.on('close', (code) => finish(code))
    child.stdin.write(stdin)
    child.stdin.end()
  })
}
