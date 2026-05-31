/** HTTP fetch with permission-gated URL access. Called as utils.http.fetch(url, opts) or via global fetch(). */
declare namespace http {
  interface RequestInit {
    method?: string
    headers?: Record<string, string> | Headers
    body?: string | Uint8Array | ReadableStream<Uint8Array> | FormData | URLSearchParams | Blob
    /** Request timeout in milliseconds. Default: 30000. crunes-specific extension. */
    timeout?: number
  }

  interface Response {
    readonly ok: boolean
    readonly status: number
    readonly statusText: string
    readonly headers: Headers
    readonly bodyUsed: boolean
    /** Reads and returns the response body as a UTF-8 string. Consumes the body. */
    text(): Promise<string>
    /** Reads and parses the response body as JSON. Consumes the body. */
    json(): Promise<unknown>
    /** Reads and returns the response body as a Blob. Consumes the body. */
    blob(): Promise<Blob>
    /** Returns a live ReadableStream of the response body. Consumes the body. */
    body(): ReadableStream<Uint8Array>
  }

  /** @deprecated Use Response */
  type FetchResponse = Response

  /**
   * Makes an HTTP request. Requires `http.fetch:<METHOD>:<url>` permission.
   * Aligns with the Web Fetch API. Also available as the global `fetch()`.
   * @param input Request URL string or Request object
   * @param init Request options
   */
  function fetch(input: string | Request, init?: RequestInit): Promise<Response>
}
