import { describe, it, expect } from 'vitest'
import { compileIntro } from '../../src/docs/intro-compiler.js'

describe('compileIntro compiler engine', () => {
  it('compiles the pure ecosystem guide', async () => {
    const output = await compileIntro()

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
    const output = await compileIntro()

    expect(output).toContain('### `fs`')
    expect(output).toContain('### `ws`')
    expect(output).toContain('### `json`')
  })
})
