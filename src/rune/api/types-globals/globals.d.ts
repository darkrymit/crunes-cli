/**
 * Global Sandbox Timing and Utility Functions
 * 
 * These functions and classes are exposed globally inside the isolated-vm sandbox execution context.
 */
declare namespace globals {
  /**
   * Invokes the callback after the specified delay.
   * 
   * @param callback The function to execute when the timer expires.
   * @param delay The number of milliseconds to wait before invoking the callback (default: 0).
   * @param args Additional arguments to pass to the callback.
   * @returns A unique timeout identifier.
   */
  function setTimeout(callback: (...args: any[]) => void, delay?: number, ...args: any[]): number

  /**
   * Cancels a timeout previously established by calling setTimeout().
   * 
   * @param id The identifier returned by setTimeout().
   */
  function clearTimeout(id?: number): void

  /**
   * Repeatedly invokes the callback with a fixed time delay between each call.
   * 
   * @param callback The function to execute at each interval.
   * @param delay The number of milliseconds to wait between executions (default: 0).
   * @param args Additional arguments to pass to the callback.
   * @returns A unique interval identifier.
   */
  function setInterval(callback: (...args: any[]) => void, delay?: number, ...args: any[]): number

  /**
   * Cancels an interval execution previously established by calling setInterval().
   * 
   * @param id The identifier returned by setInterval().
   */
  function clearInterval(id?: number): void

  /**
   * High-performance string-to-UTF8 encoder.
   */
  class TextEncoder {
    /**
     * Encodes a string into raw UTF-8 binary bytes.
     * 
     * @param str The string to encode.
     */
    encode(str: string): Uint8Array
  }

  /**
   * Decodes UTF-8 binary bytes into a string.
   */
  class TextDecoder {
    /**
     * Decodes raw UTF-8 binary bytes into a string.
     *
     * @param bytes The raw binary bytes.
     */
    decode(bytes: Uint8Array): string
  }

  /**
   * Represents the signal object of an AbortController.
   */
  class AbortSignal {
    /** Whether the signal has been aborted. */
    readonly aborted: boolean
    addEventListener(type: 'abort', listener: (event: { type: string }) => void): void
    removeEventListener(type: 'abort', listener: (event: { type: string }) => void): void
    dispatchEvent(event: { type: string }): void
  }

  /**
   * Provides an AbortSignal that can be used to abort one or more operations.
   */
  class AbortController {
    readonly signal: AbortSignal
    abort(): void
  }
}

// Top-level type aliases so rune API .d.ts files can reference these types
// without namespace qualification. walkUtilsDocs ignores type aliases (kind 4194304),
// so TypeDoc documentation output is unaffected.
type AbortSignal = globals.AbortSignal
type AbortController = globals.AbortController
