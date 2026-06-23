import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNotifyUtils } from '../notify.js'

function makeCheck(allowed = true) {
  return vi.fn((token) => {
    if (!allowed) throw new Error(`PermissionError: '${token}' — add '${token}' to allow list.`)
  })
}

describe('createNotifyUtils', () => {
  it('throws PermissionError when notify.send not allowed', async () => {
    const notify = createNotifyUtils(makeCheck(false))
    await expect(notify.send('Title', 'Message'))
      .rejects.toThrow('PermissionError')
  })

  it('returns { sent: false, reason } on unsupported platform', async () => {
    vi.stubEnv('CRUNES_NOTIFY_PLATFORM', 'haiku')
    const notify = createNotifyUtils(makeCheck(true))
    const result = await notify.send('Title', 'Message')
    expect(result.sent).toBe(false)
    expect(result.reason).toMatch(/unsupported platform/)
    vi.unstubAllEnvs()
  })

  it('returns { sent: true } on successful dispatch (mocked execFile)', async () => {
    const mod = await import('../notify.js')
    const execSpy = vi.spyOn(mod, '_execNotify').mockResolvedValue({ stdout: '', stderr: '' })
    const notify = createNotifyUtils(makeCheck(true))
    vi.stubEnv('CRUNES_NOTIFY_PLATFORM', 'darwin')
    const result = await notify.send('Hello', 'World')
    expect(result.sent).toBe(true)
    expect(execSpy).toHaveBeenCalled()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns { sent: false, reason } when execFile throws ENOENT', async () => {
    const mod = await import('../notify.js')
    const err = Object.assign(new Error('spawn osascript ENOENT'), { code: 'ENOENT' })
    vi.spyOn(mod, '_execNotify').mockRejectedValue(err)
    const notify = createNotifyUtils(makeCheck(true))
    vi.stubEnv('CRUNES_NOTIFY_PLATFORM', 'darwin')
    const result = await notify.send('Hello', 'World')
    expect(result.sent).toBe(false)
    expect(result.reason).toMatch(/tool not found/)
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('throws when opts.throw is true and dispatch fails', async () => {
    const mod = await import('../notify.js')
    vi.spyOn(mod, '_execNotify').mockRejectedValue(Object.assign(new Error('x'), { code: 'ENOENT' }))
    const notify = createNotifyUtils(makeCheck(true))
    vi.stubEnv('CRUNES_NOTIFY_PLATFORM', 'darwin')
    await expect(notify.send('T', 'M', { throw: true })).rejects.toThrow()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('passes urgency=critical to platform backend', async () => {
    const mod = await import('../notify.js')
    const execSpy = vi.spyOn(mod, '_execNotify').mockResolvedValue({})
    const notify = createNotifyUtils(makeCheck(true))
    vi.stubEnv('CRUNES_NOTIFY_PLATFORM', 'linux')
    await notify.send('T', 'M', { urgency: 'critical' })
    expect(execSpy).toHaveBeenCalledWith(
      'notify-send',
      expect.arrayContaining(['--urgency=critical'])
    )
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('escapes double quotes in title and message for shell-script backends', async () => {
    const mod = await import('../notify.js')
    const execSpy = vi.spyOn(mod, '_execNotify').mockResolvedValue({})
    const notify = createNotifyUtils(makeCheck(true))
    vi.stubEnv('CRUNES_NOTIFY_PLATFORM', 'darwin')
    await notify.send('Say "hi"', 'It\'s "fine"')
    // osascript receives a single script string — quotes must be escaped inside it
    const scriptArg = execSpy.mock.calls[0][1].find(a => a.startsWith('display'))
    expect(scriptArg).toMatch(/\\"/)
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
})
