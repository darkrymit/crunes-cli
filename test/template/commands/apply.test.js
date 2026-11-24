import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import os from 'node:os'

vi.mock('../../../src/plugin/registry.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({ plugins: {} }),
  resolvePluginKey: vi.fn().mockReturnValue(null),
}))
vi.mock('../../../src/plugin/manifest.js', () => ({ loadPluginJson: vi.fn() }))
vi.mock('@clack/prompts', () => ({ intro: vi.fn(), outro: vi.fn(), cancel: vi.fn(), confirm: vi.fn(), isCancel: () => false }))

import { confirm } from '@clack/prompts'

import { handler } from '../../../src/template/commands/apply.js'
import { loadRegistry, resolvePluginKey } from '../../../src/plugin/registry.js'
import { loadPluginJson } from '../../../src/plugin/manifest.js'

function write(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
}

describe('template apply', () => {
  let tmp, project, plugin

  const apply = (opts) => handler({ yes: true, projectRoot: project, configRoot: project, ...opts })
  const read = (rel) => readFileSync(join(project, rel), 'utf8')
  const config = () => JSON.parse(read('.crunes/config.json'))
  const writeConfig = (value) => write(project, { '.crunes/config.json': JSON.stringify(value) })

  beforeEach(() => {
    vi.mocked(confirm).mockReset()
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit(${code})`) })
    tmp = mkdtempSync(join(os.tmpdir(), 'crunes-apply-'))
    vi.stubEnv('CRUNES_STORE', join(tmp, 'store'))
    project = join(tmp, 'project')
    plugin = join(tmp, 'plugin')
    write(plugin, {
      'templates/note/src/index.rune.js': 'plugin entry',
      'templates/note/src/helper.js': 'plugin helper',
      'templates/note/test/note.test.js': 'plugin test',
    })
    vi.mocked(loadRegistry).mockResolvedValue({ plugins: { 'mp@notes': { path: plugin } } })
    vi.mocked(resolvePluginKey).mockReturnValue('mp@notes')
    vi.mocked(loadPluginJson).mockResolvedValue({
      templates: { note: { name: 'Note', permissions: { run: { allow: ['fs.write:./notes.md'] } } } },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('copies a project template folder whole and registers its entry module', async () => {
    writeConfig({ templates: { base: { description: 'Base' } } })
    write(project, {
      '.crunes/templates/base/src/index.rune.js': 'entry',
      '.crunes/templates/base/test/base.test.js': 'test',
    })
    await apply({ ref: 'base' })
    expect(read('.crunes/runes/base/src/index.rune.js')).toBe('entry')
    expect(read('.crunes/runes/base/test/base.test.js')).toBe('test')
    expect(config().runes.base).toEqual({ description: 'Base', run: '.crunes/runes/base/src/index.rune.js' })
  })

  it('copies a project template from its declared path', async () => {
    writeConfig({ templates: { base: { path: 'scaffolds/base' } } })
    write(project, { 'scaffolds/base/src/index.rune.js': 'entry' })
    await apply({ ref: 'base' })
    expect(read('.crunes/runes/base/src/index.rune.js')).toBe('entry')
  })

  it('copies a plugin template folder and carries its permissions', async () => {
    writeConfig({})
    await apply({ ref: 'notes:note' })
    expect(read('.crunes/runes/note/src/helper.js')).toBe('plugin helper')
    expect(read('.crunes/runes/note/test/note.test.js')).toBe('plugin test')
    expect(config().runes.note).toEqual({
      name: 'Note',
      run: { command: '.crunes/runes/note/src/index.rune.js', permissions: { allow: ['fs.write:./notes.md'] } },
    })
  })

  it('copies a plugin template folder through a shortcut entry', async () => {
    writeConfig({ templates: { memo: { plugin: 'notes:note', name: 'Memo' } } })
    await apply({ ref: 'memo' })
    expect(read('.crunes/runes/memo/src/index.rune.js')).toBe('plugin entry')
    expect(config().runes.memo.name).toBe('Memo')
  })

  it('--as moves the rune key and its folder together', async () => {
    writeConfig({})
    await apply({ ref: 'notes:note', key: 'mine' })
    expect(existsSync(join(project, '.crunes/runes/mine/src/index.rune.js'))).toBe(true)
    expect(config().runes.mine.run.command).toBe('.crunes/runes/mine/src/index.rune.js')
  })

  it.each(['tools/mine', 'tools/mine/'])('--path %s names the folder the template is copied into', async (path) => {
    writeConfig({})
    await apply({ ref: 'notes:note', path })
    expect(existsSync(join(project, 'tools/mine/src/index.rune.js'))).toBe(true)
    expect(config().runes.note.run.command).toBe('tools/mine/src/index.rune.js')
  })

  it('overwrites matching files and keeps the others on re-apply', async () => {
    writeConfig({})
    write(project, {
      '.crunes/runes/note/src/index.rune.js': 'edited',
      '.crunes/runes/note/src/extra.js': 'extra',
    })
    await apply({ ref: 'notes:note' })
    expect(read('.crunes/runes/note/src/index.rune.js')).toBe('plugin entry')
    expect(read('.crunes/runes/note/src/extra.js')).toBe('extra')
  })

  describe('entry module', () => {
    it('keeps an index.rune.mjs entry in the sandbox without asking', async () => {
      writeConfig({ templates: { base: {} } })
      write(project, { '.crunes/templates/base/src/index.rune.mjs': 'entry' })
      await apply({ ref: 'base', yes: false })
      expect(config().runes.base.run).toBe('.crunes/runes/base/src/index.rune.mjs')
    })

    it('exits 1 and writes nothing when there are two entries', async () => {
      writeConfig({ templates: { two: {} } })
      write(project, { '.crunes/templates/two/src/index.py': '', '.crunes/templates/two/src/index.rune.js': '' })
      await expect(apply({ ref: 'two' })).rejects.toThrow('process.exit(1)')
      expect(existsSync(join(project, '.crunes/runes'))).toBe(false)
    })

    it('ignores other index files that are not entries', async () => {
      writeConfig({ templates: { base: {} } })
      write(project, { '.crunes/templates/base/src/index.rune.js': '', '.crunes/templates/base/src/index.json': '', '.crunes/templates/base/src/index.helper.js': '' })
      await apply({ ref: 'base' })
      expect(config().runes.base.run).toBe('.crunes/runes/base/src/index.rune.js')
    })
  })

  describe('script templates', () => {
    let logged
    const text = () => logged.mock.calls.flat().join('\n')

    beforeEach(() => {
      logged = vi.spyOn(console, 'log').mockImplementation(() => {})
      write(project, {
        '.crunes/templates/job/src/index.py': 'print("body of the script")',
        '.crunes/templates/job/src/lib.py': 'x = 1',
      })
      write(plugin, { 'templates/job/src/index.sh': 'echo plugin-script' })
      vi.mocked(loadPluginJson).mockResolvedValue({ templates: { job: {} } })
    })

    it.each(['js', 'mjs', 'cjs', 'py', 'sh', 'cmd', 'bat'])('-y registers an index.%s entry', async (ext) => {
      writeConfig({ templates: { any: {} } })
      write(project, { [`.crunes/templates/any/src/index.${ext}`]: 'body' })
      await apply({ ref: 'any' })
      expect(config().runes.any.run).toBe(`.crunes/runes/any/src/index.${ext}`)
    })

    it('shows the script and the other copied files even with -y', async () => {
      writeConfig({ templates: { job: {} } })
      await apply({ ref: 'job' })
      expect(text()).toContain('runs natively, outside the sandbox, with your full access')
      expect(text()).toContain('body of the script')
      expect(text()).toContain('src/lib.py')
      expect(existsSync(join(project, '.crunes/runes/job/src/lib.py'))).toBe(true)
    })

    it.each([
      ['project', { templates: { job: {} } }, 'job', 'body of the script'],
      ['plugin', {}, 'notes:job', 'plugin-script'],
      ['shortcut', { templates: { alias: { plugin: 'notes:job' } } }, 'alias', 'plugin-script'],
    ])('without a terminal or -y, a %s script is shown and refused with nothing written', async (_, cfg, ref, body) => {
      writeConfig(cfg)
      await expect(apply({ ref, yes: false })).rejects.toThrow('process.exit(1)')
      expect(text()).toContain(body)
      expect(existsSync(join(project, '.crunes/runes'))).toBe(false)
      expect(config().runes).toBeUndefined()
    })

    it('-y applies a plugin script', async () => {
      writeConfig({})
      await apply({ ref: 'notes:job' })
      expect(config().runes.job.run).toBe('.crunes/runes/job/src/index.sh')
    })

    it('exits 1 and writes nothing when a script template declares permissions', async () => {
      writeConfig({ templates: { job: { permissions: { run: { allow: ['fs.read:./**'] } } } } })
      await expect(apply({ ref: 'job' })).rejects.toThrow('process.exit(1)')
      expect(existsSync(join(project, '.crunes/runes'))).toBe(false)
    })

    describe('in a terminal', () => {
      let wasTTY
      beforeEach(() => { wasTTY = process.stdout.isTTY; process.stdout.isTTY = true })
      afterEach(() => { process.stdout.isTTY = wasTTY })

      it('applies once confirmed', async () => {
        vi.mocked(confirm).mockResolvedValue(true)
        writeConfig({ templates: { job: {} } })
        await apply({ ref: 'job', yes: false })
        expect(confirm).toHaveBeenCalledTimes(1)
        expect(config().runes.job).toBeDefined()
      })

      it('writes nothing when declined', async () => {
        vi.mocked(confirm).mockResolvedValue(false)
        writeConfig({ templates: { job: {} } })
        await expect(apply({ ref: 'job', yes: false })).rejects.toThrow('process.exit(0)')
        expect(existsSync(join(project, '.crunes/runes'))).toBe(false)
      })

      it('does not ask for a sandboxed template', async () => {
        writeConfig({ templates: { base: {} } })
        write(project, { '.crunes/templates/base/src/index.rune.js': '' })
        await apply({ ref: 'base', yes: false })
        expect(confirm).not.toHaveBeenCalled()
      })

      it.each([['declined', false], ['cancelled', Symbol('clack:cancel')]])('keeps an existing rune folder when overwriting is %s', async (_, answer) => {
        vi.mocked(confirm).mockResolvedValue(answer)
        writeConfig({ templates: { base: {} } })
        write(project, { '.crunes/templates/base/src/index.rune.js': 'new', '.crunes/runes/base/src/index.rune.js': 'mine' })
        await expect(apply({ ref: 'base', yes: false })).rejects.toThrow('process.exit(0)')
        expect(read('.crunes/runes/base/src/index.rune.js')).toBe('mine')
      })
    })
  })

  it('exits 1 and writes nothing when the template has no entry', async () => {
    writeConfig({ templates: { empty: {} } })
    write(project, { '.crunes/templates/empty/README.md': 'no entry' })
    await expect(apply({ ref: 'empty' })).rejects.toThrow('process.exit(1)')
    expect(existsSync(join(project, '.crunes/runes'))).toBe(false)
    expect(config().runes).toBeUndefined()
  })

  it('exits 1 and writes nothing when the template path is a file', async () => {
    writeConfig({ templates: { one: { path: 'one.js' } } })
    write(project, { 'one.js': 'file' })
    await expect(apply({ ref: 'one' })).rejects.toThrow('process.exit(1)')
    expect(existsSync(join(project, '.crunes/runes'))).toBe(false)
  })
})
