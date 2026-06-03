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

  it('renders WsHandle in Referenced Types block', () => {
    const out = formatUtilsNamespace(WS_NS)
    expect(out).toContain('Referenced Types:')
    expect(out).toContain('WsHandle')
    expect(out).toContain('open()')
    expect(out).toContain('send(msg)')
    expect(out).toContain('close()')
  })

  it('renders WsHandle in Referenced Types block when wrapped in Promise', () => {
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
    expect(out).toContain('Referenced Types:')
    expect(out).toContain('WsHandle')
    expect(out).toContain('open()')
  })

  it('renders properties and methods in Referenced Types block', () => {
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
    expect(out).toContain('Referenced Types:')
    expect(out).toContain('WsHandle')
    expect(out).toContain('ok  boolean  True if ok')
    expect(out).toContain('close()')
  })

  it('renders two separate blocks when the same function name appears twice (overloads)', () => {
    const ns = {
      namespace: 'ws',
      description: 'WS',
      functions: [
        {
          name: 'server',
          description: 'Standalone server.',
          params: [{ name: 'port', type: 'number', description: 'Port to listen on.' }],
          returns: 'WsServer',
        },
        {
          name: 'server',
          description: 'Piggybacked server.',
          params: [{ name: 'httpServer', type: 'HttpServer', description: 'Existing HTTP server.' }],
          returns: 'WsServer',
        },
      ],
      types: {
        WsServer: {
          description: 'WS server handle',
          properties: [{ name: 'port', type: 'number', description: 'Bound port.' }],
          methods: [{ name: 'open', description: 'Start server.', returns: 'Promise<void>' }],
        },
      },
    }
    const out = formatUtilsNamespace(ns)
    // Both overloads appear
    expect(out).toContain('server(port)')
    expect(out).toContain('Standalone server.')
    expect(out).toContain('server(httpServer)')
    expect(out).toContain('Piggybacked server.')
    // WsServer referenced only once at the bottom
    expect(out.indexOf('WsServer')).not.toBe(out.lastIndexOf('WsServer'))
    expect(out).toContain('Referenced Types:')
    expect((out.match(/Referenced Types:/g) ?? []).length).toBe(1)
  })

  it('snapshot', () => {
    expect(formatUtilsNamespace(WS_NS)).toMatchSnapshot()
  })
})
