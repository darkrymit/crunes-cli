import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// A store, a plugin with one native rune and one isolate rune, and a project that enables it.
const root = mkdtempSync(join(tmpdir(), 'crunes-native-plugin-'))
const store = join(root, 'store')
const pluginDir = join(root, 'plugin')
const project = join(root, 'project')
const write = (file, body) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, body) }

let runRune, recordTrust, describeForReview, formatConsentScreen
const config = { plugins: { 'mkt@tools': true }, runes: { 'mkt@tools:hello': { vars: { who: 'project' } } } }

beforeAll(async () => {
  process.env.CRUNES_STORE = store
  write(join(pluginDir, '.crunes-plugin', 'plugin.json'), JSON.stringify({
    format: '2',
    runes: {
      hello: { run: { command: 'scripts/hello.sh', argv: ['--from-plugin'] }, vars: { who: 'plugin' } },
      iso: { run: 'runes/iso.rune.js' },
    },
  }))
  write(join(pluginDir, 'scripts', 'hello.sh'), 'echo "argv:$* vars:$CRUNES_VARS root:$CRUNES_PLUGIN_ROOT"\n')
  write(join(pluginDir, 'runes', 'iso.rune.js'), 'export async function run() { return "iso" }\n')
  write(join(store, 'plugins.json'), JSON.stringify({
    format: '1',
    plugins: { 'mkt@tools': { version: '1.0.0', path: pluginDir, cacheDir: pluginDir, local: true, consentedPermissions: {} } },
  }))
  mkdirSync(join(project, '.crunes'), { recursive: true })
  write(join(project, '.crunes', 'config.json'), '{}')
  ;({ runRune } = await import('../../src/rune/resolver.js'))
  ;({ recordTrust } = await import('../../src/plugin/native.js'))
  ;({ describeForReview } = await import('../../src/plugin/commands/trust.js'))
  ;({ formatConsentScreen } = await import('../../src/plugin/consent.js'))
})

// The shared test setup points CRUNES_STORE at its own store before every test.
beforeEach(() => { process.env.CRUNES_STORE = store })

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('native plugin runes — explicit trust', () => {
  it('refuses to run a native rune that has not been trusted, naming the command that trusts it', async () => {
    await expect(runRune(project, config, 'tools:hello', ['x'])).rejects.toThrow(
      /runs natively, outside the sandbox, with your full access, and has not been trusted[\s\S]*crunes plugin trust tools hello/
    )
  })

  it('runs it once trusted, announcing on standard error that it is native', async () => {
    const { trustDigest } = await import('../../src/plugin/native.js')
    const { loadPluginJson } = await import('../../src/plugin/manifest.js')
    const pluginJson = await loadPluginJson(pluginDir)
    await recordTrust('mkt@tools', 'hello', trustDigest(pluginDir, pluginJson.runes.hello))

    let stderr = ''
    vi.spyOn(process.stderr, 'write').mockImplementation(s => { stderr += s; return true })
    const result = await runRune(project, config, 'tools:hello', ['x'])
    vi.restoreAllMocks()

    expect(stderr).toContain('mkt@tools:hello is a plugin script: it runs natively')
    const out = result[0].data.content
    expect(out).toContain('argv:--from-plugin x')
    expect(out).toContain('vars:{"who":"project"}')
    expect(out).toContain(`root:${pluginDir}`)
  })

  it('refuses it again once its script changes, until trusted anew', async () => {
    write(join(pluginDir, 'scripts', 'hello.sh'), 'echo changed\n')
    await expect(runRune(project, config, 'tools:hello', [])).rejects.toThrow('has changed since it was trusted')
  })

  it('leaves isolate runes in the same plugin alone', async () => {
    const result = await runRune(project, config, 'tools:iso', [])
    expect(result[0].data.content).toBe('iso')
  })

  it('shows the script itself for review, and names native runes at install', async () => {
    const { loadPluginJson } = await import('../../src/plugin/manifest.js')
    const pluginJson = await loadPluginJson(pluginDir)
    const review = describeForReview('mkt@tools', 'hello', pluginJson.runes.hello, pluginDir, 'changed')
    expect(review).toContain('CHANGED since it was trusted')
    expect(review).toContain('command: scripts/hello.sh --from-plugin')
    expect(review).toContain('│ echo changed')
    expect(formatConsentScreen('tools', pluginJson)).toContain('hello  runs scripts/hello.sh')
  })
})
