import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'

vi.mock('../../src/rune/isolation/runner.js', () => ({
  runRuneInIsolate: vi.fn().mockResolvedValue([]),
  executePluginRune: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../src/plugin/registry.js', () => ({
  loadRegistry: vi.fn().mockResolvedValue({ plugins: {} }),
  resolvePluginKey: vi.fn().mockReturnValue(null),
}))

import { runRune } from '../../src/rune/resolver.js'
import { runRuneInIsolate } from '../../src/rune/isolation/runner.js'

const baseConfig = {
  runes: {
    hello: { path: 'runes/hello.js', permissions: { allow: [], deny: [] } },
  },
}

describe('runRune — convention path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('derives .crunes/runes/<key>.js when entry has no path field', async () => {
    await runRune('/project', { runes: { hello: {} } }, 'hello', [])
    expect(runRuneInIsolate).toHaveBeenCalledWith(
      join('/project', '.crunes/runes/hello.js'),
      expect.anything(), [], '/project', expect.anything()
    )
  })

  it('derives convention path relative to configDir', async () => {
    await runRune('/project', { runes: { hello: {} } }, 'hello', [], { configDir: '/config' })
    expect(runRuneInIsolate).toHaveBeenCalledWith(
      join('/config', '.crunes/runes/hello.js'),
      expect.anything(), [], '/project', expect.anything()
    )
  })

  it('explicit path takes precedence over convention', async () => {
    await runRune('/project', { runes: { hello: { path: 'custom/hello.js' } } }, 'hello', [])
    expect(runRuneInIsolate).toHaveBeenCalledWith(
      join('/project', 'custom/hello.js'),
      expect.anything(), [], '/project', expect.anything()
    )
  })
})

describe('runRune — project: prefix', () => {
  beforeEach(() => vi.clearAllMocks())

  it('project: prefix resolves from project config only', async () => {
    await runRune('/project', { runes: { hello: { path: 'runes/hello.js' } } }, 'project:hello', [])
    expect(runRuneInIsolate).toHaveBeenCalledWith(
      join('/project', 'runes/hello.js'),
      expect.anything(), [], '/project', expect.anything()
    )
  })

  it('project: prefix returns null when key not in config', async () => {
    const result = await runRune('/project', { runes: {} }, 'project:missing', [])
    expect(result).toBeNull()
  })

  it('local: prefix is no longer special — treated as bare key lookup', async () => {
    const result = await runRune('/project', { runes: {} }, 'local:hello', [])
    expect(result).toBeNull()
    expect(runRuneInIsolate).not.toHaveBeenCalled()
  })
})

describe('runRune — configDir', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves local rune file from dir when configDir is not provided', async () => {
    await runRune('/project', baseConfig, 'hello', [], {})
    expect(runRuneInIsolate).toHaveBeenCalledWith(
      join('/project', 'runes/hello.js'),
      expect.anything(),
      [],
      '/project',
      expect.anything()
    )
  })

  it('resolves local rune file from configDir when provided', async () => {
    await runRune('/project', baseConfig, 'hello', [], { configDir: '/config-repo' })
    expect(runRuneInIsolate).toHaveBeenCalledWith(
      join('/config-repo', 'runes/hello.js'),
      expect.anything(),
      [],
      '/project',
      expect.anything()
    )
  })

  it('projectDir (4th arg to runRuneInIsolate) is always dir, not configDir', async () => {
    await runRune('/project', baseConfig, 'hello', [], { configDir: '/config-repo' })
    const [, , , projectDirArg] = runRuneInIsolate.mock.calls[0]
    expect(projectDirArg).toBe('/project')
  })
})

describe('runRune — local npm imports via .crunes/node_modules', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes null as pluginDeps (allow-list is the only gate)', async () => {
    const config = { runes: { hello: { path: 'runes/hello.js' } } }
    await runRune('/project', config, 'hello', [])
    const opts = runRuneInIsolate.mock.calls[0][4]
    expect(opts.pluginDeps).toBeNull()
  })

  it('passes <configDir>/.crunes/node_modules as nodeModulesDir', async () => {
    const config = { runes: { hello: { path: 'runes/hello.js' } } }
    await runRune('/project', config, 'hello', [])
    const opts = runRuneInIsolate.mock.calls[0][4]
    expect(opts.nodeModulesDir).toBe(join('/project', '.crunes', 'node_modules'))
  })

  it('nodeModulesDir uses configDir when provided', async () => {
    const config = { runes: { hello: { path: 'runes/hello.js' } } }
    await runRune('/project', config, 'hello', [], { configDir: '/config' })
    const opts = runRuneInIsolate.mock.calls[0][4]
    expect(opts.nodeModulesDir).toBe(join('/config', '.crunes', 'node_modules'))
  })
})
