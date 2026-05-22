function sig(fn) {
  const params = (fn.params ?? []).map(p => p.optional ? `${p.name}?` : p.name).join(', ')
  return `${fn.name}(${params})`
}

export function formatUtilsIndex(namespaces) {
  const maxLen = namespaces.reduce((m, n) => Math.max(m, n.namespace.length), 0)
  const lines = ['Available utils namespaces:', '']
  for (const ns of namespaces) {
    lines.push(`  ${ns.namespace.padEnd(maxLen + 2)} ${ns.description ?? ''}`.trimEnd())
  }
  return lines.join('\n')
}

export function formatUtilsNamespace(ns) {
  const lines = []
  lines.push(`Namespace: utils.${ns.namespace}`)
  if (ns.description) lines.push(ns.description)

  for (const fn of (ns.functions ?? [])) {
    lines.push('')
    lines.push(`  ${sig(fn)}`)
    if (fn.description) lines.push(`    ${fn.description}`)

    const params = fn.params ?? []
    if (params.length > 0) {
      lines.push('')
      lines.push('    Parameters:')
      const maxName = params.reduce((m, p) => Math.max(m, p.name.length), 0)
      const maxType = params.reduce((m, p) => Math.max(m, (p.type ?? '').length + (p.optional ? 1 : 0)), 0)
      for (const p of params) {
        const t = p.optional ? `${p.type}?` : (p.type ?? '')
        lines.push(`      ${p.name.padEnd(maxName + 2)} ${t.padEnd(maxType + 2)} ${p.description ?? ''}`.trimEnd())
      }
    }

    if (fn.returns && fn.returns !== 'void') {
      lines.push('')
      lines.push(`    Returns: ${fn.returns}`)

      const typeDef = ns.types?.[fn.returns]
      if (typeDef?.methods?.length) {
        lines.push('')
        lines.push(`    ${fn.returns} methods:`)
        for (const m of typeDef.methods) {
          const mSig = sig(m)
          lines.push(`      ${mSig.padEnd(20)} ${m.description ?? ''}`.trimEnd())
        }
      }
    }
  }

  return lines.join('\n')
}
