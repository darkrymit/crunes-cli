import { describe, it, expect } from 'vitest'
import { compileIntro } from '../../src/docs/intro-compiler.js'

describe('compileIntro compiler engine', () => {
  it('compiles pure ecosystem guide when global flag is enabled (null config)', async () => {
    const output = await compileIntro({
      config: null,
      format: 'text',
      projectRoot: '/test',
      configRoot: '/test',
    })

    expect(output).toContain('# Crunes: Fast Sandboxed Scripting & Context Framework')
    expect(output).toContain('## 1. Anatomy of a Rune')
    expect(output).toContain('## 2. CLI Calling & Argument Conventions')
    expect(output).toContain('## 3. Configuration Reference')
    expect(output).toContain('## 6. Dynamic `@utils` Reference')
    expect(output).toContain('### `fs`')
    expect(output).toContain('### `ws`')
    expect(output).toContain('## 4. Rune Exports API Reference')
    expect(output).toContain('## 5. Global Sandbox APIs')
  })

  it('includes ecosystem utils reference in text output', async () => {
    const output = await compileIntro({
      config: null,
      projectRoot: '/test',
      configRoot: '/test',
    })

    expect(output).toContain('### `fs`')
    expect(output).toContain('### `ws`')
    expect(output).toContain('### `json`')
  })

  it('compiles without error when config with runes exists', async () => {
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
      projectRoot: '/test',
      configRoot: '/test',
    })

    expect(output).toContain('# Crunes: Fast Sandboxed Scripting & Context Framework')
  })
})
