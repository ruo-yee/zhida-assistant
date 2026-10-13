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
  transcript: string[]
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
    return JSON.stringify({ ok: false, trusted: hostTrusted, running: running, hasWindow: false, windowId: '', title: '', hasTextArea: false, composer: null, transcript: [], reason: '辅助功能调用失败' })
  }
}

function perform(op, text, hostTrusted) {
  var trusted = hostTrusted ? true : false
  if (!trusted) {
    try { trusted = $.AXIsProcessTrusted() ? true : false } catch (error) { trusted = false }
  }
  var apps = []
  try { apps = wechatApps() } catch (error) { apps = [] }
  var running = apps.length > 0
  if (!trusted) return { ok: false, trusted: false, running: running, hasWindow: false, windowId: '', title: '', hasTextArea: false, composer: null, transcript: [], reason: 'need-ax' }
  if (!running) return { ok: false, trusted: true, running: false, hasWindow: false, windowId: '', title: '', hasTextArea: false, composer: null, transcript: [], reason: 'not-running' }
  var located = null
  for (var a = 0; a < apps.length; a++) {
    var pid = 0
    try { pid = Number(ObjC.unwrap(apps[a].processIdentifier)) } catch (error) { pid = Number(apps[a].processIdentifier) }
    if (!pid) continue
    var root = $.AXUIElementCreateApplication(pid)
    $.AXUIElementSetMessagingTimeout(root, 0.5)
    try { $.AXUIElementSetAttributeValue(root, $('AXManualAccessibility'), true) } catch (error) {}
    delay(0.2)
    located = mainWindow(pid, root)
    if (located) break
  }
  if (!located) return { ok: false, trusted: true, running: true, hasWindow: false, windowId: '', title: '', hasTextArea: false, composer: null, transcript: [], reason: 'no-window' }
  var box = findInput(located.window)
  var composer = box ? axString(copyAttr(box, 'AXValue')) : null
  var title = chatTitle(located)
  if (op === 'set' || op === 'clear') {
    if (!box) return { ok: false, trusted: true, running: true, hasWindow: true, windowId: located.id, title: title, hasTextArea: false, composer: null, transcript: [], reason: 'no-input' }
    var err = $.AXUIElementSetAttributeValue(box, $('AXValue'), $(op === 'clear' ? '' : text))
    var after = axString(copyAttr(box, 'AXValue'))
    return { ok: err === 0, trusted: true, running: true, hasWindow: true, windowId: located.id, title: chatTitle(located), hasTextArea: true, composer: after, transcript: [], reason: err === 0 ? '' : 'write-failed' }
  }
  if (op === 'return') {
    pressReturn()
    delay(0.15)
    var left = box ? axString(copyAttr(box, 'AXValue')) : null
    return { ok: true, trusted: true, running: true, hasWindow: true, windowId: located.id, title: chatTitle(located), hasTextArea: !!box, composer: left, transcript: [], reason: '' }
  }
  var lines = visibleLines(located.window, composer)
  return { ok: true, trusted: true, running: true, hasWindow: true, windowId: located.id, title: title, hasTextArea: !!box, composer: composer, transcript: lines, reason: '' }
}

function nsText(value) {
  if (value === null || value === undefined) return ''
  try {
    var text = ObjC.unwrap(value)
    return typeof text === 'string' ? text : String(text || '')
  } catch (error) {
    return String(value || '')
  }
}

function findWeChat() {
  var apps = wechatApps()
  return apps.length ? apps[0] : null
}

function wechatApps() {
  var running = $.NSWorkspace.sharedWorkspace.runningApplications
  var names = { '微信': 1, WeChat: 1, Weixin: 1, WeChatAppEx: 1 }
  var bundles = {
    'com.tencent.xinWeChat': 1,
    'com.tencent.xinWeChat.WeChatAppEx': 1,
    'com.tencent.flue.WeChatAppEx': 1
  }
  var preferred = []
  var rest = []
  for (var i = 0; i < running.count; i++) {
    var app = running.objectAtIndex(i)
    var bid = nsText(app.bundleIdentifier)
    var name = nsText(app.localizedName)
    if (bid === 'com.tencent.xinWeChat') preferred.push(app)
    else if (bundles[bid] || names[name]) rest.push(app)
  }
  return preferred.concat(rest)
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
  var windows = liveWindows(asWindows(root))
  var cg = cgOwnedWindow(pid)
  if (cg && windows.length) {
    var matched = windows[0] || null
    for (var n = 0; n < windows.length; n++) {
      var title = axString(copyAttr(windows[n], 'AXTitle')) || ''
      if (title && title === cg.name) matched = windows[n]
    }
    if (matched) return { window: matched, id: cg.id, cgName: cg.name }
  }
  var ax = windows.length ? largestAxWindow(windows) : null
  if (ax) return { window: ax.window, id: cg ? cg.id : 'ax', cgName: (cg && cg.name) || ax.title }
  // WeChat 4: CGWindowList is empty for osascript, and AXWindows count is 0.
  // AXFocusedWindow or AXMainWindow still exists after AXManualAccessibility.
  var focused = copyAttr(root, 'AXFocusedWindow') || copyAttr(root, 'AXMainWindow')
  if (!focused || windowMinimized(focused)) return null
  var focusedTitle = axString(copyAttr(focused, 'AXTitle')) || ''
  return { window: focused, id: cg ? cg.id : 'ax-focus', cgName: (cg && cg.name) || focusedTitle }
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
    if (windowMinimized(windows[i])) continue
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

function liveWindows(windows) {
  var live = []
  for (var i = 0; i < windows.length; i++) {
    if (!windowMinimized(windows[i])) live.push(windows[i])
  }
  return live
}

function windowMinimized(el) {
  if (!el) return false
  var mini = copyAttr(el, 'AXMinimized')
  try { mini = ObjC.unwrap(mini) } catch (error) {}
  if (mini === true || mini === 1 || mini === '1' || mini === 'true') return true
  var sub = axString(copyAttr(el, 'AXSubrole')) || ''
  return sub === 'AXMinimizedWindow'
}

function chatTitle(located) {
  // Window title, then the exact header, then the selected row.
  // Screen-capture OCR is not used. 「微信」 is the app name, not a chat.
  var windowTitle = isRealTitle(located.window ? (axString(copyAttr(located.window, 'AXTitle')) || '') : '')
  if (windowTitle) return windowTitle
  var header = findHeader(located.window)
  if (header) return header
  var selected = selectedRowTitle(located.window)
  if (selected) return selected
  return isRealTitle(located.cgName || '')
}

function isRealTitle(value) {
  var raw = cleanLine(value)
  if (!raw) return ''
  var stripped = raw.replace(/\\s*[(（]\\s*\\d{1,5}\\s*[)）]?\\s*$/g, '').trim()
  if (!stripped || stripped === '微信' || stripped === 'WeChat' || stripped === 'Weixin') return ''
  if (stripped === '用 AI 处理' || stripped === '用AI处理' || stripped === '图片预览' || stripped === 'Preview') return ''
  if (/^\\d{1,5}$/.test(stripped) || /^\\d{1,2}:\\d{2}$/.test(stripped)) return ''
  return raw
}

function findHeader(window) {
  if (!window) return ''
  var queue = [{ el: window, depth: 0 }]
  var seen = 0
  while (queue.length && seen < 120) {
    var item = queue.shift()
    var el = item.el
    if (!el) continue
    seen += 1
    var ident = axString(copyAttr(el, 'AXIdentifier')) || ''
    var role = axString(copyAttr(el, 'AXRole')) || ''
    if (ident === 'big_title_line_h_view' && role === 'AXStaticText') {
      var raw = axString(copyAttr(el, 'AXValue')) || ''
      if (!cleanLine(raw)) raw = axString(copyAttr(el, 'AXTitle')) || ''
      return isRealTitle(raw)
    }
    if (item.depth >= 8) continue
    var kids = childrenOf(el)
    for (var i = 0; i < kids.length; i++) queue.push({ el: kids[i], depth: item.depth + 1 })
  }
  return ''
}

function selectedRowTitle(window) {
  if (!window) return ''
  var outline = ''
  var other = ''
  var seen = 0
  function walk(el, depth) {
    if (!el || depth > 8 || seen > 120 || outline) return
    seen += 1
    var role = axString(copyAttr(el, 'AXRole')) || ''
    var rows = copyAttr(el, 'AXSelectedRows')
    if ((role === 'AXOutline' || role === 'AXTable' || role === 'AXList') && rows && typeof rows.count === 'number') {
      var limit = Math.min(rows.count, 4)
      for (var i = 0; i < limit; i++) {
        var title = rowVisibleTitle(rows.objectAtIndex(i))
        if (!title) continue
        if (role === 'AXOutline') {
          outline = title
          return
        }
        if (!other) other = title
      }
    }
    var selected = copyAttr(el, 'AXSelected')
    try { selected = ObjC.unwrap(selected) } catch (error) {}
    if ((selected === true || selected === 1) && (role === 'AXRow' || role === 'AXOutlineRow')) {
      var picked = rowVisibleTitle(el)
      if (picked) {
        if (role === 'AXOutlineRow') {
          outline = picked
          return
        }
        if (!other) other = picked
      }
    }
    if (outline || depth >= 8) return
    var kids = childrenOf(el)
    for (var k = 0; k < kids.length; k++) {
      walk(kids[k], depth + 1)
      if (outline) return
    }
  }
  walk(window, 0)
  return outline || other
}

function rowVisibleTitle(row) {
  if (!row) return ''
  var own = firstRealTitle([
    axString(copyAttr(row, 'AXTitle')),
    axString(copyAttr(row, 'AXDescription')),
    axString(copyAttr(row, 'AXValue'))
  ])
  if (own) return own
  return rowChildTitle(row, 0)
}

function rowChildTitle(el, depth) {
  if (!el || depth > 3) return ''
  var kids = childrenOf(el)
  var limit = Math.min(kids.length, 12)
  for (var i = 0; i < limit; i++) {
    var child = kids[i]
    var role = axString(copyAttr(child, 'AXRole')) || ''
    if (role === 'AXStaticText' || role === 'AXTextField' || role === 'AXButton' || role === 'AXCell' || role === '') {
      var title = firstRealTitle([
        axString(copyAttr(child, 'AXTitle')),
        axString(copyAttr(child, 'AXDescription')),
        axString(copyAttr(child, 'AXValue'))
      ])
      if (title) return title
    }
    var nested = rowChildTitle(child, depth + 1)
    if (nested) return nested
  }
  return ''
}

function firstRealTitle(values) {
  for (var i = 0; i < values.length; i++) {
    var title = isRealTitle(values[i] || '')
    if (title) return title
  }
  return ''
}

function visibleLines(window, composer) {
  if (!window) return []
  var skip = cleanLine(composer || '')
  var frame = axPoint(window)
  var placed = []
  var plain = []
  var queue = [window]
  var seen = 0
  while (queue.length && seen < 2500) {
    var el = queue.shift()
    seen += 1
    var role = axString(copyAttr(el, 'AXRole')) || ''
    if (role === 'AXStaticText') {
      var value = cleanLine(axString(copyAttr(el, 'AXValue')) || '')
      if (value.length >= 2 && value.length < 500 && value !== skip && !isChrome(value)) {
        if (plain.indexOf(value) < 0) plain.push(value)
        var box = axPoint(el)
        var inColumn = frame && box && box.x > frame.x + frame.w * 0.22 && box.y < frame.y + frame.h * 0.82 && box.y > frame.y + 36
        if (inColumn && placed.indexOf(value) < 0) placed.push(value)
      }
    }
    var kids = childrenOf(el)
    for (var i = 0; i < kids.length; i++) queue.push(kids[i])
  }
  var lines = placed.length ? placed : plain
  return lines.slice(-12)
}

function axPoint(el) {
  var raw = copyAttr(el, 'AXPosition')
  var size = axSize(el)
  if (!raw || !size) return null
  var slot = Ref()
  var ok = $.AXValueGetValue(raw, $.kAXValueCGPointType, slot)
  if (!ok) return null
  var point = slot[0]
  var x = Number(point.x || 0)
  var y = Number(point.y || 0)
  if (!isFinite(x) || !isFinite(y)) return null
  return { x: x, y: y, w: size.w, h: size.h }
}

function cleanLine(value) {
  return String(value || '').replace(/\\s+/g, ' ').trim()
}

function isChrome(value) {
  return value === '微信' || value === 'WeChat' || value === 'Weixin' || value === '搜索' || value === '聊天' || value === '通讯录'
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
      transcript: [],
      reason: /ENOENT|not found/i.test(result.stderr) ? '辅助功能接口不存在' : '辅助功能调用失败',
    }
    const reconciled = reconcileAxView(view, hostTrusted, workspaceRunning)
    return { ...reconciled, transcript: reconciled.transcript ?? [] }
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
      transcript: Array.isArray(raw.transcript)
        ? raw.transcript.map((item) => String(item)).filter(Boolean).slice(-12)
        : [],
      reason: String(raw.reason || ''),
    }
  } catch {
    return null
  }
}
