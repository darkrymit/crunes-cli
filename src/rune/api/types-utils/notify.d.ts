/** Send OS desktop notifications on Windows, macOS, and Linux */
declare namespace notify {
  interface NotifyResult {
    /** true if the notification was dispatched successfully */
    sent: boolean
    /** present when sent is false — describes why */
    reason?: string
  }

  interface NotifyOpts {
    /** Urgency level. Default: 'normal' */
    urgency?: 'low' | 'normal' | 'critical'
    /**
     * Throw an error instead of returning { sent: false } on failure.
     * Default: false
     */
    throw?: boolean
  }

  /**
   * Sends a desktop notification.
   * Requires `notify.send` permission.
   *
   * Returns `{ sent: true }` on success.
   * Returns `{ sent: false, reason }` on failure unless `opts.throw` is true.
   *
   * @example
   * const result = await notify.send('Build done', 'All tests passed')
   * await notify.send('Disk full', 'Clean up now', { urgency: 'critical', throw: true })
   */
  function send(title: string, message: string, opts?: NotifyOpts): Promise<NotifyResult>
}
