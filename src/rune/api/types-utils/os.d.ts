/**
 * Non-identifying facts about the host the rune is running on.
 *
 * Ungated — no permission is required. Values are static for the lifetime of
 * the run and the object is frozen.
 *
 * Deliberately excludes tmpdir, homedir, hostname, username, cpus and memory:
 * on Windows tmpdir carries the username, which no rune should receive without
 * a grant.
 */
declare namespace os {
  /** Node's process.platform: 'win32' | 'darwin' | 'linux' | ... */
  const platform: string

  /** Node's process.arch: 'x64' | 'arm64' | ... */
  const arch: string

  /**
   * The shell `shell.exec` resolves to on this host in default mode.
   * Branch on this rather than inferring it from `platform`.
   */
  const shell: 'bash' | 'sh' | 'cmd'

  /** Path separator for this platform: '\\' on Windows, '/' elsewhere. */
  const pathSep: string

  /** Line ending for this platform: '\r\n' on Windows, '\n' elsewhere. */
  const eol: string
}
