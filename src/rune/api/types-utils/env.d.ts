/** Read environment variables from process.env or .env files */
declare namespace env {
  /**
   * Returns the value of an environment variable, or fallback if absent.
   * Requires `env.read:<key>` (no source prefix — checks `process.env`, then `.env.local`, then `.env`, in that order, returning the first match) or the source-scoped `env.read:<source>::<key>` (where source is `process` or any .env filename, e.g. a custom `.env.production`) permission. `*` matches any characters in the key (e.g. `env.read:GITHUB_*` or `env.read:process::GITHUB_*`).
   * @param key Environment variable name
   * @param fallback Value returned if key is absent
   */
  function read(key: string, fallback?: unknown): Promise<string | unknown>

  /**
   * Returns true if the environment variable exists and is permitted.
   * Requires `env.read:<key>` (no source prefix — checks `process.env`, then `.env.local`, then `.env`, in that order, returning true on the first match) or the source-scoped `env.read:<source>::<key>` (where source is `process` or any .env filename, e.g. a custom `.env.production`) permission. `*` matches any characters in the key (e.g. `env.read:GITHUB_*` or `env.read:process::GITHUB_*`).
   * @param key Environment variable name
   */
  function has(key: string): Promise<boolean>
}
