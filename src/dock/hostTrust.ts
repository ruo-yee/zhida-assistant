import type { FindOutcome } from './types.ts'
import { WECHAT_BUNDLE_IDS, WECHAT_OWNER_NAMES } from './wechatWindow.ts'

/**
 * NSWorkspace only. No Accessibility API, so this stays true when osascript
 * itself is not in the Accessibility list.
 */
export function wechatLivenessScript() {
  const bundles = JSON.stringify(WECHAT_BUNDLE_IDS)
  const names = JSON.stringify(WECHAT_OWNER_NAMES)
  return `function run() {
  ObjC.import('Cocoa');
  var bundles = ${bundles};
  var names = ${names};
  var bundleSet = {};
  var nameSet = {};
  for (var i = 0; i < bundles.length; i++) bundleSet[bundles[i]] = 1;
  for (var n = 0; n < names.length; n++) nameSet[names[n]] = 1;
  var pids = [];
  var seen = {};
  try {
    var apps = $.NSWorkspace.sharedWorkspace.runningApplications;
    for (var a = 0; a < apps.count; a++) {
      var app = apps.objectAtIndex(a);
      var bid = '';
      var name = '';
      try { bid = String(ObjC.unwrap(app.bundleIdentifier) || ''); } catch (error) { bid = String(app.bundleIdentifier || ''); }
      try { name = String(ObjC.unwrap(app.localizedName) || ''); } catch (error) { name = String(app.localizedName || ''); }
      if (!bundleSet[bid] && !nameSet[name]) continue;
      var pid = Number(app.processIdentifier);
      if (!isFinite(pid) || pid <= 0 || seen[pid]) continue;
      seen[pid] = 1;
      pids.push(pid);
    }
  } catch (error) {
    return JSON.stringify({ running: false, pids: [], error: 'workspace-failed' });
  }
  return JSON.stringify({ running: pids.length > 0, pids: pids });
}`
}

export function parseWeChatLiveness(stdout: string): { running: boolean; pids: number[] } | null {
  const line = stdout
    .trim()
    .split(/\r?\n/)
    .find((item) => item.startsWith('{'))
  if (!line) return null
  try {
    const raw = JSON.parse(line) as { running?: unknown; pids?: unknown }
    const pids = Array.isArray(raw.pids)
      ? raw.pids.map((pid) => Number(pid)).filter((pid) => Number.isFinite(pid) && pid > 0)
      : []
    return { running: Boolean(raw.running) || pids.length > 0, pids }
  } catch {
    return null
  }
}

export interface AxTrustView {
  trusted: boolean
  running: boolean
  hasWindow: boolean
  windowId: string
  title: string
  hasTextArea: boolean
  composer: string | null
  reason: string
}

/**
 * Accessibility trust comes from the Electron app, not from osascript.
 * `workspaceRunning` is NSWorkspace. It wins over a failed AX call that
 * otherwise looks like “WeChat is not running”.
 */
export function reconcileAxView(
  view: AxTrustView,
  hostTrusted: boolean,
  workspaceRunning: boolean | null,
): AxTrustView {
  const trusted = hostTrusted || view.trusted
  const running = workspaceRunning === null ? view.running : view.running || workspaceRunning
  if (!trusted) {
    return {
      ...view,
      trusted: false,
      running,
      hasWindow: false,
      windowId: '',
      title: '',
      hasTextArea: false,
      composer: null,
      reason: 'need-ax',
    }
  }
  let reason = view.reason
  if (reason === 'need-ax') reason = view.hasWindow ? '' : '辅助功能调用失败'
  if (running && reason === 'not-running') reason = view.hasWindow ? '' : 'no-window'
  if (!running) reason = 'not-running'
  return { ...view, trusted: true, running, reason }
}

/**
 * Used when the window-list script returns no JSON.
 * An AppleScript permission error belongs to osascript, not to this app.
 */
export function dockWhenWindowLookupFails(input: {
  hostTrusted: boolean
  wechatRunning: boolean
  commandMissing: boolean
}): FindOutcome {
  if (input.commandMissing) return { bounds: null, reason: 'error' }
  if (!input.hostTrusted) return { bounds: null, reason: 'permission', needsAccessibility: true }
  if (!input.wechatRunning) return { bounds: null, reason: 'not-running' }
  return { bounds: null, reason: 'screen-recording', needsAccessibility: false }
}
