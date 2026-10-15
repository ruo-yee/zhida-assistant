import { WECHAT_BUNDLE_IDS, WECHAT_OWNER_NAMES } from './wechatWindow.ts'

/**
 * On-screen windows only, same as the reference `_wechat_window_infos`.
 * No Accessibility calls: those belong to the title read, and running them
 * from osascript on this tick made WeChat stall past the dock timeout.
 */
export function darwinWeChatWindowScript() {
  const bundles = JSON.stringify(WECHAT_BUNDLE_IDS)
  const names = JSON.stringify(WECHAT_OWNER_NAMES)
  return `function run(argv) {
  var bundles = ${bundles};
  var exactNames = ${names};
  function fail(message) {
    return JSON.stringify({ error: message, pids: [], names: [], selfPid: Number(argv[0] || 0), windows: [], axTrusted: null, axBounds: null, appHidden: false, concealed: false });
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
  var mainStates = [];
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
      if (bid === 'com.tencent.xinWeChat' || name === '微信' || name === 'WeChat' || name === 'Weixin') {
        mainStates.push(isAppHidden(app) ? 1 : 0);
      }
    }
  } catch (error) {
    return fail('workspace-failed');
  }
  var appHidden = mainStates.length > 0 && mainStates.indexOf(0) < 0;
  var windows = [];
  try {
    windows = readWindowList();
  } catch (error) {
    return fail('window-list-failed');
  }
  return JSON.stringify({ pids: pids, names: names, selfPid: selfPid, windows: windows, axTrusted: null, axBounds: null, appHidden: appHidden, concealed: false });
}
function readWindowList() {
  var opts = $.kCGWindowListOptionOnScreenOnly;
  var raw = $.CGWindowListCopyWindowInfo(opts, $.kCGNullWindowID);
  var list = [];
  try { list = asArray(ObjC.deepUnwrap(raw)); } catch (error) { list = asArray(raw); }
  if (!list.length) list = asArray(raw);
  var windows = [];
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
  return windows;
}
function isAppHidden(app) {
  try {
    var flag = false;
    if (typeof app.isHidden === 'function') flag = app.isHidden();
    else if (typeof app.hidden === 'function') flag = app.hidden();
    else flag = app.hidden;
    try { flag = ObjC.unwrap(flag); } catch (error) {}
    return flag === true || flag === 1 || flag === '1';
  } catch (error) {
    return false;
  }
}
`
}
