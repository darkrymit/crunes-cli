import { describe, it, expect } from 'vitest'
import { formatUtilsIndex, formatUtilsNamespace } from '../../src/docs/utils-formatter.js'

const WS_NS = {
  namespace: 'ws',
  description: 'WebSocket client',
  functions: [
    {
      name: 'client',
      description: 'Creates a WS handle.',
      params: [
        { name: 'url', type: 'string', description: 'WS URL' },
        { name: 'opts', type: 'object', optional: true, description: 'Options' },
      ],
      returns: 'WsHandle',
    },
  ],
  types: {
    WsHandle: {
      description: 'WS connection handle',
      methods: [
        { name: 'open',  description: 'Connect.',       returns: 'Promise<void>' },
        { name: 'send',  description: 'Send a message.', params: [{ name: 'msg', type: 'string' }], returns: 'Promise<void>' },
        { name: 'close', description: 'Close.',          returns: 'Promise<void>' },
      ],
    },
  },
}

describe('formatUtilsIndex', () => {
  it('renders header', () => {
    expect(formatUtilsIndex([WS_NS])).toContain('Available utils namespaces')
  })

  it('renders namespace name and description', () => {
    const out = formatUtilsIndex([WS_NS])
    expect(out).toContain('ws')
    expect(out).toContain('WebSocket client')
  })
})

describe('formatUtilsNamespace', () => {
  it('renders namespace header', () => {
    expect(formatUtilsNamespace(WS_NS)).toContain('Namespace: utils.ws')
  })

  it('renders function signature with optional marker', () => {
    expect(formatUtilsNamespace(WS_NS)).toContain('client(url, opts?)')
  })

  it('renders param types', () => {
    const out = formatUtilsNamespace(WS_NS)
    expect(out).toContain('string')
    expect(out).toContain('WS URL')
  })

  it('renders Returns line', () => {
    expect(formatUtilsNamespace(WS_NS)).toContain('Returns: WsHandle')
  })

  it('renders WsHandle methods block', () => {
    const out = formatUtilsNamespace(WS_NS)
    expect(out).toContain('WsHandle methods')
    expect(out).toContain('open()')
    expect(out).toContain('send(msg)')
    expect(out).toContain('close()')
  })

  it('renders WsHandle methods block when wrapped in Promise', () => {
    const wsNsWithPromise = {
      ...WS_NS,
      functions: [
        {
          ...WS_NS.functions[0],
          returns: 'Promise<WsHandle>',
        }
      ]
    }
    const out = formatUtilsNamespace(wsNsWithPromise)
    expect(out).toContain('WsHandle methods')
    expect(out).toContain('open()')
  })

  it('renders fields block when properties exist', () => {
    const nsWithProps = {
      ...WS_NS,
      types: {
        WsHandle: {
          properties: [
            { name: 'ok', type: 'boolean', description: 'True if ok' }
          ],
          methods: [
            { name: 'close', description: 'Close connection', returns: 'void' }
          ]
        }
      }
    }
    const out = formatUtilsNamespace(nsWithProps)
    expect(out).toContain('WsHandle fields')
    expect(out).toContain('ok   boolean   True if ok')
    expect(out).toContain('WsHandle methods')
    expect(out).toContain('close()')
  })

  it('snapshot', () => {
    expect(formatUtilsNamespace(WS_NS)).toMatchSnapshot()
  })
})
