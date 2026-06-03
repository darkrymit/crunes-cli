import { describe, it, expect } from 'vitest'
import { walk } from '../../src/docs/ts-walker.js'

// Fixture: module wrapper (kind=2) → namespace (kind=4) → function + interface
const FIXTURE_MODULE = {
  kind: 2,
  name: 'shell',
  children: [{
    kind: 4,
    name: 'shell',
    comment: { summary: [{ text: 'Run shell commands' }] },
    children: [
      {
        kind: 64,
        name: 'exec',
        signatures: [{
          kind: 4096,
          comment: {
            summary: [{ text: 'Run a command.' }],
            blockTags: [{ tag: '@param', name: 'cmd', content: [{ text: 'Command string' }] }],
          },
          parameters: [
            { name: 'cmd', kind: 32768, type: { type: 'intrinsic', name: 'string' } },
            { name: 'opts', kind: 32768, flags: { isOptional: true }, type: {
              type: 'reflection',
              declaration: {
                children: [
                  { name: 'timeout', flags: { isOptional: true }, type: { type: 'intrinsic', name: 'number' },
                    comment: { summary: [{ text: 'Timeout ms.' }] } },
                ]
              }
            }},
          ],
          type: { type: 'reference', name: 'Promise', typeArguments: [{ type: 'reference', name: 'ShellResult' }] },
        }],
      },
      {
        kind: 256,
        name: 'ShellResult',
        comment: { summary: [{ text: 'Result of exec.' }] },
        extendedTypes: [],
        children: [
          { kind: 1024, name: 'stdout', flags: { isReadonly: true }, type: { type: 'intrinsic', name: 'string' },
            comment: { summary: [{ text: 'Standard output.' }] } },
          { kind: 1024, name: 'exitCode', flags: {}, type: { type: 'intrinsic', name: 'number' },
            comment: { summary: [{ text: 'Exit code.' }] } },
          { kind: 2048, name: 'ok', signatures: [{
            kind: 4096,
            comment: { summary: [{ text: 'True if zero exit.' }] },
            parameters: [],
            type: { type: 'intrinsic', name: 'boolean' },
          }]},
        ],
      },
    ],
  }],
}

// Fixture: class with constructor + sub-namespace
const FIXTURE_CLASS = {
  kind: 2,
  name: 'globals',
  children: [{
    kind: 4,
    name: 'globals',
    comment: { summary: [{ text: 'Globals' }] },
    children: [
      {
        kind: 128,
        name: 'TextDecoder',
        comment: { summary: [{ text: 'Decodes UTF-8.' }] },
        children: [
          { kind: 512, name: 'constructor', signatures: [{
            kind: 4096,
            parameters: [
              { name: 'label', flags: { isOptional: true }, type: { type: 'intrinsic', name: 'string' } },
            ],
            type: { type: 'intrinsic', name: 'void' },
          }]},
          { kind: 1024, name: 'encoding', flags: { isReadonly: true }, type: { type: 'intrinsic', name: 'string' },
            comment: { summary: [{ text: 'Always utf-8.' }] } },
          { kind: 2048, name: 'decode', signatures: [{
            kind: 4096,
            comment: { summary: [{ text: 'Decode bytes.' }] },
            parameters: [{ name: 'bytes', type: { type: 'reference', name: 'Uint8Array' } }],
            type: { type: 'intrinsic', name: 'string' },
          }]},
        ],
      },
      {
        kind: 4,
        name: 'job',
        comment: { summary: [{ text: 'Background jobs' }] },
        children: [{
          kind: 64,
          name: 'start',
          signatures: [{
            kind: 4096,
            comment: { summary: [{ text: 'Start a job.' }] },
            parameters: [{ name: 'cmd', type: { type: 'intrinsic', name: 'string' } }],
            type: { type: 'reference', name: 'Promise', typeArguments: [{ type: 'intrinsic', name: 'void' }] },
          }],
        }],
      },
    ],
  }],
}

describe('walk — module unwrapping', () => {
  it('strips module wrapper and returns namespace nodes', () => {
    const nodes = walk(FIXTURE_MODULE)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].kind).toBe('namespace')
    expect(nodes[0].name).toBe('shell')
  })

  it('captures namespace description', () => {
    const [ns] = walk(FIXTURE_MODULE)
    expect(ns.description).toBe('Run shell commands')
  })
})

describe('walk — function', () => {
  it('produces function node with correct shape', () => {
    const [ns] = walk(FIXTURE_MODULE)
    const fn = ns.members.find(m => m.kind === 'function')
    expect(fn.name).toBe('exec')
    expect(fn.description).toBe('Run a command.')
    expect(fn.returns).toBe('Promise<ShellResult>')
  })

  it('extracts scalar param with description from @param tag', () => {
    const [ns] = walk(FIXTURE_MODULE)
    const fn = ns.members.find(m => m.kind === 'function')
    const cmd = fn.params[0]
    expect(cmd.name).toBe('cmd')
    expect(cmd.type).toBe('string')
    expect(cmd.description).toBe('Command string')
    expect(cmd.optional).toBeFalsy()
  })

  it('expands reflection param into sub-fields', () => {
    const [ns] = walk(FIXTURE_MODULE)
    const fn = ns.members.find(m => m.kind === 'function')
    const opts = fn.params[1]
    expect(opts.name).toBe('opts')
    expect(opts.optional).toBe(true)
    expect(opts.type).toBeUndefined()
    expect(opts.fields).toHaveLength(1)
    expect(opts.fields[0].name).toBe('timeout')
    expect(opts.fields[0].type).toBe('number')
    expect(opts.fields[0].description).toBe('Timeout ms.')
    expect(opts.fields[0].optional).toBe(true)
  })
})

describe('walk — interface', () => {
  it('produces interface node', () => {
    const [ns] = walk(FIXTURE_MODULE)
    const iface = ns.members.find(m => m.kind === 'interface')
    expect(iface.name).toBe('ShellResult')
    expect(iface.description).toBe('Result of exec.')
  })

  it('captures readonly on property', () => {
    const [ns] = walk(FIXTURE_MODULE)
    const iface = ns.members.find(m => m.kind === 'interface')
    const stdout = iface.properties.find(p => p.name === 'stdout')
    expect(stdout.readonly).toBe(true)
    expect(stdout.type).toBe('string')
  })

  it('non-readonly property omits readonly key', () => {
    const [ns] = walk(FIXTURE_MODULE)
    const iface = ns.members.find(m => m.kind === 'interface')
    const exitCode = iface.properties.find(p => p.name === 'exitCode')
    expect(exitCode.readonly).toBeFalsy()
  })

  it('captures method with returns', () => {
    const [ns] = walk(FIXTURE_MODULE)
    const iface = ns.members.find(m => m.kind === 'interface')
    const ok = iface.methods.find(m => m.name === 'ok')
    expect(ok.description).toBe('True if zero exit.')
    expect(ok.returns).toBe('boolean')
  })
})

describe('walk — class', () => {
  it('produces class node with constructor', () => {
    const [ns] = walk(FIXTURE_CLASS)
    const cls = ns.members.find(m => m.kind === 'class')
    expect(cls.name).toBe('TextDecoder')
    expect(cls.constructor).toHaveLength(1)
    expect(cls.constructor[0].name).toBe('label')
    expect(cls.constructor[0].optional).toBe(true)
  })

  it('captures readonly property on class', () => {
    const [ns] = walk(FIXTURE_CLASS)
    const cls = ns.members.find(m => m.kind === 'class')
    const enc = cls.properties.find(p => p.name === 'encoding')
    expect(enc.readonly).toBe(true)
  })

  it('captures method on class', () => {
    const [ns] = walk(FIXTURE_CLASS)
    const cls = ns.members.find(m => m.kind === 'class')
    const decode = cls.methods.find(m => m.name === 'decode')
    expect(decode.description).toBe('Decode bytes.')
    expect(decode.returns).toBe('string')
  })
})

describe('walk — sub-namespace', () => {
  it('produces nested namespace node inside parent', () => {
    const [ns] = walk(FIXTURE_CLASS)
    const job = ns.members.find(m => m.kind === 'namespace' && m.name === 'job')
    expect(job).toBeDefined()
    expect(job.description).toBe('Background jobs')
    expect(job.members[0].name).toBe('start')
  })
})

describe('walk — extends on interface', () => {
  it('captures extends string from extendedTypes', () => {
    const fixture = {
      kind: 2, name: 'shell',
      children: [{
        kind: 4, name: 'shell',
        comment: { summary: [] },
        children: [{
          kind: 256,
          name: 'ShellSessionWritableStream',
          comment: { summary: [] },
          extendedTypes: [{ type: 'reference', name: 'WritableStream', typeArguments: [{ type: 'union', types: [{ type: 'reference', name: 'Uint8Array' }, { type: 'intrinsic', name: 'string' }] }] }],
          children: [],
        }],
      }],
    }
    const [ns] = walk(fixture)
    const iface = ns.members.find(m => m.kind === 'interface')
    expect(iface.extends).toBe('WritableStream<Uint8Array | string>')
  })
})
