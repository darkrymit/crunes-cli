export class CircularRuneError extends Error {
  constructor(chain) {
    super(`Circular rune call: ${chain.join(' → ')}`)
    this.name = 'CircularRuneError'
  }
}
