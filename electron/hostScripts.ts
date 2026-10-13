/** CoreGraphics window list. Runs with `osascript -l JavaScript` on macOS. */
export const DARWIN_CGWINDOW_SCRIPT = `
ObjC.import('CoreGraphics');
const opts = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements;
const raw = $.CGWindowListCopyWindowInfo(opts, $.kCGNullWindowID);
const list = ObjC.deepUnwrap(raw) || [];
let best = null;
for (let i = 0; i < list.length; i++) {
  const win = list[i];
  if (!win || win.kCGWindowLayer !== 0) continue;
  const owner = String(win.kCGWindowOwnerName || '');
  const name = String(win.kCGWindowName || '');
  if (!/WeChat|Weixin|微信/.test(owner) && !/WeChat|Weixin|微信/.test(name)) continue;
  const bounds = win.kCGWindowBounds;
  if (!bounds) continue;
  const width = Number(bounds.Width);
  const height = Number(bounds.Height);
  if (!(width >= 240 && height >= 240)) continue;
  const area = width * height;
  if (!best || area > best.area) {
    best = { x: Number(bounds.X), y: Number(bounds.Y), width: width, height: height, title: name || owner, area: area };
  }
}
if (!best) {
  '';
} else {
  best.x + ',' + best.y + ',' + best.width + ',' + best.height + ',' + String(best.title).replace(/[\\r\\n]/g, ' ');
}
`

/** Accessibility fallback when CGWindowList cannot see the WeChat process. */
export const DARWIN_APPLESCRIPT = `
tell application "System Events"
  set procNames to {"WeChat", "微信", "Weixin"}
  repeat with procName in procNames
    if exists (process procName) then
      tell process procName
        if (count of windows) > 0 then
          set winPos to position of window 1
          set winSize to size of window 1
          set winTitle to name of window 1
          return (item 1 of winPos as text) & "," & (item 2 of winPos as text) & "," & (item 1 of winSize as text) & "," & (item 2 of winSize as text) & "," & winTitle
        end if
      end tell
    end if
  end repeat
end tell
return ""
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
