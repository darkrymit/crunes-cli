import { describe, it, expect } from 'vitest'
import { formatNode, formatMembers } from '../../src/docs/ts-formatter.js'

const FN_NODE = {
  kind: 'function',
  name: 'exec',
  description: 'Run a command.',
  params: [
    { name: 'cmd', type: 'string', description: 'Command string' },
    { name: 'opts', optional: true, description: 'Execution options.',
      fields: [
        { name: 'timeout', type: 'number', description: 'Timeout ms.', optional: true },
        { name: 'env', type: 'Record<string, string>', description: 'Env vars.', optional: true },
      ]
    },
  ],
  returns: 'Promise<ShellResult>',
}

const IFACE_NODE = {
  kind: 'interface',
  name: 'ShellResult',
  description: 'Result of exec.',
  properties: [
    { name: 'stdout', type: 'string', description: 'Standard output.', readonly: true },
    { name: 'exitCode', type: 'number', description: 'Exit code.' },
  ],
  methods: [
    { name: 'ok', description: 'True if zero.', params: [], returns: 'boolean' },
  ],
}

const IFACE_EXTENDS_NODE = {
  kind: 'interface',
  name: 'ShellSessionWritableStream',
  extends: 'WritableStream<Uint8Array | string>',
  description: undefined,
  properties: [],
  methods: [
    { name: 'write', description: 'Write text.', params: [{ name: 'text', type: 'string' }], returns: 'void' },
    { name: 'end', description: 'End stream.', params: [], returns: 'void' },
  ],
}

const CLASS_NODE = {
  kind: 'class',
  name: 'TextDecoder',
  description: 'Decodes UTF-8.',
  constructor: [{ name: 'label', type: 'string', optional: true }],
  properties: [{ name: 'encoding', type: 'string', description: 'Always utf-8.', readonly: true }],
  methods: [
    { name: 'decode', description: 'Decode bytes.', params: [{ name: 'bytes', type: 'Uint8Array' }], returns: 'string' },
  ],
}

const NS_NODE = {
  kind: 'namespace',
  name: 'shell',
  description: 'Run shell commands',
  members: [FN_NODE, IFACE_NODE],
}

const SUB_NS_NODE = {
  kind: 'namespace',
  name: 'shell',
  description: 'Run shell commands',
  members: [
    FN_NODE,
    { kind: 'namespace', name: 'job', description: 'Background jobs', members: [
      { kind: 'function', name: 'start', description: 'Start job.', params: [{ name: 'cmd', type: 'string' }], returns: 'Promise<void>' },
    ]},
  ],
}

describe('formatNode — function', () => {
  it('renders typed function signature with return type', () => {
    expect(formatNode(FN_NODE)).toContain('exec(cmd: string, opts?: { timeout?: number; env?: Record<string, string> }): Promise<ShellResult>')
  })

  it('renders description', () => {
    expect(formatNode(FN_NODE)).toContain('Run a command.')
  })

  it('renders scalar param description only (no type repeated)', () => {
    const out = formatNode(FN_NODE)
    expect(out).toContain('cmd Command string')
    expect(out).not.toContain('cmd string Command string')
  })

  it('renders reflection param description and field descriptions', () => {
    const out = formatNode(FN_NODE)
    expect(out).toContain('opts? Execution options.')
    expect(out).toContain('timeout? Timeout ms.')
    expect(out).toContain('env? Env vars.')
  })

  it('omits Returns: label (return type is on the sig line)', () => {
    expect(formatNode(FN_NODE)).not.toContain('Returns:')
  })

  it('shows Returns: label only when returnsDescription present', () => {
    const fn = { ...FN_NODE, returnsDescription: 'The result object.' }
    expect(formatNode(fn)).toContain('Returns: The result object.')
  })

  it('omits Returns from sig line when void', () => {
    const fn = { ...FN_NODE, returns: 'void' }
    expect(formatNode(fn)).toContain('exec(cmd: string, opts?: {')
    expect(formatNode(fn)).not.toContain('): void')
  })
})

describe('formatNode — interface', () => {
  it('renders interface name', () => {
    expect(formatNode(IFACE_NODE)).toContain('ShellResult')
  })

  it('renders description', () => {
    expect(formatNode(IFACE_NODE)).toContain('Result of exec.')
  })

  it('renders readonly property', () => {
    expect(formatNode(IFACE_NODE)).toContain('readonly stdout string Standard output.')
  })

  it('renders non-readonly property without prefix', () => {
    const out = formatNode(IFACE_NODE)
    expect(out).toContain('exitCode number Exit code.')
    expect(out).not.toContain('readonly exitCode')
  })

  it('renders method with typed sig and description', () => {
    expect(formatNode(IFACE_NODE)).toContain('ok(): boolean')
    expect(formatNode(IFACE_NODE)).toContain('True if zero.')
  })

  it('renders extends in heading', () => {
    expect(formatNode(IFACE_EXTENDS_NODE)).toContain('ShellSessionWritableStream extends WritableStream<Uint8Array | string>')
  })
})

describe('formatNode — class', () => {
  it('renders class with typed constructor params in heading', () => {
    expect(formatNode(CLASS_NODE)).toContain('TextDecoder(label?: string)')
  })

  it('renders readonly property', () => {
    expect(formatNode(CLASS_NODE)).toContain('readonly encoding string Always utf-8.')
  })

  it('renders method with typed sig and description', () => {
    const out = formatNode(CLASS_NODE)
    expect(out).toContain('decode(bytes: Uint8Array): string')
    expect(out).toContain('Decode bytes.')
  })
})

describe('formatNode — namespace', () => {
  it('renders namespace name as plain heading', () => {
    expect(formatNode(NS_NODE)).toContain('shell')
  })

  it('renders namespace description', () => {
    expect(formatNode(NS_NODE)).toContain('Run shell commands')
  })

  it('renders members inside namespace', () => {
    const out = formatNode(NS_NODE)
    expect(out).toContain('exec(cmd: string')
    expect(out).toContain('ShellResult')
  })

  it('renders sub-namespace with dotted heading', () => {
    const out = formatNode(SUB_NS_NODE)
    expect(out).toContain('shell.job')
    expect(out).toContain('start(cmd: string)')
  })
})

describe('formatNode — indent option', () => {
  it('prepends indent to all lines', () => {
    const out = formatNode(FN_NODE, { indent: '  ' })
    for (const line of out.split('\n').filter(l => l.trim() !== '')) {
      expect(line).toMatch(/^  /)
    }
  })
})

describe('formatMembers', () => {
  it('renders array of nodes separated by blank lines', () => {
    const out = formatMembers([FN_NODE, IFACE_NODE])
    expect(out).toContain('exec(cmd: string')
    expect(out).toContain('ShellResult')
  })
})

describe('multi-signature methods', () => {
  it('renders one typed line per overload, nothing below', () => {
    const iface = {
      kind: 'interface',
      name: 'ShellSession',
      properties: [],
      methods: [
        { name: 'on', description: 'Register callback.', params: [{ name: 'event', type: "'exit'" }, { name: 'callback', type: '(code: number) => void' }], returns: 'void' },
        { name: 'on', description: 'Register callback.', params: [{ name: 'event', type: "'error'" }, { name: 'callback', type: '(err: string) => void' }], returns: 'void' },
      ],
    }
    const out = formatNode(iface)
    expect(out).toContain("on(event: 'exit', callback: (code: number) => void)")
    expect(out).toContain("on(event: 'error', callback: (err: string) => void)")
    // no description block below overloads
    expect(out).not.toContain('Register callback.')
  })
})
