export function createVarsUtils(vars) {
  return {
    read: (key, fallback = undefined) => Object.hasOwn(vars, key) ? vars[key] : fallback,
    has: (key) => Object.hasOwn(vars, key),
  }
}
