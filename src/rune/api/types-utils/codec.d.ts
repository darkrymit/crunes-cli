/** Encoding and decoding conversions between bytes, hex, base64, and UTF-8 */
declare namespace codec {
  /** Encodes raw bytes or a string to a Hex string */
  function toHex(data: Uint8Array | string): string

  /** Parses a Hex string into raw bytes */
  function fromHex(hex: string): Uint8Array

  /** Encodes raw bytes or a string to a Base64 string */
  function toBase64(data: Uint8Array | string): string

  /** Parses a Base64 string into raw bytes */
  function fromBase64(base64: string): Uint8Array

  /** Encodes a UTF-8 string to raw Uint8Array bytes */
  function fromUtf8(utf8: string): Uint8Array

  /** Decodes raw Uint8Array bytes to a UTF-8 string */
  function toUtf8(data: Uint8Array): string
}
