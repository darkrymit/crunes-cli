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
