/** WebSocket client for connecting to ws:// endpoints */
declare namespace ws {
  /**
   * Creates a WebSocket client handle. Call open() before send().
   * @param url WebSocket URL to connect to
   * @param opts Connection options
   */
  function client(url: string, opts?: { headers?: Record<string, string> }): WsHandle

  /** Live WebSocket connection handle returned by client() */
  interface WsHandle {
    /** Register an event handler. Call before open(). */
    on(event: 'message', fn: (msg: string) => void): void
    on(event: 'open', fn: () => void): void
    on(event: 'close', fn: (closeInfo: { code: number; reason: string }) => void): void
    on(event: 'error', fn: (err: WebSocketError) => void): void
    /** Connect and resolve when socket is open */
    open(): Promise<void>
    /** Send a message string. Socket must be open first. */
    send(msg: string): Promise<void>
    /** Close the connection gracefully. Idempotent. Returns code and reason when closed. */
    close(): Promise<{ code: number; reason: string }>
    /** Await connection closure (from client or server disconnect). Returns code and reason. */
    closed(): Promise<{ code: number; reason: string }>
  }

  interface WebSocketError extends Error {
    code?: string
  }
}
