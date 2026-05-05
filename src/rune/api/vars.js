export function createVarsUtils(vars) {
  return {
    get: (key, fallback = undefined) => Object.hasOwn(vars, key) ? vars[key] : fallback,
    has: (key) => Object.hasOwn(vars, key),
  }
}
