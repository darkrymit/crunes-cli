/** Read environment variables from process.env or .env files */
declare namespace env {
  /**
   * Returns the value of an environment variable, or fallback if absent.
   * Requires `env.read:<source>:<key>` permission (where source is 'process' or a .env filename like '.env').
   * @param key Environment variable name
   * @param fallback Value returned if key is absent
   */
  function read(key: string, fallback?: unknown): Promise<string | unknown>

  /**
   * Returns true if the environment variable exists and is permitted.
   * Requires `env.read:<source>:<key>` permission (where source is 'process' or a .env filename like '.env').
   * @param key Environment variable name
   */
  function has(key: string): Promise<boolean>
}
