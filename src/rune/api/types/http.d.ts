/** HTTP fetch with permission-gated URL access. Called as utils.http.fetch(url, opts). */
declare namespace http {
  /**
   * Makes an HTTP request. Requires `http.fetch:<METHOD>:<url>` permission.
   * @param url Request URL
   * @param opts Request options
   */
  function fetch(url: string, opts?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    timeout?: number
  }): Promise<FetchResponse>

  interface FetchResponse {
    /** True if status is 2xx */
    ok: boolean
    status: number
    statusText: string
    headers: Record<string, string>
    /** Returns the response body as a string */
    text(): Promise<string>
    /** Parses and returns the response body as JSON */
    json(): Promise<unknown>
  }
}
