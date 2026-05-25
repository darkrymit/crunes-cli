import { describe, it, expect } from 'vitest'
import { buildProgram } from '../../../src/cli/program.js'

describe('program cli registration for intro', () => {
  it('has command docs intro registered with all correct options', () => {
    const program = buildProgram()
    const docs = program.commands.find(c => c.name() === 'docs')
    expect(docs).toBeDefined()
    const intro = docs.commands.find(c => c.name() === 'intro')
    expect(intro).toBeDefined()
    
    expect(intro.options.map(o => o.flags).join(',')).toContain('--global')
    expect(intro.options.map(o => o.flags).join(',')).toContain('--out')
    expect(intro.options.map(o => o.flags).join(',')).toContain('--format')
  })
})
