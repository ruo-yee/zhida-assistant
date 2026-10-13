/**
 * System Events fallback when CGWindowList cannot see WeChat.
 * Position is top-left, same as Electron. A live window is `0,111,915,693,微信`.
 * Title is optional so a bare `0,111,915,693` still docks.
 */
export const DARWIN_APPLESCRIPT = `
tell application "System Events"
  set procNames to {"微信", "WeChat", "Weixin", "WeChatAppEx"}
  set bestArea to 0
  set bestLine to ""
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
              set winPos to position of w
              set winTitle to ""
              try
                set winTitle to name of w
              end try
              set bestArea to area
              set bestLine to (item 1 of winPos as text) & "," & (item 2 of winPos as text) & "," & (winW as text) & "," & (winH as text) & "," & winTitle
            end if
          end try
        end repeat
      end tell
    end if
  end repeat
  return bestLine
end tell
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
