'use strict';

// Desktop context: which window is in front, copying the current selection
// and pasting an answer back. Each platform needs its own small helper; when
// one is missing (no xdotool, no Accessibility permission) the functions fail
// quietly and the assistant simply works without that piece of context.

const { execFile } = require('child_process');

const platform = process.platform;

function run(cmd, args, timeout = 1500) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : String(stdout));
    });
  });
}

const MAC_FRONT_WINDOW = `
tell application "System Events"
  set p to first application process whose frontmost is true
  set appName to name of p
  set winName to ""
  try
    set winName to name of front window of p
  end try
end tell
return appName & linefeed & winName`;

const WIN_FRONT_WINDOW = `
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class OrbitaWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
$h = [OrbitaWin]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[void][OrbitaWin]::GetWindowText($h, $sb, 512)
$procId = 0
[void][OrbitaWin]::GetWindowThreadProcessId($h, [ref]$procId)
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue
Write-Output $p.ProcessName
Write-Output $sb.ToString()`;

function powershell(script, timeout) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], timeout);
}

// -> { app, window } or null
async function activeWindow() {
  let out = null;
  if (platform === 'darwin') out = await run('osascript', ['-e', MAC_FRONT_WINDOW], 1200);
  else if (platform === 'win32') out = await powershell(WIN_FRONT_WINDOW, 1500);
  else {
    const title = await run('xdotool', ['getactivewindow', 'getwindowname'], 800);
    out = title == null ? null : `\n${title}`;
  }
  if (out == null) return null;
  const [app = '', window = ''] = out.replace(/\r/g, '').split('\n');
  if (!app.trim() && !window.trim()) return null;
  return { app: app.trim(), window: window.trim() };
}

function keystroke(letter) {
  if (platform === 'darwin') {
    return run('osascript', ['-e', `tell application "System Events" to keystroke "${letter}" using command down`]);
  }
  if (platform === 'win32') {
    return powershell(`$w = New-Object -ComObject WScript.Shell; $w.SendKeys('^${letter}')`, 2500);
  }
  return run('xdotool', ['key', '--clearmodifiers', `ctrl+${letter}`]);
}

async function copySelection() {
  return (await keystroke('c')) != null;
}

async function paste() {
  return (await keystroke('v')) != null;
}

module.exports = { activeWindow, copySelection, paste };
