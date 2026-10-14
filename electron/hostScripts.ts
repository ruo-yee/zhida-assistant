/**
 * System Events fallback when CGWindowList cannot see WeChat.
 * Position is top-left, same as Electron. A live window is `0,111,915,693,微信`.
 * Hidden (Cmd+H) and minimized windows are not live: the script returns `hidden`
 * so the companion can leave the screen instead of docking to a stale frame.
 */
export const DARWIN_APPLESCRIPT = `
tell application "System Events"
  set procNames to {"微信", "WeChat", "Weixin", "WeChatAppEx"}
  set bestArea to 0
  set bestLine to ""
  set sawProcess to false
  repeat with procName in procNames
    if exists (process procName) then
      set sawProcess to true
      tell process procName
        set appVisible to true
        try
          set visFlag to visible
          if visFlag is false or visFlag is 0 then set appVisible to false
          if (visFlag as text) is "false" or (visFlag as text) is "0" then set appVisible to false
        end try
        if appVisible then
          repeat with w in windows
            try
              set winConcealed to false
              try
                set miniValue to value of attribute "AXMinimized" of w
                if miniValue is true or miniValue is 1 then set winConcealed to true
                if winConcealed is false then
                  set miniText to miniValue as text
                  if miniText is "true" or miniText is "1" then set winConcealed to true
                end if
              end try
              try
                if winConcealed is false then
                  set subrole to (value of attribute "AXSubrole" of w) as text
                  if subrole is "AXMinimizedWindow" then set winConcealed to true
                end if
              end try
              if winConcealed is false then
                set winSize to size of w
                set winW to item 1 of winSize
                set winH to item 2 of winSize
                set area to winW * winH
                if winW >= 240 and winH >= 240 and area > bestArea then
                  set winPos to position of w
                  set winTitle to ""
                  try
                    set winTitle to name of w
                  end try
                  set bestArea to area
                  set bestLine to (item 1 of winPos as text) & "," & (item 2 of winPos as text) & "," & (winW as text) & "," & (winH as text) & "," & winTitle
                end if
              end if
            end try
          end repeat
        end if
      end tell
    end if
  end repeat
  if bestLine is not "" then return bestLine
  if sawProcess then return "hidden"
  return ""
end tell
`

/**
 * Same visible window as docking, plus the static texts System Events can see.
 * Used when Accessibility's AXWindows / AXFocusedWindow are empty on WeChat 4.
 * A group window name looks like `迈腾7连-3班 (322)`.
 */
export const DARWIN_VISIBLE_SCRIPT = `
tell application "System Events"
  set procNames to {"微信", "WeChat", "Weixin", "WeChatAppEx"}
  set bestArea to 0
  set bestTitle to ""
  set bestLines to {}
  set bestPlaced to {}
  set bestX to 0
  set bestY to 0
  set bestW to 0
  set bestH to 0
  set sawProcess to false
  repeat with procName in procNames
    if exists (process procName) then
      set sawProcess to true
      tell process procName
        set appVisible to true
        try
          set visFlag to visible
          if visFlag is false or visFlag is 0 then set appVisible to false
          if (visFlag as text) is "false" or (visFlag as text) is "0" then set appVisible to false
        end try
        if appVisible then
          repeat with w in windows
            try
              set winConcealed to false
              try
                set miniValue to value of attribute "AXMinimized" of w
                if miniValue is true or miniValue is 1 then set winConcealed to true
                if winConcealed is false then
                  set miniText to miniValue as text
                  if miniText is "true" or miniText is "1" then set winConcealed to true
                end if
              end try
              try
                if winConcealed is false then
                  set subrole to (value of attribute "AXSubrole" of w) as text
                  if subrole is "AXMinimizedWindow" then set winConcealed to true
                end if
              end try
              if winConcealed is false then
                set winSize to size of w
                set winW to item 1 of winSize
                set winH to item 2 of winSize
                set area to winW * winH
                if winW >= 240 and winH >= 240 and area > bestArea then
                  set bestArea to area
                  try
                    set bestTitle to name of w
                  end try
                  set bestLines to {}
                  set bestPlaced to {}
                  set bestW to winW
                  set bestH to winH
                  try
                    set winPos to position of w
                    set bestX to item 1 of winPos
                    set bestY to item 2 of winPos
                  end try
                  try
                    set bestPlaced to every static text of w
                  end try
                  try
                    set bestLines to value of every static text of w
                  end try
                end if
              end if
            end try
          end repeat
        end if
      end tell
    end if
  end repeat
  if bestArea is 0 then
    if sawProcess then return "HIDDEN"
    return ""
  end if
  set payload to "TITLE" & tab & bestTitle & linefeed
  set payload to payload & "BOUNDS" & tab & bestX & tab & bestY & tab & bestW & tab & bestH & linefeed
  set total to 0
  try
    if class of bestLines is text then set bestLines to {bestLines}
    set total to count of bestLines
  end try
  set startAt to 1
  if total > 24 then set startAt to total - 23
  if total > 0 then
    repeat with i from startAt to total
      try
        set piece to item i of bestLines as text
        set piece to my flatten(piece)
        if (length of piece) >= 2 and (length of piece) < 180 then
          set payload to payload & "LINE" & tab & piece & linefeed
        end if
      end try
    end repeat
  end if
  set placedCount to 0
  try
    set placedCount to count of bestPlaced
  end try
  if placedCount > 60 then set placedCount to 60
  if placedCount > 0 then
    repeat with i from 1 to placedCount
      try
        set node to item i of bestPlaced
        set piece to value of node as text
        set piece to my flatten(piece)
        set nodePos to position of node
        if (length of piece) >= 2 and (length of piece) < 180 then
          set payload to payload & "POS" & tab & (item 2 of nodePos as text) & tab & (item 1 of nodePos as text) & tab & piece & linefeed
        end if
      end try
    end repeat
  end if
  return payload
end tell

on flatten(value)
  set blob to value as text
  set blob to my swap(blob, return, " ")
  set blob to my swap(blob, linefeed, " ")
  set blob to my swap(blob, tab, " ")
  return blob
end flatten

on swap(value, needle, replacement)
  set AppleScript's text item delimiters to needle
  set parts to text items of value
  set AppleScript's text item delimiters to replacement
  set joined to parts as text
  set AppleScript's text item delimiters to ""
  return joined
end swap
`

/**
 * Largest WeChat window, without a second minimized/hidden verdict.
 * Call only when the dock poll already sees that window on screen.
 * A false AXMinimized here used to drop the chat title and report no window.
 */
export const DARWIN_ONSCREEN_SCRIPT = `
tell application "System Events"
  set procNames to {"微信", "WeChat", "Weixin", "WeChatAppEx"}
  set bestArea to 0
  set bestTitle to ""
  set bestLines to {}
  set bestPlaced to {}
  set bestX to 0
  set bestY to 0
  set bestW to 0
  set bestH to 0
  repeat with procName in procNames
    if exists (process procName) then
      tell process procName
        repeat with w in windows
          try
            set winSize to size of w
            set winW to item 1 of winSize
            set winH to item 2 of winSize
            set area to winW * winH
            if winW >= 240 and winH >= 240 and area > bestArea then
              set bestArea to area
              try
                set bestTitle to name of w
              end try
              set bestLines to {}
              set bestPlaced to {}
              set bestW to winW
              set bestH to winH
              try
                set winPos to position of w
                set bestX to item 1 of winPos
                set bestY to item 2 of winPos
              end try
              try
                set bestPlaced to every static text of w
              end try
              try
                set bestLines to value of every static text of w
              end try
            end if
          end try
        end repeat
      end tell
    end if
  end repeat
  if bestArea is 0 then return ""
  set payload to "TITLE" & tab & bestTitle & linefeed
  set payload to payload & "BOUNDS" & tab & bestX & tab & bestY & tab & bestW & tab & bestH & linefeed
  set total to 0
  try
    if class of bestLines is text then set bestLines to {bestLines}
    set total to count of bestLines
  end try
  set startAt to 1
  if total > 24 then set startAt to total - 23
  if total > 0 then
    repeat with i from startAt to total
      try
        set piece to item i of bestLines as text
        set piece to my flatten(piece)
        if (length of piece) >= 2 and (length of piece) < 180 then
          set payload to payload & "LINE" & tab & piece & linefeed
        end if
      end try
    end repeat
  end if
  set placedCount to 0
  try
    set placedCount to count of bestPlaced
  end try
  if placedCount > 60 then set placedCount to 60
  if placedCount > 0 then
    repeat with i from 1 to placedCount
      try
        set node to item i of bestPlaced
        set piece to value of node as text
        set piece to my flatten(piece)
        set nodePos to position of node
        if (length of piece) >= 2 and (length of piece) < 180 then
          set payload to payload & "POS" & tab & (item 2 of nodePos as text) & tab & (item 1 of nodePos as text) & tab & piece & linefeed
        end if
      end try
    end repeat
  end if
  return payload
end tell

on flatten(value)
  set blob to value as text
  set blob to my swap(blob, return, " ")
  set blob to my swap(blob, linefeed, " ")
  set blob to my swap(blob, tab, " ")
  return blob
end flatten

on swap(value, needle, replacement)
  set AppleScript's text item delimiters to needle
  set parts to text items of value
  set AppleScript's text item delimiters to replacement
  set joined to parts as text
  set AppleScript's text item delimiters to ""
  return joined
end swap
`

/**
 * Largest text area of the visible WeChat window.
 * Used when AXWindows is empty and the in-process tree has no composer.
 * Read returns `VALUE` plus the current text. Write sets that value and does not press Return.
 */
export const DARWIN_COMPOSER_SCRIPT = `
function run(argv) {
  var mode = argv && argv[0] ? String(argv[0]) : 'read'
  var text = argv && argv.length > 1 ? String(argv[1]) : ''
  var system = Application('System Events')
  var names = ['微信', 'WeChat', 'Weixin', 'WeChatAppEx']
  var best = null
  var bestArea = 0
  for (var n = 0; n < names.length; n++) {
    try {
      var proc = system.processes.byName(names[n])
      if (!proc.exists()) continue
      var windows = proc.windows()
      for (var i = 0; i < windows.length; i++) {
        var win = windows[i]
        var size = [0, 0]
        try { size = win.size() } catch (error) { size = [0, 0] }
        if (!size || size[0] < 240 || size[1] < 240) continue
        var areas = []
        try { areas = win.textAreas() } catch (error) { areas = [] }
        for (var j = 0; j < areas.length; j++) {
          var box = areas[j]
          var boxSize = [0, 0]
          try { boxSize = box.size() } catch (error) { boxSize = [0, 0] }
          var area = Number(boxSize[0]) * Number(boxSize[1])
          if (boxSize[0] >= 80 && boxSize[1] >= 16 && area > bestArea) {
            bestArea = area
            best = box
          }
        }
      }
    } catch (error) {}
  }
  if (!best) return 'MISS'
  try {
    if (mode === 'write') best.value = text
  } catch (error) {
    return 'MISS'
  }
  var value = ''
  try { value = String(best.value()) } catch (error) { value = '' }
  return 'VALUE\\t' + value.replace(/[\\t\\r\\n]+/g, ' ')
}
`

/** Win32 EnumWindows + GetWindowRect. Runs with powershell.exe on Windows. */
export const WIN32_POWERSHELL = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class ZhidaWeChat {
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  static EnumProc keepAlive;
  public static System.Collections.Generic.List<string> Scan() {
    var hits = new System.Collections.Generic.List<string>();
    keepAlive = delegate (IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) return true;
      var cls = new StringBuilder(256);
      var title = new StringBuilder(512);
      GetClassName(hWnd, cls, cls.Capacity);
      GetWindowText(hWnd, title, title.Capacity);
      string className = cls.ToString();
      string text = title.ToString();
      bool match = className.IndexOf("WeChat", StringComparison.OrdinalIgnoreCase) >= 0
        || className.IndexOf("Weixin", StringComparison.OrdinalIgnoreCase) >= 0
        || text.Contains("微信")
        || text.IndexOf("WeChat", StringComparison.OrdinalIgnoreCase) >= 0;
      if (!match) return true;
      RECT rect;
      if (!GetWindowRect(hWnd, out rect)) return true;
      int width = rect.Right - rect.Left;
      int height = rect.Bottom - rect.Top;
      if (width < 240 || height < 240) return true;
      string safe = text.Replace(",", " ").Replace("\\r", " ").Replace("\\n", " ");
      hits.Add(rect.Left + "," + rect.Top + "," + width + "," + height + "," + safe);
      return true;
    };
    EnumWindows(keepAlive, IntPtr.Zero);
    return hits;
  }
}
"@
[ZhidaWeChat]::Scan() | ForEach-Object { $_ }
`
