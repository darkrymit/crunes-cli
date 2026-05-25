/** Cryptographic hashing and random value generation */
declare namespace crypto {
  /**
   * Hashes data and returns raw Uint8Array bytes.
   * @param algorithm Hash algorithm e.g. sha256, md5
   * @param data String or Uint8Array binary data to hash
   */
  function hash(algorithm: string, data: string | Uint8Array): Promise<Uint8Array>

  /**
   * Hashes data and returns a hex string. Supports binary data.
   * @param algorithm Hash algorithm e.g. sha256, md5
   * @param data String or Uint8Array binary data to hash
   */
  function hashAsHex(algorithm: string, data: string | Uint8Array): Promise<string>

  /**
   * Hashes data and returns a base64 string. Supports binary data.
   * @param algorithm Hash algorithm
   * @param data String or Uint8Array binary data to hash
   */
  function hashAsBase64(algorithm: string, data: string | Uint8Array): Promise<string>

  /** Generates a random UUID v4 */
  function uuid(): string

  /** Generates cryptographically secure random bytes as a hex string */
  function randomHex(size: number): string

  /** Generates cryptographically secure random bytes as a base64 string */
  function randomBase64(size: number): string

  /**
   * Generates an HMAC signature and returns raw Uint8Array bytes.
   * @param algorithm Hash algorithm e.g. sha256, sha512
   * @param key Signing key (string or raw bytes)
   * @param data Data to sign (string or raw bytes)
   */
  function hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array>

  /**
   * Generates an HMAC signature and returns it as a Hex string.
   * @param algorithm Hash algorithm
   * @param key Signing key
   * @param data Data to sign
   */
  function hmacAsHex(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<string>

  /**
   * Generates an HMAC signature and returns it as a Base64 string.
   * @param algorithm Hash algorithm
   * @param key Signing key
   * @param data Data to sign
   */
  function hmacAsBase64(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<string>

  /**
   * Encrypts data using AES and returns raw Uint8Array bytes.
   * For GCM, the authentication tag is appended to the ciphertext.
   * @param algorithm Symmetric encryption algorithm
   * @param key Secret key (must match algorithm size requirements)
   * @param iv Initialization Vector
   * @param data Plaintext data to encrypt
   */
  function encrypt(algorithm: string, key: string | Uint8Array, iv: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array>

  /**
   * Decrypts ciphertext using AES and returns raw decrypted Uint8Array bytes.
   * For GCM, the authentication tag is expected at the end of the ciphertext.
   * @param algorithm Symmetric encryption algorithm
   * @param key Secret key
   * @param iv Initialization Vector
   * @param ciphertext Ciphertext bytes to decrypt
   */
  function decrypt(algorithm: string, key: string | Uint8Array, iv: string | Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>

  // --- Encoding Conversions ---
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
