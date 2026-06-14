/** HTTP client and server utilities */
declare namespace http {
  /**
   * Makes an HTTP request. Requires `http.fetch:<METHOD>::<url>` permission. In the URL, `*` matches within a path segment and `**` matches across segments (e.g. `http.fetch:GET::https://api.example.com/**`).
   * Aligns with the Web Fetch API. Also available as the global `fetch()`.
   * @param input Request URL string or Request object
   * @param init Request options
   */
  function fetch(input: string | Request, init?: globals.RequestInit): Promise<globals.Response>

  /**
   * Creates an HTTP server handle. Call open() to bind the port.
   * Loopback (127.0.0.1) binding requires no permission.
   * External host binding requires `http.server:<host>:<port>` permission.
   * Permission is checked at construction time.
   * Pass port 0 to let the OS assign a free port (loopback only without explicit permission).
   *
   * @param port Port to listen on. Pass 0 for OS-assigned.
   * @param opts Server options. host defaults to 127.0.0.1.
   */
  function server(port: number, opts?: { host?: string }): HttpServer

  interface HttpServer {
    /** Actual bound port. Reflects OS-assigned port after open() resolves. */
    readonly port: number
    /**
     * Register a request handler. Last registration wins.
     * Handler receives an IncomingRequest and must return a Response.
     */
    on(event: 'request', handler: (req: IncomingRequest) => Response | Promise<Response>): void
    /** Bind the port and start accepting connections. */
    open(): Promise<void>
    /** Stop the server. In-flight requests complete before resolving. */
    close(): Promise<void>
    /** Resolves when the server has fully closed. */
    closed(): Promise<void>
  }

  /**
   * Incoming HTTP request received by the server.
   * Extends Request with server-side convenience properties.
   */
  interface IncomingRequest extends Request {
    /** The pathname portion of the URL, e.g. "/api/users". */
    readonly pathname: string
    /** Parsed query string parameters. */
    readonly searchParams: URLSearchParams
    /** AbortSignal that aborts when the client disconnects. Propagates into fetch(), ReadableStream cancel, etc. */
    readonly signal: AbortSignal
    /** Resolves when the client disconnects. */
    closed(): Promise<void>
    /** Register a disconnect callback. */
    on(event: 'close', fn: () => void): void
  }
}
