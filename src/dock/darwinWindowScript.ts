import { WECHAT_BUNDLE_IDS, WECHAT_OWNER_NAMES } from './wechatWindow.ts'

/**
 * One osascript pass: NSWorkspace bundle id → PID, then on-screen CGWindowList.
 * Accessibility is only probed when that list has no dockable WeChat window,
 * and it never passes AXTrustedCheckOptionPrompt (the poll must not raise a dialog).
 */
export function darwinWeChatWindowScript() {
  const bundles = JSON.stringify(WECHAT_BUNDLE_IDS)
  const names = JSON.stringify(WECHAT_OWNER_NAMES)
  return `function run(argv) {
  var bundles = ${bundles};
  var exactNames = ${names};
  function fail(message) {
    return JSON.stringify({ error: message, pids: [], names: [], selfPid: Number(argv[0] || 0), windows: [], axTrusted: null, axBounds: null });
  }
  function nsString(value) {
    if (value === null || value === undefined) return '';
    try {
      var text = ObjC.unwrap(value);
      return typeof text === 'string' ? text : String(text);
    } catch (error) {
      return String(value);
    }
  }
  function asArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      if (typeof value.count === 'number' && value.objectAtIndex) {
        var out = [];
        var count = Math.min(value.count, 800);
        for (var i = 0; i < count; i++) out.push(value.objectAtIndex(i));
        return out;
      }
    } catch (error) {}
    return [];
  }
  try {
    ObjC.import('CoreGraphics');
    ObjC.import('Cocoa');
  } catch (error) {
    return fail('window-list-failed');
  }
  var selfPid = Number(argv[0] || 0);
  var bundleSet = {};
  var nameSet = {};
  for (var b = 0; b < bundles.length; b++) bundleSet[bundles[b]] = 1;
  for (var n = 0; n < exactNames.length; n++) nameSet[exactNames[n]] = 1;
  var pids = [];
  var names = [];
  var pidSeen = {};
  try {
    var apps = $.NSWorkspace.sharedWorkspace.runningApplications;
    for (var i = 0; i < apps.count; i++) {
      var app = apps.objectAtIndex(i);
      var bid = nsString(app.bundleIdentifier);
      var name = nsString(app.localizedName);
      if (!bundleSet[bid] && !nameSet[name]) continue;
      var pid = Number(app.processIdentifier);
      if (!isFinite(pid) || pid <= 0 || pidSeen[pid]) continue;
      pidSeen[pid] = 1;
      pids.push(pid);
      if (name) names.push(name);
    }
  } catch (error) {
    return fail('workspace-failed');
  }
  var windows = [];
  try {
    var opts = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements;
    var raw = $.CGWindowListCopyWindowInfo(opts, $.kCGNullWindowID);
    var list = [];
    try { list = asArray(ObjC.deepUnwrap(raw)); } catch (error) { list = asArray(raw); }
    if (!list.length) list = asArray(raw);
    for (var w = 0; w < list.length; w++) {
      var win = list[w];
      if (!win) continue;
      var bounds = win.kCGWindowBounds || {};
      windows.push({
        pid: Number(win.kCGWindowOwnerPID || 0),
        layer: Number(win.kCGWindowLayer || 0),
        x: Number(bounds.X || bounds.x || 0),
        y: Number(bounds.Y || bounds.y || 0),
        width: Number(bounds.Width || bounds.width || 0),
        height: Number(bounds.Height || bounds.height || 0),
        title: String(win.kCGWindowName || ''),
        owner: String(win.kCGWindowOwnerName || ''),
        id: Number(win.kCGWindowNumber || 0)
      });
    }
  } catch (error) {
    return fail('window-list-failed');
  }
  var hostTrusted = String(argv[1] || '') === '1';
  var ax = hasDockable(pids, nameSet, windows) ? { trusted: null, bounds: null } : probeAx(pids, hostTrusted);
  return JSON.stringify({ pids: pids, names: names, selfPid: selfPid, windows: windows, axTrusted: ax.trusted, axBounds: ax.bounds });
}
function hasDockable(pids, nameSet, windows) {
  var set = {};
  for (var i = 0; i < pids.length; i++) set[pids[i]] = 1;
  for (var n = 0; n < windows.length; n++) {
    var win = windows[n];
    if (Number(win.layer) !== 0 || Number(win.width) < 240 || Number(win.height) < 240) continue;
    if (set[win.pid] || nameSet[win.owner]) return true;
  }
  return false;
}
function probeAx(pids, hostTrusted) {
  if (!pids.length) return { trusted: null, bounds: null };
  try { ObjC.import('ApplicationServices'); } catch (error) { return { trusted: false, bounds: null }; }
  var osTrusted = false;
  try { osTrusted = $.AXIsProcessTrusted() ? true : false; } catch (error) { return { trusted: false, bounds: null }; }
  var trusted = (osTrusted || hostTrusted) ? true : false;
  if (!trusted) return { trusted: false, bounds: null };
  var best = null;
  for (var i = 0; i < pids.length; i++) {
    try {
      var root = $.AXUIElementCreateApplication(pids[i]);
      $.AXUIElementSetMessagingTimeout(root, 0.35);
      var raw = copyAttr(root, 'AXWindows');
      if (!raw || typeof raw.count !== 'number') continue;
      var limit = Math.min(raw.count, 8);
      for (var n = 0; n < limit; n++) {
        var win = raw.objectAtIndex(n);
        var pos = readPoint(win);
        var size = readSize(win);
        if (!pos || !size || size.w < 240 || size.h < 240) continue;
        var area = size.w * size.h;
        if (!best || area > best.area) best = { x: pos.x, y: pos.y, width: size.w, height: size.h, area: area };
      }
    } catch (error) {}
  }
  if (!best) return { trusted: true, bounds: null };
  return { trusted: true, bounds: { x: best.x, y: best.y, width: best.width, height: best.height } };
}
function copyAttr(el, name) {
  if (!el) return null;
  var slot = Ref();
  var err = $.AXUIElementCopyAttributeValue(el, $(name), slot);
  if (err !== 0) return null;
  return slot[0];
}
function readPoint(el) {
  var raw = copyAttr(el, 'AXPosition');
  if (!raw) return null;
  var slot = Ref();
  if (!$.AXValueGetValue(raw, $.kAXValueCGPointType, slot)) return null;
  var point = slot[0];
  return { x: Number(point.x || 0), y: Number(point.y || 0) };
}
function readSize(el) {
  var raw = copyAttr(el, 'AXSize');
  if (!raw) return null;
  var slot = Ref();
  if (!$.AXValueGetValue(raw, $.kAXValueCGSizeType, slot)) return null;
  var size = slot[0];
  return { w: Number(size.width || size.x || 0), h: Number(size.height || size.y || 0) };
}
`
}
