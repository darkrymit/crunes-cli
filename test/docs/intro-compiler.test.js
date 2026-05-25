import { describe, it, expect } from 'vitest'
import { compileIntro } from '../../src/docs/intro-compiler.js'

describe('compileIntro compiler engine', () => {
  it('compiles pure ecosystem guide when global flag is enabled (null config)', async () => {
    const output = await compileIntro({
      config: null,
      format: 'md',
      projectRoot: '/test',
      configRoot: '/test',
    })

    expect(output).toContain('# Crunes: Fast Sandboxed Scripting & Context Framework')
    expect(output).toContain('## 1. Anatomy of a Rune')
    expect(output).toContain('## 2. Sandbox Security & Permissions')
    expect(output).toContain('## 3. Dynamic `@utils` Reference')
    expect(output).toContain('### `fs`')
    expect(output).toContain('### `ws`')
    expect(output).toContain('Workspace Context')
    expect(output).toContain('No local project context loaded (global mode enabled).')
  })

  it('compiles json output when format is json', async () => {
    const output = await compileIntro({
      config: null,
      format: 'json',
      projectRoot: '/test',
      configRoot: '/test',
    })

    const parsed = JSON.parse(output)
    expect(parsed.ecosystem).toBeDefined()
    expect(parsed.ecosystem.namespaces.some(n => n.namespace === 'fs')).toBe(true)
    expect(parsed.workspace).toBeNull()
  })

  it('includes active runes and schema detailed info when config exists', async () => {
    const mockConfig = {
      runes: {
        'dummy-rune': {
          name: 'Dummy',
          description: 'A mock rune',
          permissions: { allow: ['fs:read:*'] }
        }
      },
      plugins: ['plugin-a']
    }

    const output = await compileIntro({
      config: mockConfig,
      format: 'md',
      projectRoot: '/test',
      configRoot: '/test',
    })

    expect(output).toContain('### Registered Project Runes')
    expect(output).toContain('dummy-rune')
    expect(output).toContain('Dummy')
    expect(output).toContain('fs:read:*')
    expect(output).toContain('Enabled Plugins')
    expect(output).toContain('plugin-a')
  })
})
