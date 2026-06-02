/** HTTP fetch with permission-gated URL access. Called as utils.http.fetch(url, opts) or via global fetch(). */
declare namespace http {
  /**
   * Makes an HTTP request. Requires `http.fetch:<METHOD>::<url>` permission.
   * Aligns with the Web Fetch API. Also available as the global `fetch()`.
   * @param input Request URL string or Request object
   * @param init Request options
   */
  function fetch(input: string | Request, init?: globals.RequestInit): Promise<globals.Response>
}
