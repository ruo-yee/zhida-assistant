import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { conversationCrop, parseOcrObservations, pickOcrChat } from '../../src/dock/sessionReport.ts'
import type { HostWindow } from '../../src/dock/types.ts'
import { runCommand } from '../runCommand.ts'
import { readChatWindowId, screenCaptureGranted, writeTitleCapture } from './macNative.ts'

const VISION = `
ObjC.import('Foundation')
ObjC.import('Vision')
function run(argv) {
  var file = argv[0]
  if (!file) return ''
  try {
    var url = $.NSURL.fileURLWithPath($(file))
    var request = $.VNRecognizeTextRequest.alloc.init
    request.setRecognitionLevel($.VNRequestTextRecognitionLevelAccurate)
    request.setUsesLanguageCorrection(true)
    try { request.setRecognitionLanguages($(['zh-Hans', 'en-US'])) } catch (error) {}
    var handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $({}))
    var error = Ref()
    if (!handler.performRequestsError([request], error)) return ''
    var results = request.results
    if (!results || typeof results.count !== 'number') return ''
    var lines = []
    for (var i = 0; i < results.count; i++) {
      var item = results.objectAtIndex(i)
      var text = ''
      try {
        var candidates = item.topCandidates(1)
        if (candidates && candidates.count) text = ObjC.unwrap(candidates.objectAtIndex(0).string)
      } catch (error) {}
      if (!text) continue
      var y = 0
      var x = 0
      var h = 0
      try {
        var box = item.boundingBox
        y = 1 - Number(box.origin.y) - Number(box.size.height)
        x = Number(box.origin.x)
        h = Number(box.size.height)
      } catch (error) {}
      if (!isFinite(y)) y = 0
      if (!isFinite(x)) x = 0
      if (!isFinite(h)) h = 0
      lines.push('LINE\\t' + y.toFixed(4) + '\\t' + x.toFixed(4) + '\\t' + h.toFixed(4) + '\\t' + String(text).replace(/[\\t\\r\\n]+/g, ' '))
    }
    return lines.join('\\n')
  } catch (error) {
    return ''
  }
}
`

let captureAllowed: boolean | null = null
let capturedAt = 0
let cached: { at: number; key: string; value: { title: string; lines: string[] } } | null = null

async function screenCaptureAllowed() {
  const now = Date.now()
  if (captureAllowed !== null && now - capturedAt < 30_000) return captureAllowed
  capturedAt = now
  if (process.platform !== 'darwin') {
    captureAllowed = false
    return false
  }
  // osascript is a different TCC client. The reference asks in-process.
  const granted = screenCaptureGranted()
  captureAllowed = granted === true
  return captureAllowed
}

/**
 * OCR the open conversation only after Accessibility and System Events have
 * no chat name. Never asks for Screen Recording; a missing grant skips it.
 */
export async function readOcrChat(bounds: HostWindow, windowId = 0): Promise<{ title: string; lines: string[] }> {
  const empty = { title: '', lines: [] as string[] }
  const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`
  if (cached && cached.key === key && Date.now() - cached.at < 2000) return cached.value
  if (!(await screenCaptureAllowed())) return empty
  const crop = conversationCrop(bounds)
  const dir = await mkdtemp(path.join(tmpdir(), 'zhida-ocr-'))
  const file = path.join(dir, 'chat.png')
  try {
    const id = windowId > 0 ? windowId : readChatWindowId()
    let wrote = id > 0 && writeTitleCapture(id, crop, file)
    if (!wrote) wrote = writeTitleCapture(0, crop, file)
    if (!wrote) {
      const shot = await runCommand(
        'screencapture',
        ['-x', '-R', `${crop.x},${crop.y},${crop.width},${crop.height}`, file],
        3000,
      )
      wrote = shot.code === 0
    }
    if (!wrote) return empty
    const seen = await runCommand('osascript', ['-l', 'JavaScript', '-e', VISION, file], 4000)
    const value = pickOcrChat(parseOcrObservations(seen.stdout))
    cached = { at: Date.now(), key, value }
    return value
  } catch {
    return empty
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export const ocrVisionScript = VISION
