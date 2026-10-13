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
