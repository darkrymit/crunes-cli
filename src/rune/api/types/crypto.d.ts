/** Cryptographic hashing and random value generation */
declare namespace crypto {
  namespace hash {
    /**
     * Hashes data and returns a hex string.
     * @param algorithm Hash algorithm e.g. sha256, md5
     * @param data Data to hash
     */
    function hex(algorithm: string, data: string): string

    /**
     * Hashes data and returns a base64 string.
     * @param algorithm Hash algorithm
     * @param data Data to hash
     */
    function base64(algorithm: string, data: string): string
  }

  /** Generates a random UUID v4 */
  function uuid(): string

  /**
   * Generates cryptographically random bytes as a hex string.
   * @param size Number of bytes
   */
  function hex(size: number): string

  /**
   * Generates cryptographically random bytes as a base64 string.
   * @param size Number of bytes
   */
  function base64(size: number): string
}
