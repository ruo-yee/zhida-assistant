import { createRequire } from 'node:module'
import { chatTitleFrom, pickChatElement, type AxRead, type Frame } from '../../src/dock/axTitle.ts'
import { realChatTitle } from '../../src/dock/sessionReport.ts'
import { usableTitle } from '../../src/domain/wechat/matchChat.ts'
import { WECHAT_OWNER_NAMES, type WeChatWindowSnapshot } from '../../src/dock/wechatWindow.ts'

const UTF8 = 0x08000100
const ON_SCREEN = 1
const PROC_ALL_PIDS = 1
const FLOAT64 = 6

export interface AxChatRead {
  state: 'visible' | 'minimized' | 'none'
  title: string
}

let bound: Native | null | undefined
let titleCache: { at: number; key: string; read: AxChatRead } | null = null
const manualPids = new Set<number>()

interface Native {
  snapshot(selfPid: number): WeChatWindowSnapshot
  chatTitle(target: Frame | null): AxChatRead
}

/**
 * In-process window server and Accessibility.
 * osascript is a different TCC client, so a grant on 智答助手 does not apply
 * to it. The reference project calls Quartz and AX in-process; this does too.
 * Docking uses only the on-screen window list. The title ladder runs separately.
 */
function lib(): Native | null {
  if (bound !== undefined) return bound
  bound = null
  if (process.platform !== 'darwin') return null
  try {
    bound = bindNative()
  } catch {
    bound = null
  }
  return bound
}

export function readOnScreenSnapshot(selfPid: number): WeChatWindowSnapshot | null {
  const api = lib()
  if (!api) return null
  try {
    return api.snapshot(selfPid)
  } catch {
    return null
  }
}

export function readAxChatTitle(target: Frame | null, hostTrusted: boolean): AxChatRead | null {
  if (!hostTrusted) return { state: 'none', title: '' }
  const key = target ? `${Math.round(target.x)}:${Math.round(target.y)}:${Math.round(target.width)}:${Math.round(target.height)}` : ''
  if (titleCache && titleCache.key === key && Date.now() - titleCache.at < 1500 && usableTitle(titleCache.read.title)) {
    return titleCache.read
  }
  const api = lib()
  if (!api) return null
  try {
    const read = api.chatTitle(target)
    if (usableTitle(read.title)) titleCache = { at: Date.now(), key, read }
    return read
  } catch {
    return null
  }
}

declare const __filename: string

function bindNative(): Native {
  // The Electron bundle is CJS, where import.meta.url is empty. __filename is
  // the bundle path, so koffi resolves next to the packaged app.
  const filename = typeof __filename === 'string' && __filename.length > 0 ? __filename : process.argv[1] || 'zhida.cjs'
  const require = createRequire(filename)
  const koffi = require('koffi') as {
    load(path: string): {
      func(definition: string): (...args: any[]) => any
      symbol(name: string): bigint
    }
    decode(ptr: bigint, type: string): unknown
  }
  const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
  const ax = koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices')
  const libc = koffi.load('/usr/lib/libSystem.B.dylib')

  const CFStringCreate = cf.func('void *CFStringCreateWithCString(void *alloc, str text, uint32 encoding)')
  const CFRelease = cf.func('void CFRelease(void *value)')
  const CFRetain = cf.func('void *CFRetain(void *value)')
  const CFGetTypeID = cf.func('uint64 CFGetTypeID(void *value)')
  const stringType = cf.func('uint64 CFStringGetTypeID()')()
  const numberType = cf.func('uint64 CFNumberGetTypeID()')()
  const dictType = cf.func('uint64 CFDictionaryGetTypeID()')()
  const arrayType = cf.func('uint64 CFArrayGetTypeID()')()
  const boolType = cf.func('uint64 CFBooleanGetTypeID()')()
  const CFStringGetCString = cf.func('uint8 CFStringGetCString(void *value, uint8_t *buffer, int64 size, uint32 encoding)')
  const CFNumberGetValue = cf.func('uint8 CFNumberGetValue(void *value, int type, _Out_ double *out)')
  const CFDictionaryGetValue = cf.func('void *CFDictionaryGetValue(void *dict, void *key)')
  const CFArrayGetCount = cf.func('int64 CFArrayGetCount(void *array)')
  const CFArrayGetValueAtIndex = cf.func('void *CFArrayGetValueAtIndex(void *array, int64 index)')
  const CFBooleanGetValue = cf.func('uint8 CFBooleanGetValue(void *value)')
  const boolTrue = koffi.decode(cf.symbol('kCFBooleanTrue'), 'void *')

  const CGWindowListCopyWindowInfo = cg.func('void *CGWindowListCopyWindowInfo(uint32 option, uint32 relative)')
  const procListPids = libc.func('int proc_listpids(uint32 type, uint32 typeinfo, void *buffer, int size)')
  const procPidPath = libc.func('int proc_pidpath(int pid, void *buffer, uint32 size)')

  const AXCreate = ax.func('void *AXUIElementCreateApplication(int pid)')
  const AXCopy = ax.func('int AXUIElementCopyAttributeValue(void *element, void *attribute, _Out_ void **value)')
  const AXSet = ax.func('int AXUIElementSetAttributeValue(void *element, void *attribute, void *value)')
  const AXTimeout = ax.func('int AXUIElementSetMessagingTimeout(void *element, float seconds)')
  const axValue = bindAxValue(ax)
  const appHidden = bindAppHidden(koffi)
  const keys = new Map<string, unknown>()
  const key = (name: string) => {
    const found = keys.get(name)
    if (found) return found
    const created = CFStringCreate(null, name, UTF8)
    if (!alive(created)) throw new Error('cfstring')
    keys.set(name, created)
    return created
  }

  const owned: unknown[] = []
  const keep = (value: unknown) => {
    if (alive(value)) owned.push(value)
    return value
  }
  const releaseOwned = () => {
    while (owned.length > 0) {
      const value = owned.pop()
      if (alive(value)) {
        try {
          CFRelease(value)
        } catch {
          /* already released */
        }
      }
    }
  }

  function readString(value: unknown) {
    if (!alive(value) || CFGetTypeID(value) !== stringType) return ''
    const buffer = Buffer.alloc(2048)
    const ok = CFStringGetCString(value, buffer, buffer.length, UTF8)
    if (!ok) return ''
    const end = buffer.indexOf(0)
    return buffer.toString('utf8', 0, end < 0 ? buffer.length : end)
  }

  function readNumber(value: unknown) {
    if (!alive(value) || CFGetTypeID(value) !== numberType) return 0
    const out = [0]
    const ok = CFNumberGetValue(value, FLOAT64, out)
    const number = Number(out[0])
    return ok && Number.isFinite(number) ? number : 0
  }

  function dictValue(dict: unknown, name: string) {
    if (!alive(dict) || CFGetTypeID(dict) !== dictType) return null
    return CFDictionaryGetValue(dict, key(name))
  }

  function copyAttr(element: unknown, name: string) {
    if (!alive(element)) return null
    const slot = [null]
    const err = Number(AXCopy(element, key(name), slot))
    if (err !== 0) return null
    return alive(slot[0]) ? slot[0] : null
  }

  function asArray(value: unknown) {
    if (!alive(value) || CFGetTypeID(value) !== arrayType) return []
    const count = Math.min(Number(CFArrayGetCount(value)) || 0, 80)
    const items: unknown[] = []
    for (let index = 0; index < count; index += 1) {
      const item = CFArrayGetValueAtIndex(value, index)
      if (!alive(item)) continue
      CFRetain(item)
      keep(item)
      items.push(item)
    }
    return items
  }

  const read: AxRead = (element, attribute) => {
    const raw = copyAttr(element, attribute)
    if (!alive(raw)) return null
    let kind: unknown = null
    try {
      kind = CFGetTypeID(raw)
      if (kind === stringType) return readString(raw)
      if (kind === boolType) return CFBooleanGetValue(raw) ? true : false
      if (kind === numberType) return readNumber(raw)
      if (kind === arrayType) return asArray(raw)
      keep(raw)
      return raw
    } finally {
      if (alive(raw) && (kind === stringType || kind === boolType || kind === numberType || kind === arrayType)) {
        CFRelease(raw)
      }
    }
  }

  function arm(element: unknown) {
    try {
      AXTimeout(element, 0.5)
    } catch {
      /* the application element already has a timeout */
    }
  }

  function minimized(element: unknown) {
    arm(element)
    const flag = read(element, 'AXMinimized')
    return flag === true || flag === 1 || flag === '1' || flag === 'true'
  }

  function elementFrame(element: unknown): Frame | null {
    if (!axValue) return null
    arm(element)
    const position = copyAttr(element, 'AXPosition')
    const size = copyAttr(element, 'AXSize')
    try {
      return axValue(position, size, (value) => (alive(value) ? CFGetTypeID(value) : null))
    } finally {
      if (alive(position)) CFRelease(position)
      if (alive(size)) CFRelease(size)
    }
  }

  function focusedChatTitle(root: unknown) {
    const focused = copyAttr(root, 'AXFocusedWindow')
    if (!alive(focused)) return ''
    keep(focused)
    if (minimized(focused)) return ''
    const text = typeof read(focused, 'AXTitle') === 'string' ? String(read(focused, 'AXTitle')) : ''
    return realChatTitle(text)
  }

  function wechatPids() {
    const buffer = Buffer.alloc(16384 * 4)
    const bytes = Number(procListPids(PROC_ALL_PIDS, 0, buffer, buffer.length))
    const count = Math.min(Math.max(Math.floor(bytes / 4), 0), 16384)
    const found: Array<{ pid: number; path: string }> = []
    for (let index = 0; index < count; index += 1) {
      const pid = buffer.readInt32LE(index * 4)
      if (pid <= 0) continue
      const path = Buffer.alloc(4096)
      const length = Number(procPidPath(pid, path, path.length))
      if (length <= 0) continue
      const file = path.toString('utf8', 0, Math.min(length, path.length)).replace(/\0/g, '')
      if (!isWeChatPath(file)) continue
      found.push({ pid, path: file })
    }
    found.sort((a, b) => rankPath(a.path) - rankPath(b.path) || a.pid - b.pid)
    return found
  }

  function windowsOnScreen() {
    const list = CGWindowListCopyWindowInfo(ON_SCREEN, 0)
    if (!alive(list)) return []
    try {
      const count = Math.min(Number(CFArrayGetCount(list)) || 0, 800)
      const windows = []
      for (let index = 0; index < count; index += 1) {
        const item = CFArrayGetValueAtIndex(list, index)
        const bounds = dictValue(item, 'kCGWindowBounds')
        windows.push({
          pid: readNumber(dictValue(item, 'kCGWindowOwnerPID')),
          layer: readNumber(dictValue(item, 'kCGWindowLayer')),
          x: readNumber(dictValue(bounds, 'X')),
          y: readNumber(dictValue(bounds, 'Y')),
          width: readNumber(dictValue(bounds, 'Width')),
          height: readNumber(dictValue(bounds, 'Height')),
          title: readString(dictValue(item, 'kCGWindowName')),
          owner: readString(dictValue(item, 'kCGWindowOwnerName')),
          id: readNumber(dictValue(item, 'kCGWindowNumber')),
        })
      }
      return windows
    } finally {
      CFRelease(list)
    }
  }

  function axWindows(root: unknown) {
    const nodes: unknown[] = []
    const main = copyAttr(root, 'AXMainWindow')
    if (alive(main)) nodes.push(keep(main))
    const raw = copyAttr(root, 'AXWindows')
    if (alive(raw)) {
      try {
        if (CFGetTypeID(raw) === arrayType) {
          for (const item of asArray(raw)) {
            if (!nodes.includes(item)) nodes.push(item)
          }
        }
      } finally {
        CFRelease(raw)
      }
    }
    return nodes
  }

  return {
    snapshot(selfPid: number): WeChatWindowSnapshot {
      const procs = wechatPids()
      const windows = windowsOnScreen()
      if (windows.length > 0 && windows.every((win) => win.width === 0 && win.height === 0)) {
        throw new Error('window-bounds')
      }
      const pids = new Set(procs.map((item) => item.pid))
      const owners = new Set<string>(WECHAT_OWNER_NAMES)
      for (const win of windows) {
        if (win.pid > 0 && owners.has(win.owner)) pids.add(win.pid)
      }
      const main = procs.find((item) => rankPath(item.path) === 0)
      return {
        pids: [...pids],
        names: pids.size > 0 ? ['微信'] : [],
        selfPid,
        windows,
        axTrusted: null,
        axBounds: null,
        appHidden: Boolean(main && appHidden(main.pid)),
        concealed: false,
      }
    },
    chatTitle(target: Frame | null): AxChatRead {
      const procs = wechatPids()
      const main = procs.find((item) => rankPath(item.path) === 0)
      if (main && appHidden(main.pid)) return { state: 'minimized', title: '' }
      let saw = false
      let visible = false
      let title = ''
      try {
        for (const proc of procs) {
          const root = AXCreate(proc.pid)
          if (!alive(root)) continue
          keep(root)
          AXTimeout(root, 0.5)
          if (!manualPids.has(proc.pid)) {
            manualPids.add(proc.pid)
            try {
              if (alive(boolTrue)) AXSet(root, key('AXManualAccessibility'), boolTrue)
            } catch {
              /* WeChat 4 exposes the tree after this; a miss is not fatal */
            }
          }
          if (rankPath(proc.path) === 0) {
            const focusedTitle = focusedChatTitle(root)
            if (focusedTitle) return { state: 'visible', title: focusedTitle }
          }
          const nodes = axWindows(root)
          if (nodes.length === 0) continue
          saw = true
          const chosen = pickChatElement(nodes, target, elementFrame, minimized)
          if (!chosen) continue
          visible = true
          const windowTitle = typeof read(chosen, 'AXTitle') === 'string' ? String(read(chosen, 'AXTitle')) : ''
          const named = chatTitleFrom(windowTitle, chosen, read)
          if (named) {
            title = named
            break
          }
        }
      } finally {
        releaseOwned()
      }
      if (title) return { state: 'visible', title }
      if (saw && !visible) return { state: 'minimized', title: '' }
      if (visible) return { state: 'visible', title: '' }
      return { state: 'none', title: '' }
    },
  }
}

function sameType(left: unknown, right: unknown) {
  return left != null && right != null && String(left) === String(right)
}

function alive(value: unknown): value is bigint | number {
  if (typeof value === 'bigint') return value !== 0n
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  return false
}

function isWeChatPath(file: string) {
  return file.includes('/WeChat.app/') || file.includes('/Weixin.app/') || file.includes('/微信.app/') || file.includes('WeChatAppEx')
}

function rankPath(file: string) {
  return /\/MacOS\/(?:WeChat|Weixin)$/.test(file) ? 0 : 1
}

type AxLib = { func(definition: string): (...args: any[]) => any }

function bindAxValue(ax: AxLib) {
  try {
    const valueType = ax.func('uint64 AXValueGetTypeID()')()
    const valueKind = ax.func('int AXValueGetType(void *value)')
    const getValue = ax.func('uint8 AXValueGetValue(void *value, int type, void *bytes)')
    return (position: unknown, size: unknown, typeOf: (value: unknown) => unknown): Frame | null => {
      try {
        if (!sameType(typeOf(position), valueType) || !sameType(typeOf(size), valueType)) return null
        if (Number(valueKind(position)) !== 1 || Number(valueKind(size)) !== 2) return null
        const point = Buffer.alloc(16)
        const box = Buffer.alloc(16)
        if (!getValue(position, 1, point) || !getValue(size, 2, box)) return null
        const width = box.readDoubleLE(0)
        const height = box.readDoubleLE(8)
        if (!(width > 0 && height > 0)) return null
        return { x: point.readDoubleLE(0), y: point.readDoubleLE(8), width, height }
      } catch {
        return null
      }
    }
  } catch {
    return null
  }
}

function bindAppHidden(koffi: { load(path: string): AxLib }) {
  try {
    const objc = koffi.load('/usr/lib/libobjc.A.dylib')
    const getClass = objc.func('void *objc_getClass(const char *name)')
    const sel = objc.func('void *sel_registerName(const char *name)')
    const msg = objc.func('void *objc_msgSend(void *self, void *sel)')
    const msgBool = objc.func('uint8 objc_msgSend(void *self, void *sel)')
    const msgInt = objc.func('int objc_msgSend(void *self, void *sel)')
    const msgCount = objc.func('uint64 objc_msgSend(void *self, void *sel)')
    const msgAt = objc.func('void *objc_msgSend(void *self, void *sel, uint64 index)')
    const shared = sel('sharedWorkspace')
    const running = sel('runningApplications')
    const countSel = sel('count')
    const atSel = sel('objectAtIndex:')
    const pidSel = sel('processIdentifier')
    const hiddenSel = sel('isHidden')
    const workspace = getClass('NSWorkspace')
    return (pid: number) => {
      try {
        const apps = msg(msg(workspace, shared), running)
        if (!alive(apps)) return false
        const count = Math.min(Number(msgCount(apps, countSel)) || 0, 400)
        for (let index = 0; index < count; index += 1) {
          const app = msgAt(apps, atSel, index)
          if (!alive(app) || Number(msgInt(app, pidSel)) !== pid) continue
          const flag = Number(msgBool(app, hiddenSel))
          return flag === 1
        }
        return false
      } catch {
        return false
      }
    }
  } catch {
    return () => false
  }
}
