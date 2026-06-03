/** WebSocket client and server utilities */
declare namespace ws {
  /**
   * Creates a WebSocket client connection handle. Call open() before send().
   * Requires `ws.client:<url>` permission.
   * @param url WebSocket URL to connect to
   * @param opts Connection options
   */
  function client(url: string, opts?: { headers?: Record<string, string> }): WsClientConnection

  /**
   * Creates a WebSocket server on a standalone port.
   * Loopback binding requires no permission.
   * External binding requires `ws.server:<host>:<port>` or `ws.server:<host>:<port>:<path>` permission.
   * Permission is checked at construction time.
   *
   * @param port Port to listen on. Pass 0 for OS-assigned.
   * @param opts host defaults to 127.0.0.1. path restricts upgrades to a specific URL path.
   */
  function server(port: number, opts?: { host?: string; path?: string }): WsServer

  /**
   * Creates a WebSocket server piggybacking on an existing HttpServer.
   * WS upgrade requests matching path are intercepted; all other traffic goes to the HttpServer handler.
   * Permission is derived from the HttpServer's host and port and checked at construction.
   * path is required when multiple WS servers share the same HttpServer.
   *
   * @param httpServer An HttpServer handle returned by http.server().
   * @param opts path restricts upgrades to a specific URL path.
   */
  function server(httpServer: http.HttpServer, opts?: { path?: string }): WsServer

  interface WsServer {
    /** Bound port. For piggybacked servers, matches the HttpServer port. */
    readonly port: number
    on(event: 'connection', fn: (conn: WsServerConnection) => void): void
    on(event: 'error', fn: (err: WebSocketError) => void): void
    /** Start accepting WebSocket upgrade connections. */
    open(): Promise<void>
    close(): Promise<void>
    closed(): Promise<void>
  }

  /** Shared base for client and server WebSocket connections. */
  interface WsConnection {
    on(event: 'message', fn: (msg: string) => void): void
    on(event: 'binary', fn: (data: Uint8Array) => void): void
    on(event: 'close', fn: (info: { code: number; reason: string }) => void): void
    on(event: 'error', fn: (err: WebSocketError) => void): void
    sendText(msg: string): Promise<void>
    sendBinary(data: ArrayBuffer | Uint8Array): Promise<void>
    /** Gracefully close the connection. Resolves with the final close code and reason. */
    close(code?: number, reason?: string): Promise<{ code: number; reason: string }>
    /** Resolves when the connection closes (from either side). */
    closed(): Promise<{ code: number; reason: string }>
    /** AbortSignal that aborts when the connection closes. Propagates into fetch, ReadableStream, etc. */
    readonly signal: AbortSignal
  }

  /** Client-side connection handle returned by ws.client(). */
  interface WsClientConnection extends WsConnection {
    on(event: 'open', fn: () => void): void
    on(event: 'message', fn: (msg: string) => void): void
    on(event: 'binary', fn: (data: Uint8Array) => void): void
    on(event: 'close', fn: (info: { code: number; reason: string }) => void): void
    on(event: 'error', fn: (err: WebSocketError) => void): void
    /** Connect and resolve when the WebSocket handshake completes. */
    open(): Promise<void>
  }

  /** Server-side connection handle received in the 'connection' event callback. */
  interface WsServerConnection extends WsConnection {
    /** Unique ID assigned by the server for this connection. */
    readonly id: string
    /** Fully qualified WebSocket URL of the upgrade request, e.g. "ws://127.0.0.1:3700/logs/abc123?foo=bar". */
    readonly url: string
    /** Path portion of the upgrade URL, e.g. "/logs/abc123". */
    readonly pathname: string
    /** Parsed query parameters from the upgrade URL. Empty when no query string. */
    readonly searchParams: URLSearchParams
    /** HTTP Upgrade request headers as a Web API Headers object. */
    readonly headers: Headers
  }

  interface WebSocketError extends Error {
    code?: string
  }
}
