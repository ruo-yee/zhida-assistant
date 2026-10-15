import { createRequire } from 'node:module'
import { MAX_INPUT_NODES, composerPoint, pickLargestTextArea, type TextAreaShape } from '../../src/dock/axComposer.ts'
import { chatTitleFrom, pickChatElement, type AxRead, type Frame } from '../../src/dock/axTitle.ts'
import { realChatTitle } from '../../src/dock/sessionReport.ts'
import { usableTitle } from '../../src/domain/wechat/matchChat.ts'
import {
  chooseChatWindow,
  mergeChatWindows,
  WECHAT_OWNER_NAMES,
  type ListedWindow,
  type WeChatWindowSnapshot,
} from '../../src/dock/wechatWindow.ts'

const UTF8 = 0x08000100
const ON_SCREEN = 1
const ALL_WINDOWS = 0
const INCLUDING_WINDOW = 8
const IMAGE_IGNORE_FRAMING = 1
const PROC_ALL_PIDS = 1
const FLOAT64 = 6

export interface AxChatRead {
  state: 'visible' | 'minimized' | 'none'
  title: string
}

export interface AxComposer {
  found: boolean
  value: string | null
  title: string
}

let bound: Native | null | undefined
let titleCache: { at: number; key: string; read: AxChatRead } | null = null

interface Native {
  snapshot(selfPid: number): WeChatWindowSnapshot
  chatTitle(target: Frame | null): AxChatRead
  composer(target: Frame | null, text: string | null): AxComposer
  screenGranted(): boolean
  captureTitle(windowId: number, crop: Frame, file: string): boolean
  chatWindowId(): number
  insertText(target: Frame | null, text: string, title: string): InsertAttempt
}

export interface InsertAttempt {
  ok: boolean
  reason: string
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

export function readAxComposer(target: Frame | null, hostTrusted: boolean): AxComposer | null {
  if (!hostTrusted) return null
  const api = lib()
  if (!api) return null
  try {
    return api.composer(target, null)
  } catch {
    return null
  }
}

/**
 * `wechat_send.insert_text`. Writes the largest text area, or pastes into
 * the composer point when WeChat 4 has none. Never presses Return.
 */
export function insertWeChatText(target: Frame | null, text: string, title: string, hostTrusted: boolean): InsertAttempt | null {
  if (!hostTrusted) return null
  const api = lib()
  if (!api) return null
  try {
    return api.insertText(target, text, title)
  } catch {
    return null
  }
}

/** Write the composer in this process. Null means Accessibility could not be called. */
export function writeAxComposer(target: Frame | null, text: string, hostTrusted: boolean): AxComposer | null {
  if (!hostTrusted) return null
  const api = lib()
  if (!api) return null
  try {
    return api.composer(target, text)
  } catch {
    return null
  }
}

/** In-process Screen Recording preflight. Null when this process cannot ask. */
export function screenCaptureGranted(): boolean | null {
  const api = lib()
  if (!api) return null
  try {
    return api.screenGranted()
  } catch {
    return null
  }
}

/**
 * Capture the title band inside this process. A grant on 智答助手 does not
 * apply to osascript, so the preflight must not run there.
 */
export function writeTitleCapture(windowId: number, crop: Frame, file: string): boolean {
  const api = lib()
  if (!api) return false
  try {
    return api.captureTitle(windowId, crop, file)
  } catch {
    return false
  }
}

/** Window id for OCR. The full list is used when the on-screen list omits WeChat. */
export function readChatWindowId(): number {
  const api = lib()
  if (!api) return 0
  try {
    return api.chatWindowId()
  } catch {
    return 0
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
    opaque(name: string): unknown
    struct(name: string, fields: Record<string, string>): unknown
  }
  const cf = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
  const cg = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
  const ax = loadAx(koffi)
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
  const boolTrue = loadBooleanTrue()

  function loadBooleanTrue() {
    const accept = (value: unknown) => {
      if (!alive(value)) return null
      try {
        if (!sameType(CFGetTypeID(value), boolType)) return null
        if (Number(CFBooleanGetValue(value)) !== 1) return null
        return value
      } catch {
        return null
      }
    }
    const fromSymbol = (symbol: unknown) => {
      if (!alive(symbol)) return null
      try {
        return accept(koffi.decode(symbol as bigint, 'void *'))
      } catch {
        return null
      }
    }
    try {
      const decoded = fromSymbol(cf.symbol('kCFBooleanTrue'))
      if (decoded) return decoded
    } catch {
      /* the symbol name can fail to resolve; dlsym is the same constant */
    }
    try {
      const dlsym = libc.func('void *dlsym(void *handle, const char *name)')
      // RTLD_DEFAULT is (void *) -2. A JS number does not survive as that pointer.
      const symbol = dlsym(BigInt('18446744073709551614'), 'kCFBooleanTrue')
      const decoded = fromSymbol(symbol)
      if (decoded) return decoded
    } catch {
      /* RTLD_DEFAULT is unavailable */
    }
    try {
      const objc = koffi.load('/usr/lib/libobjc.A.dylib')
      const getClass = objc.func('void *objc_getClass(const char *name)')
      const sel = objc.func('void *sel_registerName(const char *name)')
      const msg = objc.func('void *objc_msgSend(void *self, void *sel, uint8 value)')
      const created = msg(getClass('NSNumber'), sel('numberWithBool:'), 1)
      const decoded = accept(created)
      if (decoded) return decoded
    } catch {
      /* a CFBoolean is required; an NSNumber of the wrong type is ignored */
    }
    return null
  }

  const CGWindowListCopyWindowInfo = cg.func('void *CGWindowListCopyWindowInfo(uint32 option, uint32 relative)')
  const procListPids = libc.func('int proc_listpids(uint32 type, uint32 typeinfo, void *buffer, int size)')
  const procPidPath = libc.func('int proc_pidpath(int pid, void *buffer, uint32 size)')

  const AXCreate = ax.func('void *AXUIElementCreateApplication(int pid)')
  // CFTypeRef is already a pointer. The out argument is CFTypeRef *, which is
  // CFType **. Koffi only copies a named opaque double pointer into the array;
  // `_Out_ void **` leaves the slot null, so every attribute read was empty.
  koffi.opaque('CFType')
  const AXCopy = ax.func('int AXUIElementCopyAttributeValue(void *element, void *attribute, _Out_ CFType **value)')
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

  function isKind(value: unknown, typeId: unknown) {
    return alive(value) && sameType(CFGetTypeID(value), typeId)
  }

  function readString(value: unknown) {
    if (!isKind(value, stringType)) return ''
    const buffer = Buffer.alloc(8192)
    const ok = CFStringGetCString(value, buffer, buffer.length, UTF8)
    if (!ok) return ''
    const end = buffer.indexOf(0)
    return buffer.toString('utf8', 0, end < 0 ? buffer.length : end)
  }

  function readNumber(value: unknown) {
    if (!isKind(value, numberType)) return 0
    const out = [0]
    const ok = CFNumberGetValue(value, FLOAT64, out)
    const number = Number(out[0])
    return ok && Number.isFinite(number) ? number : 0
  }

  function dictValue(dict: unknown, name: string) {
    if (!isKind(dict, dictType)) return null
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
    if (!isKind(value, arrayType)) return []
    const count = Math.min(Number(CFArrayGetCount(value)) || 0, 512)
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
      if (sameType(kind, stringType)) return readString(raw)
      if (sameType(kind, boolType)) return CFBooleanGetValue(raw) ? true : false
      if (sameType(kind, numberType)) return readNumber(raw)
      if (sameType(kind, arrayType)) return asArray(raw)
      keep(raw)
      return raw
    } finally {
      if (alive(raw) && (sameType(kind, stringType) || sameType(kind, boolType) || sameType(kind, numberType) || sameType(kind, arrayType))) {
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

  function copyWindowList(option: number): ListedWindow[] {
    const list = CGWindowListCopyWindowInfo(option, 0)
    if (!alive(list)) return []
    try {
      const count = Math.min(Number(CFArrayGetCount(list)) || 0, 800)
      const windows: ListedWindow[] = []
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

  function windowsOnScreen() {
    return copyWindowList(ON_SCREEN)
  }

  /** Pids that own a WeChat window, including ones the on-screen list omits. */
  function chatProcesses() {
    const procs = wechatPids()
    const known = new Set(procs.map((item) => item.pid))
    const owners = new Set<string>(WECHAT_OWNER_NAMES)
    let listed: ListedWindow[] = []
    try {
      listed = [...copyWindowList(ON_SCREEN), ...copyWindowList(ALL_WINDOWS)]
    } catch {
      listed = []
    }
    for (const win of listed) {
      if (win.pid <= 0 || known.has(win.pid)) continue
      if (!owners.has(win.owner) && win.title !== '微信') continue
      known.add(win.pid)
      procs.push({ pid: win.pid, path: '' })
    }
    return procs
  }

  function axWindows(root: unknown) {
    const nodes: unknown[] = []
    const focused = copyAttr(root, 'AXFocusedWindow')
    if (alive(focused)) nodes.push(keep(focused))
    const main = copyAttr(root, 'AXMainWindow')
    if (alive(main) && !nodes.includes(main)) nodes.push(keep(main))
    const raw = copyAttr(root, 'AXWindows')
    if (alive(raw)) {
      try {
        if (sameType(CFGetTypeID(raw), arrayType)) {
          for (const item of asArray(raw)) {
            if (!nodes.includes(item)) nodes.push(item)
          }
        }
      } finally {
        CFRelease(raw)
      }
    }
    // The focused control's window still exists when AXWindows is empty.
    const focusedElement = copyAttr(root, 'AXFocusedUIElement')
    if (alive(focusedElement)) {
      const via = copyAttr(focusedElement, 'AXWindow')
      if (alive(via) && !nodes.includes(via)) nodes.push(keep(via))
      if (alive(focusedElement) && focusedElement !== via) {
        try {
          CFRelease(focusedElement)
        } catch {
          /* the window keeps its own reference */
        }
      }
    }
    // WeChat 4 can leave AXWindows empty and AXMainWindow at -25212 while a
    // window still sits under AXChildren. Menu bars are not windows.
    if (nodes.length === 0) collectChildWindows(root, nodes, 0)
    return nodes
  }

  function collectChildWindows(element: unknown, nodes: unknown[], depth: number) {
    if (depth > 2 || nodes.length > 8) return
    const children = read(element, 'AXChildren')
    if (!Array.isArray(children)) return
    for (const child of children) {
      const role = typeof read(child, 'AXRole') === 'string' ? String(read(child, 'AXRole')) : ''
      if (role === 'AXWindow') {
        if (!nodes.includes(child)) nodes.push(child)
        continue
      }
      if (role === 'AXMenuBar' || role === 'AXMenuBarItem') continue
      collectChildWindows(child, nodes, depth + 1)
    }
  }

  const screenCheck = bindScreenCheck()
  const saveTitleImage = bindTitleCapture()

  function bindScreenCheck(): (() => boolean) | null {
    try {
      const preflight = cg.func('uint8 CGPreflightScreenCaptureAccess()')
      return () => {
        try {
          return Number(preflight()) === 1
        } catch {
          return false
        }
      }
    } catch {
      return null
    }
  }

  function bindTitleCapture(): ((windowId: number, crop: Frame, file: string) => boolean) | null {
    try {
      koffi.struct('ZhidaRect', { x: 'double', y: 'double', width: 'double', height: 'double' })
      const createImage = cg.func('void *CGWindowListCreateImage(ZhidaRect rect, uint32 options, uint32 windowId, uint32 imageOptions)')
      const releaseImage = cg.func('void CGImageRelease(void *image)')
      const imageio = koffi.load('/System/Library/Frameworks/ImageIO.framework/ImageIO')
      const destCreate = imageio.func('void *CGImageDestinationCreateWithURL(void *url, void *type, size_t count, void *options)')
      const destAdd = imageio.func('void CGImageDestinationAddImage(void *dest, void *image, void *props)')
      const destFinal = imageio.func('uint8 CGImageDestinationFinalize(void *dest)')
      const urlCreate = cf.func('void *CFURLCreateWithFileSystemPath(void *alloc, void *path, int style, uint8 isDir)')
      return (windowId, crop, file) => {
        const rect = { x: crop.x, y: crop.y, width: crop.width, height: crop.height }
        let image = windowId > 0 ? createImage(rect, INCLUDING_WINDOW, windowId, IMAGE_IGNORE_FRAMING) : null
        if (!alive(image)) image = createImage(rect, ON_SCREEN, 0, IMAGE_IGNORE_FRAMING)
        if (!alive(image)) return false
        const pathString = CFStringCreate(null, file, UTF8)
        const url = alive(pathString) ? urlCreate(null, pathString, 0, 0) : null
        const dest = alive(url) ? destCreate(url, key('public.png'), 1, null) : null
        let ok = false
        try {
          if (alive(dest)) {
            destAdd(dest, image, null)
            ok = Number(destFinal(dest)) === 1
          }
        } finally {
          if (alive(dest)) CFRelease(dest)
          if (alive(url)) CFRelease(url)
          if (alive(pathString)) CFRelease(pathString)
          releaseImage(image)
        }
        return ok
      }
    } catch {
      return null
    }
  }

  function activateWeChat(procs: Array<{ pid: number; path: string }>) {
    const wanted = new Set(procs.map((item) => item.pid))
    if (wanted.size === 0) return
    try {
      const objc = koffi.load('/usr/lib/libobjc.A.dylib')
      const getClass = objc.func('void *objc_getClass(const char *name)')
      const sel = objc.func('void *sel_registerName(const char *name)')
      const msg = objc.func('void *objc_msgSend(void *self, void *sel)')
      const msgCount = objc.func('uint64 objc_msgSend(void *self, void *sel)')
      const msgAt = objc.func('void *objc_msgSend(void *self, void *sel, uint64 index)')
      const msgInt = objc.func('int objc_msgSend(void *self, void *sel)')
      const msgActivate = objc.func('void objc_msgSend(void *self, void *sel, uint64 flags)')
      const apps = msg(msg(getClass('NSWorkspace'), sel('sharedWorkspace')), sel('runningApplications'))
      if (!alive(apps)) return
      const count = Math.min(Number(msgCount(apps, sel('count'))) || 0, 400)
      for (let index = 0; index < count; index += 1) {
        const app = msgAt(apps, sel('objectAtIndex:'), index)
        if (!alive(app) || !wanted.has(Number(msgInt(app, sel('processIdentifier'))))) continue
        try {
          msgActivate(app, sel('activateWithOptions:'), 2)
        } catch {
          try {
            msg(app, sel('activate'))
          } catch {
            /* AXFocused on the text area still applies when WeChat is already front */
          }
        }
      }
    } catch {
      /* bringing WeChat forward is optional; the write does not click */
    }
  }

  const warmed = new Set<number>()
  let pumpRunLoop: ((seconds: number) => void) | null = null
  try {
    const runMode = cf.func('int32 CFRunLoopRunInMode(void *mode, double seconds, uint8 returnAfterSourceHandled)')
    const mode = koffi.decode(cf.symbol('kCFRunLoopDefaultMode'), 'void *')
    if (alive(mode)) {
      pumpRunLoop = (seconds) => {
        try {
          runMode(mode, seconds, 0)
        } catch {
          /* a missed pump still leaves the next poll to read the tree */
        }
      }
    }
  } catch {
    pumpRunLoop = null
  }

  // Cmd+V only. Key code 36 is Return and is never posted on this path.
  const KEY_V = 9
  const COMMAND_FLAG = 0x100000
  let postClick: (point: { x: number; y: number }) => boolean = () => false
  let postPaste: () => boolean = () => false
  try {
    koffi.struct('ZhidaPoint', { x: 'double', y: 'double' })
    const createMouse = cg.func('void *CGEventCreateMouseEvent(void *source, uint32 type, ZhidaPoint point, uint32 button)')
    const createKey = cg.func('void *CGEventCreateKeyboardEvent(void *source, uint16 key, uint8 down)')
    const setFlags = cg.func('void CGEventSetFlags(void *event, uint64 flags)')
    const postEvent = cg.func('void CGEventPost(uint32 tap, void *event)')
    const setField = cg.func('void CGEventSetIntegerValueField(void *event, uint32 field, int64 value)')
    postClick = (point) => {
      let down: unknown = null
      let up: unknown = null
      try {
        down = createMouse(null, 1, point, 0)
        up = createMouse(null, 2, point, 0)
        if (!alive(down) || !alive(up)) return false
        setField(down, 1, 1)
        setField(up, 1, 1)
        postEvent(0, down)
        postEvent(0, up)
        return true
      } catch {
        return false
      } finally {
        if (alive(down)) CFRelease(down)
        if (alive(up)) CFRelease(up)
      }
    }
    postPaste = () => {
      let down: unknown = null
      let up: unknown = null
      try {
        down = createKey(null, KEY_V, 1)
        up = createKey(null, KEY_V, 0)
        if (!alive(down) || !alive(up)) return false
        setFlags(down, COMMAND_FLAG)
        postEvent(0, down)
        pumpRunLoop?.(0.01)
        setFlags(up, COMMAND_FLAG)
        postEvent(0, up)
        return true
      } catch {
        return false
      } finally {
        if (alive(down)) CFRelease(down)
        if (alive(up)) CFRelease(up)
      }
    }
  } catch {
    postClick = () => false
    postPaste = () => false
  }

  let pauseUnpumped: (seconds: number) => void = () => {}
  try {
    const usleep = libc.func('int usleep(uint32 usec)')
    pauseUnpumped = (seconds) => {
      usleep(Math.max(0, Math.min(2_000_000, Math.round(seconds * 1_000_000))))
    }
  } catch {
    pauseUnpumped = () => {}
  }

  function pause(seconds: number) {
    if (pumpRunLoop) pumpRunLoop(seconds)
    else pauseUnpumped(seconds)
  }

  // WeChat builds the accessibility tree after AXManualAccessibility, on its
  // own run loop. Reading in the same turn only sees the menu bar.
  function expose(root: unknown, pid: number) {
    AXTimeout(root, 0.5)
    let err = 0
    try {
      if (alive(boolTrue)) err = Number(AXSet(root, key('AXManualAccessibility'), boolTrue))
    } catch {
      err = -1
    }
    if (err === -25205 && alive(boolTrue)) {
      try {
        AXSet(root, key('AXEnhancedUserInterface'), boolTrue)
      } catch {
        /* the legacy flag is optional */
      }
    }
    if (warmed.has(pid)) return
    if (axWindows(root).length > 0) {
      warmed.add(pid)
      return
    }
    const pump = pumpRunLoop
    if (pump) {
      for (let step = 0; step < 8; step += 1) {
        pump(0.06)
        if (axWindows(root).length > 0) break
      }
    }
    warmed.add(pid)
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
      const procs = chatProcesses()
      const main = procs.find((item) => rankPath(item.path) === 0)
      // A docked on-screen frame means the chat is visible. A flaky isHidden
      // must not skip the tree, or the session stays 「当前微信会话」.
      if (!target && main && appHidden(main.pid)) return { state: 'minimized', title: '' }
      let saw = false
      let visible = false
      let title = ''
      try {
        for (const proc of procs) {
          const root = AXCreate(proc.pid)
          if (!alive(root)) continue
          keep(root)
          expose(root, proc.pid)
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
    composer(target: Frame | null, text: string | null): AxComposer {
      const empty: AxComposer = { found: false, value: null, title: '' }
      const procs = chatProcesses()
      const main = procs.find((item) => rankPath(item.path) === 0)
      if (!target && main && appHidden(main.pid)) return empty
      try {
        if (text !== null && target) {
          activateWeChat(procs)
          const pump = pumpRunLoop
          if (pump) pump(0.08)
        }
        for (const proc of procs) {
          const root = AXCreate(proc.pid)
          if (!alive(root)) continue
          keep(root)
          expose(root, proc.pid)
          const nodes = axWindows(root)
          if (nodes.length === 0) continue
          const chosen = pickChatElement(nodes, target, elementFrame, minimized)
          if (!chosen) continue
          const windowTitle = typeof read(chosen, 'AXTitle') === 'string' ? String(read(chosen, 'AXTitle')) : ''
          const title = chatTitleFrom(windowTitle, chosen, read)
          const box = findComposer(chosen)
          if (!box) continue
          if (text === null) {
            const value = read(box, 'AXValue')
            return { found: true, value: typeof value === 'string' ? value : '', title }
          }
          const current = read(box, 'AXValue')
          if (typeof current === 'string' && current.trim() && current.trim() !== text.trim()) {
            return { found: true, value: current, title: chatTitleFrom(windowTitle, chosen, read) || title }
          }
          const after = assignText(box, text)
          return { found: true, value: after, title: chatTitleFrom(windowTitle, chosen, read) || title }
        }
      } finally {
        releaseOwned()
      }
      return empty
    },
    screenGranted() {
      return screenCheck ? screenCheck() : false
    },
    captureTitle(windowId: number, crop: Frame, file: string) {
      if (!saveTitleImage) return false
      try {
        return saveTitleImage(windowId, crop, file)
      } catch {
        return false
      }
    },
    chatWindowId() {
      try {
        const procs = wechatPids()
        const onScreen = copyWindowList(ON_SCREEN)
        const all = copyWindowList(ALL_WINDOWS)
        const pids = new Set(procs.map((item) => item.pid))
        const owners = new Set<string>(WECHAT_OWNER_NAMES)
        for (const win of [...onScreen, ...all]) {
          if (win.pid > 0 && owners.has(win.owner)) pids.add(win.pid)
        }
        const merged = mergeChatWindows(onScreen, all, [...pids])
        const pool = merged.filter((win) => win.layer === 0 && (pids.has(win.pid) || owners.has(win.owner)))
        const chosen = chooseChatWindow(pool)
        return chosen && chosen.width >= 240 && chosen.height >= 240 ? chosen.id : 0
      } catch {
        return 0
      }
    },
    insertText(target: Frame | null, text: string, title: string): InsertAttempt {
      if (!target) return { ok: false, reason: '没找到微信主窗口（微信可能已最小化或隐藏）' }
      try {
        const box = readBox(target)
        if (!box.element) return insertByPaste(target, text, title)
        if (box.value === null) return { ok: false, reason: '输入框文字不可读取' }
        if (box.value.trim()) return { ok: false, reason: '输入框已有草稿，未覆盖' }
        if (!setValue(box.element, text)) return { ok: false, reason: '写入微信输入框失败' }
        activateUntilFront(chatProcesses())
        focusBox(box.element)
        return confirmInserted(box.element, target, text, title)
      } finally {
        releaseOwned()
      }
    },
  }

  function mainWeChatPid(procs: Array<{ pid: number; path: string }>) {
    return procs.find((item) => rankPath(item.path) === 0)?.pid ?? 0
  }

  function objcKit() {
    const objc = koffi.load('/usr/lib/libobjc.A.dylib')
    const getClass = objc.func('void *objc_getClass(const char *name)')
    const sel = objc.func('void *sel_registerName(const char *name)')
    return {
      getClass,
      sel,
      msg0: objc.func('void *objc_msgSend(void *self, void *sel)'),
      msgCount: objc.func('uint64 objc_msgSend(void *self, void *sel)'),
      msgAt: objc.func('void *objc_msgSend(void *self, void *sel, uint64 index)'),
      msgInt: objc.func('int objc_msgSend(void *self, void *sel)'),
      msg1: objc.func('void *objc_msgSend(void *self, void *sel, void *arg)'),
      msgData: objc.func('void *objc_msgSend(void *self, void *sel, void *bytes, uint64 length)'),
      msgSet: objc.func('uint8 objc_msgSend(void *self, void *sel, void *data, void *type)'),
      retain: objc.func('void *objc_retain(void *value)'),
      release: objc.func('void objc_release(void *value)'),
    }
  }

  let kit: ReturnType<typeof objcKit> | null | undefined
  function appKit() {
    if (kit !== undefined) return kit
    try {
      kit = objcKit()
    } catch {
      kit = null
    }
    return kit
  }

  function frontPid() {
    const bridge = appKit()
    if (!bridge) return 0
    try {
      const front = bridge.msg0(bridge.msg0(bridge.getClass('NSWorkspace'), bridge.sel('sharedWorkspace')), bridge.sel('frontmostApplication'))
      if (!alive(front)) return 0
      return Number(bridge.msgInt(front, bridge.sel('processIdentifier'))) || 0
    } catch {
      return 0
    }
  }

  function activateUntilFront(procs: Array<{ pid: number; path: string }>) {
    const pid = mainWeChatPid(procs)
    if (pid <= 0) return false
    if (frontPid() === pid) return true
    activateWeChat(procs.filter((item) => item.pid === pid))
    const deadline = Date.now() + 600
    while (Date.now() < deadline) {
      pause(0.04)
      if (frontPid() === pid) return true
    }
    return frontPid() === pid
  }

  function chatStill(beforeTitle: string, afterTitle: string) {
    const before = usableTitle(beforeTitle)
    const after = usableTitle(afterTitle)
    return Boolean(before) && before === after
  }

  function readBox(target: Frame) {
    let title = ''
    for (const proc of chatProcesses()) {
      const root = AXCreate(proc.pid)
      if (!alive(root)) continue
      keep(root)
      expose(root, proc.pid)
      const nodes = axWindows(root)
      if (nodes.length === 0) continue
      const chosen = pickChatElement(nodes, target, elementFrame, minimized)
      if (!chosen) continue
      const windowTitle = typeof read(chosen, 'AXTitle') === 'string' ? String(read(chosen, 'AXTitle')) : ''
      const named = chatTitleFrom(windowTitle, chosen, read)
      if (named) title = named
      const element = findComposer(chosen)
      if (!element) continue
      const raw = read(element, 'AXValue')
      return { element, value: typeof raw === 'string' ? raw : null, title: named || title }
    }
    return { element: null as unknown, value: null as string | null, title }
  }

  function setValue(element: unknown, text: string) {
    const created = CFStringCreate(null, text, UTF8)
    if (!alive(created)) return false
    try {
      return Number(AXSet(element, key('AXValue'), created)) === 0
    } catch {
      return false
    } finally {
      CFRelease(created)
    }
  }

  function focusBox(element: unknown) {
    if (!alive(boolTrue)) return
    try {
      AXSet(element, key('AXFocused'), boolTrue)
    } catch {
      /* focus is a convenience */
    }
  }

  function clearComposer(element: unknown) {
    if (!setValue(element, '')) return false
    const value = read(element, 'AXValue')
    return typeof value === 'string' && !value.trim()
  }

  function confirmInserted(element: unknown, target: Frame, text: string, beforeTitle: string): InsertAttempt {
    const landed = read(element, 'AXValue')
    if (typeof landed !== 'string' || landed.trim() !== text) return { ok: false, reason: '写入后校验失败' }
    if (!chatStill(beforeTitle, readBox(target).title)) {
      if (clearComposer(element)) return { ok: false, reason: '当前微信会话已变化，已撤回插入，未发送' }
      return { ok: false, reason: '当前微信会话已变化，未发送；输入框里仍有内容，请手动清空' }
    }
    return { ok: true, reason: '已插入' }
  }

  function composerMatching(target: Frame, text: string) {
    const box = readBox(target)
    if (!box.element || typeof box.value !== 'string' || box.value.trim() !== text) return null
    return box.element
  }

  function awaitPastedComposer(target: Frame, text: string) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const box = composerMatching(target, text)
      if (box) return box
      if (attempt + 1 < 8) pause(0.06)
    }
    return null
  }

  function pastePlain(text: string) {
    const bridge = appKit()
    if (!bridge) return false
    const memcpy = libc.func('void *memcpy(void *dst, void *src, size_t n)')
    const board = bridge.msg0(bridge.getClass('NSPasteboard'), bridge.sel('generalPasteboard'))
    if (!alive(board)) return false
    let saved: Array<Array<{ kind: string; data: Buffer }>>
    try {
      saved = snapshotPasteboard(bridge, memcpy, board)
    } catch {
      return false
    }
    let pasted = false
    try {
      bridge.msgCount(board, bridge.sel('clearContents'))
      if (!setPasteString(bridge, board, text)) return false
      pasted = postPaste()
      if (pasted) pause(0.35)
      return pasted
    } finally {
      try {
        restorePasteboard(bridge, board, saved)
      } catch {
        /* the clipboard is restored when the pasteboard bridge still answers */
      }
    }
  }

  function snapshotPasteboard(
    bridge: NonNullable<ReturnType<typeof appKit>>,
    memcpy: (dst: Buffer, src: unknown, n: number) => unknown,
    board: unknown,
  ) {
    const items = bridge.msg0(board, bridge.sel('pasteboardItems'))
    if (!alive(items)) return []
    const count = Math.min(Number(bridge.msgCount(items, bridge.sel('count'))) || 0, 64)
    const saved: Array<Array<{ kind: string; data: Buffer }>> = []
    for (let index = 0; index < count; index += 1) {
      const item = bridge.msgAt(items, bridge.sel('objectAtIndex:'), index)
      if (!alive(item)) continue
      const types = bridge.msg0(item, bridge.sel('types'))
      const entry: Array<{ kind: string; data: Buffer }> = []
      if (alive(types)) {
        const typeCount = Math.min(Number(bridge.msgCount(types, bridge.sel('count'))) || 0, 32)
        for (let typeIndex = 0; typeIndex < typeCount; typeIndex += 1) {
          const kind = readString(bridge.msgAt(types, bridge.sel('objectAtIndex:'), typeIndex))
          if (!kind) continue
          const kindString = CFStringCreate(null, kind, UTF8)
          try {
            if (!alive(kindString)) continue
            const data = bridge.msg1(item, bridge.sel('dataForType:'), kindString)
            const copied = copyPasteData(bridge, memcpy, data)
            if (copied) entry.push({ kind, data: copied })
          } finally {
            if (alive(kindString)) CFRelease(kindString)
          }
        }
      }
      if (entry.length > 0) saved.push(entry)
    }
    return saved
  }

  function copyPasteData(
    bridge: NonNullable<ReturnType<typeof appKit>>,
    memcpy: (dst: Buffer, src: unknown, n: number) => unknown,
    data: unknown,
  ) {
    if (!alive(data)) return null
    const length = Number(bridge.msgCount(data, bridge.sel('length')))
    if (!Number.isFinite(length) || length < 0) return null
    if (length === 0) return Buffer.alloc(0)
    if (length > 8_000_000) throw new Error('pasteboard')
    const bytes = bridge.msg0(data, bridge.sel('bytes'))
    if (!alive(bytes)) return null
    const buffer = Buffer.alloc(length)
    memcpy(buffer, bytes, length)
    return buffer
  }

  function setPasteString(bridge: NonNullable<ReturnType<typeof appKit>>, board: unknown, text: string) {
    const created = CFStringCreate(null, text, UTF8)
    if (!alive(created)) return false
    try {
      return Number(bridge.msgSet(board, bridge.sel('setString:forType:'), created, key('public.utf8-plain-text'))) === 1
    } finally {
      CFRelease(created)
    }
  }

  function restorePasteboard(
    bridge: NonNullable<ReturnType<typeof appKit>>,
    board: unknown,
    saved: Array<Array<{ kind: string; data: Buffer }>>,
  ) {
    bridge.msgCount(board, bridge.sel('clearContents'))
    if (saved.length === 0) return
    const array = bridge.msg0(bridge.getClass('NSMutableArray'), bridge.sel('array'))
    if (!alive(array)) return
    for (const entry of saved) {
      const item = bridge.msg0(bridge.msg0(bridge.getClass('NSPasteboardItem'), bridge.sel('alloc')), bridge.sel('init'))
      if (!alive(item)) continue
      for (const part of entry) {
        const bytes = part.data.length > 0 ? part.data : Buffer.alloc(1)
        const data = bridge.msgData(bridge.getClass('NSData'), bridge.sel('dataWithBytes:length:'), bytes, part.data.length)
        const kind = CFStringCreate(null, part.kind, UTF8)
        let held: unknown = null
        try {
          if (alive(data) && alive(kind)) {
            held = bridge.retain(data)
            bridge.msgSet(item, bridge.sel('setData:forType:'), held, kind)
          }
        } finally {
          if (alive(kind)) CFRelease(kind)
          if (alive(held)) bridge.release(held)
        }
      }
      bridge.msg1(array, bridge.sel('addObject:'), item)
      bridge.release(item)
    }
    bridge.msg1(board, bridge.sel('writeObjects:'), array)
  }

  function pasteInsert(target: Frame, text: string, beforeTitle: string): InsertAttempt {
    const procs = chatProcesses()
    if (!activateUntilFront(procs)) return { ok: false, reason: '微信未能切到前台，未插入' }
    if (!postClick(composerPoint(target))) return { ok: false, reason: '写入微信输入框失败' }
    pause(0.15)
    if (frontPid() !== mainWeChatPid(procs)) return { ok: false, reason: '点击输入区后焦点变化，未插入' }
    const afterClick = readBox(target)
    if (!chatStill(beforeTitle, afterClick.title)) return { ok: false, reason: '点击后无法再次确认当前会话，未插入；请用复制' }
    if (typeof afterClick.value === 'string') {
      if (afterClick.value.trim()) return { ok: false, reason: '输入框已有草稿，未覆盖' }
      if (setValue(afterClick.element, text)) {
        const landed = read(afterClick.element, 'AXValue')
        if (typeof landed === 'string' && landed.trim() === text) return { ok: true, reason: '已插入' }
      }
    }
    if (!pastePlain(text)) return { ok: false, reason: '写入微信输入框失败' }
    return { ok: true, reason: '已粘贴到输入框，请核对后发送' }
  }

  function insertByPaste(target: Frame, text: string, beforeTitle: string): InsertAttempt {
    const pasted = pasteInsert(target, text, beforeTitle)
    if (!pasted.ok) return pasted
    const box = awaitPastedComposer(target, text)
    if (!box) return { ok: true, reason: '已粘贴到输入框，请核对后自己发送' }
    focusBox(box)
    return confirmInserted(box, target, text, beforeTitle)
  }

  function findComposer(window: unknown) {
    const found: Array<{ element: unknown; shape: TextAreaShape }> = []
    const queue = [window]
    let seen = 0
    while (queue.length > 0 && seen < MAX_INPUT_NODES) {
      const element = queue.shift()
      if (!alive(element) && element !== window) continue
      seen += 1
      const role = typeof read(element, 'AXRole') === 'string' ? String(read(element, 'AXRole')) : ''
      if (role === 'AXTextArea') {
        const frame = elementFrame(element)
        found.push({
          element,
          shape: { role, width: frame?.width ?? 0, height: frame?.height ?? 0 },
        })
      }
      const children = read(element, 'AXChildren')
      if (Array.isArray(children)) {
        for (const child of children) queue.push(child)
      }
    }
    return pickLargestTextArea(found, (entry) => entry.shape)?.element ?? null
  }

  function assignText(element: unknown, text: string) {
    const created = CFStringCreate(null, text, UTF8)
    if (!alive(created)) return ''
    try {
      if (alive(boolTrue)) {
        try {
          AXSet(element, key('AXFocused'), boolTrue)
        } catch {
          /* attribute focus only — never a mouse click */
        }
      }
      AXSet(element, key('AXValue'), created)
      const written = read(element, 'AXValue')
      const value = typeof written === 'string' ? written : ''
      if (value.trim() === text) return value
      try {
        AXSet(element, key('AXSelectedText'), created)
      } catch {
        /* AXValue is the primary write */
      }
      const again = read(element, 'AXValue')
      return typeof again === 'string' ? again : value
    } finally {
      CFRelease(created)
    }
  }
}

function loadAx(koffi: { load(file: string): AxLib }) {
  const paths = [
    '/System/Library/Frameworks/ApplicationServices.framework/Frameworks/HIServices.framework/HIServices',
    '/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices',
  ]
  let last: unknown = null
  for (const file of paths) {
    try {
      return koffi.load(file)
    } catch (error) {
      last = error
    }
  }
  throw last instanceof Error ? last : new Error('Accessibility framework')
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
