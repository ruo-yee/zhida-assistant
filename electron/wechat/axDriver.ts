import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { electronAccessibilityTrusted } from '../accessibility.ts'
import { reconcileAxView } from '../../src/dock/hostTrust.ts'
import { wechatProcessAlive } from './processAlive.ts'

export interface AxView {
  trusted: boolean
  running: boolean
  hasWindow: boolean
  windowId: string
  title: string
  hasTextArea: boolean
  composer: string | null
  reason: string
}

const SCRIPT = `
function run(argv) {
  ObjC.import('ApplicationServices')
  ObjC.import('Cocoa')
  ObjC.import('CoreGraphics')
  var payload = { op: 'inspect', text: '', hostTrusted: false }
  try {
    if (argv[0]) {
      payload = JSON.parse(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError($(argv[0]), $.NSUTF8StringEncoding, null)))
    }
  } catch (error) {
    return JSON.stringify({ ok: false, reason: '辅助功能调用失败' })
  }
  try {
    return JSON.stringify(perform(payload.op || 'inspect', String(payload.text || ''), payload.hostTrusted ? true : false))
  } catch (error) {
    var hostTrusted = false
    var running = false
    try { hostTrusted = payload && payload.hostTrusted ? true : false } catch (inner) { hostTrusted = false }
    try { running = !!findWeChat() } catch (inner) { running = false }
    return JSON.stringify({ ok: false, trusted: hostTrusted, running: running, hasWindow: false, windowId: '', title: '', hasTextArea: false, composer: null, reason: '辅助功能调用失败' })
  }
}

function perform(op, text, hostTrusted) {
  var trusted = hostTrusted ? true : false
  if (!trusted) {
    try { trusted = $.AXIsProcessTrusted() ? true : false } catch (error) { trusted = false }
  }
  var app = null
  try { app = findWeChat() } catch (error) { app = null }
  var running = !!app
  if (!trusted) return { ok: false, trusted: false, running: running, hasWindow: false, windowId: '', title: '', hasTextArea: false, composer: null, reason: 'need-ax' }
  if (!app) return { ok: false, trusted: true, running: false, hasWindow: false, windowId: '', title: '', hasTextArea: false, composer: null, reason: 'not-running' }
  var pid = app.processIdentifier
  var root = $.AXUIElementCreateApplication(pid)
  $.AXUIElementSetMessagingTimeout(root, 0.5)
  var located = mainWindow(pid, root)
  if (!located) return { ok: false, trusted: true, running: true, hasWindow: false, windowId: '', title: '', hasTextArea: false, composer: null, reason: 'no-window' }
  var box = findInput(located.window)
  var composer = box ? axString(copyAttr(box, 'AXValue')) : null
  var title = chatTitle(located)
  if (op === 'set' || op === 'clear') {
    if (!box) return { ok: false, trusted: true, running: true, hasWindow: true, windowId: located.id, title: title, hasTextArea: false, composer: null, reason: 'no-input' }
    var err = $.AXUIElementSetAttributeValue(box, $('AXValue'), $(op === 'clear' ? '' : text))
    var after = axString(copyAttr(box, 'AXValue'))
    return { ok: err === 0, trusted: true, running: true, hasWindow: true, windowId: located.id, title: chatTitle(located), hasTextArea: true, composer: after, reason: err === 0 ? '' : 'write-failed' }
  }
  if (op === 'return') {
    pressReturn()
    delay(0.15)
    var left = box ? axString(copyAttr(box, 'AXValue')) : null
    return { ok: true, trusted: true, running: true, hasWindow: true, windowId: located.id, title: chatTitle(located), hasTextArea: !!box, composer: left, reason: '' }
  }
  return { ok: true, trusted: true, running: true, hasWindow: true, windowId: located.id, title: title, hasTextArea: !!box, composer: composer, reason: '' }
}

function findWeChat() {
  var apps = $.NSWorkspace.sharedWorkspace.runningApplications
  var names = { '微信': 1, WeChat: 1, Weixin: 1, WeChatAppEx: 1 }
  var bundles = { 'com.tencent.xinWeChat': 1, 'com.tencent.xinWeChat.WeChatAppEx': 1 }
  for (var i = 0; i < apps.count; i++) {
    var app = apps.objectAtIndex(i)
    var bid = String(app.bundleIdentifier || '')
    var name = String(app.localizedName || '')
    if (bundles[bid] || names[name]) return app
  }
  return null
}

function copyAttr(el, name) {
  if (!el) return null
  var slot = Ref()
  var err = $.AXUIElementCopyAttributeValue(el, $(name), slot)
  if (err !== 0) return null
  return slot[0]
}

function axString(value) {
  if (value === null || value === undefined) return null
  try {
    var text = ObjC.unwrap(value)
    return typeof text === 'string' ? text : String(text)
  } catch (error) {
    return null
  }
}

function childrenOf(el) {
  var raw = copyAttr(el, 'AXChildren')
  if (!raw) return []
  try {
    var list = []
    var count = raw.count
    if (typeof count === 'number') {
      for (var i = 0; i < count && i < 400; i++) list.push(raw.objectAtIndex(i))
      return list
    }
  } catch (error) {}
  return []
}

function axSize(el) {
  var raw = copyAttr(el, 'AXSize')
  if (!raw) return null
  var slot = Ref()
  var ok = $.AXValueGetValue(raw, $.kAXValueCGSizeType, slot)
  if (!ok) return null
  var size = slot[0]
  return { w: Number(size.width || size.x || 0), h: Number(size.height || size.y || 0) }
}

function findInput(window) {
  var best = null
  var bestArea = 0
  var queue = [window]
  var seen = 0
  while (queue.length && seen < 3000) {
    var el = queue.shift()
    seen += 1
    var role = axString(copyAttr(el, 'AXRole'))
    if (role === 'AXTextArea') {
      var size = axSize(el)
      var area = size ? size.w * size.h : 0
      if (area > bestArea) {
        best = el
        bestArea = area
      }
    }
    var kids = childrenOf(el)
    for (var i = 0; i < kids.length; i++) queue.push(kids[i])
  }
  if (!best || bestArea < 10000) return null
  return best
}

function mainWindow(pid, root) {
  var windows = asWindows(root)
  if (!windows.length) windows = childrenOf(root)
  var cg = cgOwnedWindow(pid)
  if (cg) {
    var matched = windows[0] || null
    for (var n = 0; n < windows.length; n++) {
      var title = axString(copyAttr(windows[n], 'AXTitle')) || ''
      if (title && title === cg.name) matched = windows[n]
    }
    if (matched) return { window: matched, id: cg.id, cgName: cg.name }
    return { window: null, id: cg.id, cgName: cg.name }
  }
  // Screen Recording granted to the app is not inherited by this osascript
  // child, so CGWindowList is often empty. AXWindows still sees WeChat.
  var ax = largestAxWindow(windows)
  if (!ax) return null
  return { window: ax.window, id: cg ? cg.id : 'ax', cgName: (cg && cg.name) || ax.title }
}

function cgOwnedWindow(pid) {
  try {
    var infos = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, $.kCGNullWindowID)
    var list = []
    try { list = ObjC.deepUnwrap(infos) || [] } catch (error) { list = [] }
    if (!list || typeof list.length !== 'number') return null
    var best = null
    for (var i = 0; i < list.length; i++) {
      var item = list[i]
      if (!item || item.kCGWindowLayer !== 0) continue
      if (item.kCGWindowOwnerPID !== pid) continue
      var bounds = item.kCGWindowBounds || {}
      var area = Number(bounds.Width || 0) * Number(bounds.Height || 0)
      if (area < 240 * 240) continue
      if (!best || area > best.area) {
        best = { id: String(item.kCGWindowNumber || ''), name: String(item.kCGWindowName || ''), area: area }
      }
    }
    return best
  } catch (error) {
    return null
  }
}

function largestAxWindow(windows) {
  var best = null
  var bestArea = 0
  var bestTitle = ''
  for (var i = 0; i < windows.length; i++) {
    var size = axSize(windows[i])
    if (!size || size.w < 240 || size.h < 240) continue
    var area = size.w * size.h
    if (area <= bestArea) continue
    best = windows[i]
    bestArea = area
    bestTitle = axString(copyAttr(windows[i], 'AXTitle')) || ''
  }
  if (!best) return null
  return { window: best, title: bestTitle }
}

function asWindows(root) {
  var raw = copyAttr(root, 'AXWindows')
  if (!raw || typeof raw.count !== 'number') return []
  var list = []
  for (var i = 0; i < raw.count; i++) list.push(raw.objectAtIndex(i))
  return list
}

function chatTitle(located) {
  var names = { '微信': 1, WeChat: 1, Weixin: 1 }
  var title = located.window ? axString(copyAttr(located.window, 'AXTitle')) || '' : ''
  if (title && !names[title]) return title
  var found = findHeader(located.window)
  if (found) return found
  if (located.cgName && !names[located.cgName]) return located.cgName
  return ''
}

function findHeader(window) {
  if (!window) return ''
  var queue = [window]
  var seen = 0
  while (queue.length && seen < 3000) {
    var el = queue.shift()
    seen += 1
    var ident = axString(copyAttr(el, 'AXIdentifier')) || ''
    if (ident === 'big_title_line_h_view') {
      var value = axString(copyAttr(el, 'AXValue')) || axString(copyAttr(el, 'AXTitle')) || ''
      if (value) return value
    }
    var kids = childrenOf(el)
    for (var i = 0; i < kids.length; i++) queue.push(kids[i])
  }
  return ''
}

function pressReturn() {
  var source = $.CGEventSourceCreate($.kCGEventSourceStateHIDSystemState)
  var down = $.CGEventCreateKeyboardEvent(source, 36, true)
  var up = $.CGEventCreateKeyboardEvent(source, 36, false)
  $.CGEventPost($.kCGHIDEventTap, down)
  $.CGEventPost($.kCGHIDEventTap, up)
}

function delay(seconds) {
  $.NSThread.sleepForTimeInterval(seconds)
}
`

function runOsascript(scriptPath: string, payloadPath: string) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
    const child = spawn('osascript', ['-l', 'JavaScript', scriptPath, payloadPath], { windowsHide: true })
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
      finish({ stdout, stderr: 'timeout', code: null })
    }, 4000)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => finish({ stdout, stderr: error.message, code: null }))
    child.on('close', (code) => finish({ stdout, stderr, code }))
  })
}

let scriptPath: string | null = null

async function scriptFile() {
  if (scriptPath) return scriptPath
  const dir = await mkdtemp(path.join(tmpdir(), 'zhida-ax-'))
  scriptPath = path.join(dir, 'ax.js')
  await writeFile(scriptPath, SCRIPT, { encoding: 'utf8', mode: 0o600 })
  return scriptPath
}

export async function runAx(op: 'inspect' | 'set' | 'clear' | 'return', text = ''): Promise<AxView> {
  const hostTrusted = electronAccessibilityTrusted()
  const dir = await mkdtemp(path.join(tmpdir(), 'zhida-ax-payload-'))
  const payloadPath = path.join(dir, 'payload.json')
  try {
    await writeFile(
      payloadPath,
      JSON.stringify({ op, text, hostTrusted }),
      { encoding: 'utf8', mode: 0o600 },
    )
    const result = await runOsascript(await scriptFile(), payloadPath)
    const parsed = parseAx(result.stdout)
    const failed = !parsed || parsed.reason === '辅助功能调用失败' || parsed.reason === '辅助功能接口不存在' || !parsed.running
    const workspaceRunning = failed ? await wechatProcessAlive() : null
    const view = parsed ?? {
      trusted: false,
      running: false,
      hasWindow: false,
      windowId: '',
      title: '',
      hasTextArea: false,
      composer: null,
      reason: /ENOENT|not found/i.test(result.stderr) ? '辅助功能接口不存在' : '辅助功能调用失败',
    }
    return reconcileAxView(view, hostTrusted, workspaceRunning)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function parseAx(stdout: string): AxView | null {
  const line = stdout.trim().split('\n').find((item) => item.startsWith('{'))
  if (!line) return null
  try {
    const raw = JSON.parse(line) as Partial<AxView>
    return {
      trusted: Boolean(raw.trusted),
      running: Boolean(raw.running),
      hasWindow: Boolean(raw.hasWindow),
      windowId: String(raw.windowId || ''),
      title: String(raw.title || ''),
      hasTextArea: Boolean(raw.hasTextArea),
      composer: raw.composer == null ? null : String(raw.composer),
      reason: String(raw.reason || ''),
    }
  } catch {
    return null
  }
}
