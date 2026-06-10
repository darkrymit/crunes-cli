export function parseReplReturn(value) {
  if (value === undefined || value === null) return { type: 'continue', prompt: null }
  if (typeof value === 'string') return { type: 'continue', prompt: value }
  if (value && typeof value === 'object') {
    if (value.type === 'done') return { type: 'done', message: value.message ?? null }
    if (value.type === 'prompt') return { type: 'continue', prompt: value.value ?? null }
  }
  return { type: 'continue', prompt: null }
}
