import { describe, it, expect } from 'vitest'
import { formatHelp } from '../../src/docs/formatter.js'

describe('formatHelp', () => {
  it('includes usage line with rune key', () => {
    const out = formatHelp(null, { key: 'myrune' })
    expect(out).toContain('crunes run myrune')
  })
  it('includes option flags and description', () => {
    const schema = { options: [{ flags: '-c, --count <number>', description: 'Max results', def: 10 }], positionals: [] }
    const out = formatHelp(schema, { key: 'myrune' })
    expect(out).toContain('-c, --count <number>')
    expect(out).toContain('Max results')
    expect(out).toContain('10')
  })
  it('includes positional spec and description', () => {
    const schema = { options: [], positionals: [{ spec: '<target>', description: 'The target' }] }
    const out = formatHelp(schema, { key: 'myrune' })
    expect(out).toContain('<target>')
    expect(out).toContain('The target')
  })
  it('shows description when schema is null', () => {
    const out = formatHelp(null, { key: 'myrune', description: 'Does stuff' })
    expect(out).toContain('Does stuff')
  })
  it('renders Examples block with usage and description', () => {
    const schema = { options: [], positionals: [], examples: [{ usage: 'crunes run myrune foo', description: 'Basic use' }] }
    const out = formatHelp(schema, { key: 'myrune' })
    expect(out).toContain('Examples:')
    expect(out).toContain('crunes run myrune foo')
    expect(out).toContain('Basic use')
  })
  it('renders example without description', () => {
    const schema = { options: [], positionals: [], examples: [{ usage: 'crunes run myrune foo' }] }
    const out = formatHelp(schema, { key: 'myrune' })
    expect(out).toContain('crunes run myrune foo')
  })
  it('omits Examples block when no examples', () => {
    const schema = { options: [], positionals: [], examples: [] }
    const out = formatHelp(schema, { key: 'myrune' })
    expect(out).not.toContain('Examples:')
  })
})

describe('formatHelp recursive', () => {
  it('outputs clean recursively indented commands', () => {
    const schema = {
      options: [{ flags: '--verbose', description: 'Verbose root' }],
      commands: [
        {
          name: 'remote',
          description: 'Git remotes',
          commands: [
            {
              name: 'add',
              description: 'Add remote',
              positionals: [{ spec: '<name>' }, { spec: '<url>' }],
              options: [{ flags: '--fetch', description: 'Fetch first' }]
            }
          ]
        }
      ]
    }

    const output = formatHelp(schema, { key: 'git', description: 'Git helper' })
    expect(output).toContain('Usage: crunes run git <command> [options]')
    expect(output).toContain('remote                         Git remotes')
    expect(output).toContain('add <name> <url>           Add remote')
    expect(output).toContain('--fetch                    Fetch first')
  })
})
