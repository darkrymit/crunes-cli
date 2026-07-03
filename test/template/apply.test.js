import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('../../src/plugin/registry.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({ plugins: {} }),
  resolvePluginKey: vi.fn().mockReturnValue(null),
}))
vi.mock('../../src/plugin/manifest.js', () => ({
  loadPluginJson: vi.fn(),
}))

import { resolveTemplate } from '../../src/template/commands/apply.js'
import { loadRegistry } from '../../src/plugin/registry.js'
import { loadPluginJson } from '../../src/plugin/manifest.js'

async function makeTmp() {
  const tmp = await mkdtemp(join(tmpdir(), 'crunes-template-test-'))
  await mkdir(join(tmp, '.crunes'), { recursive: true })
  return tmp
}

describe('resolveTemplate — convention path', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('derives .crunes/templates/<key>.js when entry has no path field', async () => {
    await writeFile(join(tmp, '.crunes/config.json'), JSON.stringify({
      templates: { mytemplate: { name: 'My Template' } }
    }))
    const result = await resolveTemplate(null, 'mytemplate', tmp)
    expect(result.type).toBe('local')
    expect(result.entry.path).toBe('.crunes/templates/mytemplate.js')
  })

  it('explicit path takes precedence over convention', async () => {
    await writeFile(join(tmp, '.crunes/config.json'), JSON.stringify({
      templates: { mytemplate: { path: 'custom/tmpl.js', name: 'My Template' } }
    }))
    const result = await resolveTemplate(null, 'mytemplate', tmp)
    expect(result.type).toBe('local')
    expect(result.entry.path).toBe('custom/tmpl.js')
  })

  it('string entry (legacy shorthand) still works', async () => {
    await writeFile(join(tmp, '.crunes/config.json'), JSON.stringify({
      templates: { mytemplate: '.crunes/templates/mytemplate.js' }
    }))
    const result = await resolveTemplate(null, 'mytemplate', tmp)
    expect(result.type).toBe('local')
  })
})

describe('resolveTemplate — project: source prefix', () => {
  let tmp
  beforeEach(async () => { tmp = await makeTmp() })
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }) })

  it('sourceName "project" resolves from project config', async () => {
    await writeFile(join(tmp, '.crunes/config.json'), JSON.stringify({
      templates: { mytemplate: { name: 'My Template' } }
    }))
    const result = await resolveTemplate('project', 'mytemplate', tmp)
    expect(result).not.toBeNull()
    expect(result.type).toBe('local')
  })

  it('sourceName "project" returns null when template not in config', async () => {
    await writeFile(join(tmp, '.crunes/config.json'), JSON.stringify({ templates: {} }))
    const result = await resolveTemplate('project', 'missing', tmp)
    expect(result).toBeNull()
  })

  it('sourceName "local" no longer short-circuits to project lookup', async () => {
    await writeFile(join(tmp, '.crunes/config.json'), JSON.stringify({
      templates: { mytemplate: { name: 'My Template' } }
    }))
    const result = await resolveTemplate('local', 'mytemplate', tmp)
    expect(result).toBeNull()
  })
})

describe('resolveTemplate — plugin template custom path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses templates/<key>.js convention when plugin template has no path', async () => {
    vi.mocked(loadRegistry).mockResolvedValue({
      plugins: { 'mp@myplugin': { path: '/plugins/myplugin' } }
    })
    vi.mocked(loadPluginJson).mockResolvedValue({
      templates: {
        greeting: { name: 'Greeting', permissions: { use: { allow: [] } } }
      }
    })
    const result = await resolveTemplate(null, 'greeting', '/project')
    expect(result.type).toBe('plugin')
    expect(result.templateMeta.path).toBeUndefined()
  })

  it('templateMeta carries custom path when plugin template declares path', async () => {
    vi.mocked(loadRegistry).mockResolvedValue({
      plugins: { 'mp@myplugin': { path: '/plugins/myplugin' } }
    })
    vi.mocked(loadPluginJson).mockResolvedValue({
      templates: {
        greeting: { path: 'lib/templates/greeting.js', name: 'Greeting', permissions: { use: { allow: [] } } }
      }
    })
    const result = await resolveTemplate(null, 'greeting', '/project')
    expect(result.templateMeta.path).toBe('lib/templates/greeting.js')
  })
})

describe('resolveTemplate — ambiguity message shows full keys', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists full marketplace@name:template forms, not bare names or a placeholder', async () => {
    vi.mocked(loadRegistry).mockResolvedValue({
      plugins: {
        'sole-market@git': { path: '/plugins/git' },
        'other-market@docker-tools': { path: '/plugins/docker' },
      }
    })
    vi.mocked(loadPluginJson).mockImplementation(async (dir) => {
      if (dir === '/plugins/git') return { templates: { info: { name: 'Git Info' } } }
      if (dir === '/plugins/docker') return { templates: { info: { name: 'Docker Info' } } }
      throw new Error('unexpected dir')
    })

    const { output } = await import('../../src/shared/output.js')
    const errorSpy = vi.spyOn(output, 'error').mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {})

    await resolveTemplate(null, 'info', '/project')

    expect(errorSpy).toHaveBeenCalledWith(
      '"info" matches templates in multiple sources: sole-market@git, other-market@docker-tools. ' +
      'Use sole-market@git:info or other-market@docker-tools:info.'
    )
    expect(exitSpy).toHaveBeenCalledWith(1)

    errorSpy.mockRestore()
    exitSpy.mockRestore()
  })
})
