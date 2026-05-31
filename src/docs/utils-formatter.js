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

function resolveBaseType(typeStr) {
  return typeStr.replace(/<.*>$/, '')
}

function lookupType(typeName, nsTypes, globalTypes) {
  return nsTypes?.[typeName] ?? globalTypes[typeName]
    ?? nsTypes?.[resolveBaseType(typeName)] ?? globalTypes[resolveBaseType(typeName)]
}

export function formatUtilsNamespace(ns, globalTypes = {}) {
  const lines = []
  lines.push(`Namespace: utils.${ns.namespace}`)
  if (ns.description) lines.push(ns.description)

  // Collect all referenced external types across all functions for bottom section
  const referencedTypes = new Map() // name -> typeDef, insertion-ordered

  function trackType(rawType) {
    const base = resolveBaseType(rawType)
    for (const name of [rawType, base]) {
      if (referencedTypes.has(name)) return
      const def = ns.types?.[name] ?? globalTypes[name]
      if (def) { referencedTypes.set(name, def); return }
    }
  }

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
        trackType(p.type ?? '')
      }
    }

    if (fn.returns && fn.returns !== 'void') {
      lines.push('')
      lines.push(`    Returns: ${fn.returns}`)
      let retType = fn.returns
      const m = fn.returns.match(/^Promise<(.+)>$/)
      if (m) retType = m[1]
      trackType(retType)
    }
  }

  // Render collected type definitions once at the bottom
  if (referencedTypes.size > 0) {
    lines.push('')
    lines.push('  Referenced Types:')
    for (const [typeName, typeDef] of referencedTypes) {
      lines.push('')
      lines.push(`    ${typeName}`)
      if (typeDef.description) lines.push(`      ${typeDef.description}`)
      if (typeDef.properties?.length) {
        for (const p of typeDef.properties) {
          const t = p.optional ? `${p.type}?` : (p.type ?? '')
          const desc = p.description ? `  ${p.description}` : ''
          lines.push(`      ${p.name}  ${t}${desc}`.trimEnd())
        }
      }
      if (typeDef.methods?.length) {
        for (const meth of typeDef.methods) {
          lines.push(`      ${sig(meth).padEnd(20)} ${meth.description ?? ''}`.trimEnd())
        }
      }
    }
  }

  return lines.join('\n')
}
