import { execFile as _execFileNode } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import * as self from './notify.js'

const execFileAsync = promisify(_execFileNode)

export async function _execNotify(cmd, args) {
  return execFileAsync(cmd, args)
}


function escapeArg(str) {
  return String(str).replace(/"/g, '\\"')
}

function getPlatform() {
  return process.env.CRUNES_NOTIFY_PLATFORM ?? os.platform()
}

const WIN_APP_ID = 'crunes'
const WIN_REG_KEY = `HKCU:\\Software\\Classes\\AppUserModelId\\${WIN_APP_ID}`

async function dispatchWindows(title, message, urgency) {
  const t = escapeArg(title)
  const m = escapeArg(message)
  const script = [
    `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null`,
    `[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] | Out-Null`,
    `if (-not (Test-Path '${WIN_REG_KEY}')) { New-Item -Path '${WIN_REG_KEY}' -Force | Out-Null; New-ItemProperty -Path '${WIN_REG_KEY}' -Name DisplayName -Value 'crunes' -Force | Out-Null }`,
    `$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02`,
    `$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template)`,
    `$nodes = $xml.GetElementsByTagName('text')`,
    `$nodes.Item(0).AppendChild($xml.CreateTextNode("${t}")) | Out-Null`,
    `$nodes.Item(1).AppendChild($xml.CreateTextNode("${m}")) | Out-Null`,
    `$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)`,
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${WIN_APP_ID}').Show($toast)`,
  ].join('; ')
  await self._execNotify('powershell', ['-NoProfile', '-NonInteractive', '-Command', script])
}

async function dispatchMacos(title, message, urgency) {
  const t = escapeArg(title)
  const m = escapeArg(message)
  const sound = urgency === 'critical' ? ` sound name "Basso"` : ''
  const script = `display notification "${m}" with title "${t}"${sound}`
  await self._execNotify('osascript', ['-e', script])
}

async function dispatchLinux(title, message, urgency) {
  const level = urgency ?? 'normal'
  await self._execNotify('notify-send', [`--urgency=${level}`, String(title), String(message)])
}

export function createNotifyUtils(checkPermission) {
  return {
    async send(title, message, opts = {}) {
      checkPermission('notify.send', null)

      const urgency = opts.urgency ?? 'normal'
      const shouldThrow = opts.throw ?? false
      const platform = getPlatform()

      const fail = (reason) => {
        if (shouldThrow) throw new Error(reason)
        return { sent: false, reason }
      }

      if (platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
        return fail(`unsupported platform: ${platform}`)
      }

      try {
        if (platform === 'win32') await dispatchWindows(title, message, urgency)
        else if (platform === 'darwin') await dispatchMacos(title, message, urgency)
        else await dispatchLinux(title, message, urgency)
        return { sent: true }
      } catch (err) {
        if (err.code === 'ENOENT') {
          const tool = platform === 'win32' ? 'powershell' : platform === 'darwin' ? 'osascript' : 'notify-send'
          return fail(`tool not found: ${tool}`)
        }
        const stderr = err.stderr?.toString().trim()
        return fail(stderr ? `command failed: ${stderr}` : err.message)
      }
    }
  }
}
