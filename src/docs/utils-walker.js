const KIND_MODULE     = 2
const KIND_NAMESPACE  = 4
const KIND_FUNCTION   = 64
const KIND_INTERFACE  = 256
const KIND_PROPERTY   = 1024
const KIND_METHOD     = 2048

function commentText(comment) {
  if (!comment?.summary) return ''
  return comment.summary.map(s => s.text).join('').trim()
}

function paramComment(comment, paramName) {
  const tag = comment?.blockTags?.find(t => t.tag === '@param' && t.name === paramName)
  if (!tag) return ''
  return tag.content.map(c => c.text).join('').trim()
}

function typeStr(typeObj) {
  if (!typeObj) return 'unknown'
  if (typeObj.type === 'intrinsic') return typeObj.name
  if (typeObj.type === 'literal')   return JSON.stringify(typeObj.value)
  if (typeObj.type === 'reference') {
    const args = typeObj.typeArguments
    if (args?.length) return `${typeObj.name}<${args.map(typeStr).join(', ')}>`
    return typeObj.name
  }
  if (typeObj.type === 'union') return typeObj.types.map(typeStr).join(' | ')
  if (typeObj.type === 'intersection') return typeObj.types.map(typeStr).join(' & ')
  if (typeObj.type === 'array') return `${typeStr(typeObj.elementType)}[]`
  if (typeObj.type === 'reflection') return reflectionTypeStr(typeObj.declaration)
  return typeObj.type ?? 'unknown'
}

function reflectionTypeStr(decl) {
  if (!decl) return 'object'
  if (decl.signatures?.length) {
    const sig = decl.signatures[0]
    const params = (sig.parameters ?? []).map(p => {
      const opt = p.flags?.isOptional ? '?' : ''
      return `${p.name}${opt}: ${typeStr(p.type)}`
    }).join(', ')
    return `(${params}) => ${typeStr(sig.type)}`
  }
  if (!decl.children?.length) return 'object'
  const parts = []
  for (const child of decl.children) {
    const optional = child.flags?.isOptional ? '?' : ''
    parts.push(`${child.name}${optional}: ${typeStr(child.type)}`)
  }
  return parts.length ? `{ ${parts.join('; ')} }` : 'object'
}

function walkSignature(sig) {
  const params = (sig.parameters ?? []).map(p => {
    const desc = paramComment(sig.comment, p.name) || commentText(p.comment)
    return {
      name: p.name,
      type: typeStr(p.type),
      ...(desc ? { description: desc } : {}),
      ...(p.flags?.isOptional ? { optional: true } : {}),
    }
  })
  return {
    params,
    returns: typeStr(sig.type),
  }
}

function walkMethod(child) {
  const sigs = (child.signatures ?? []).map(sig => {
    const { params, returns } = walkSignature(sig)
    const description = commentText(sig.comment)
    return {
      ...(params.length ? { params } : {}),
      returns,
      ...(description ? { description } : {}),
    }
  })
  const first = sigs[0] ?? {}
  const description = first.description ?? ''

  if (sigs.length > 1) {
    return {
      name: child.name,
      description,
      signatures: sigs,
    }
  }

  return {
    name:        child.name,
    description,
    ...(first.params?.length ? { params: first.params } : {}),
    ...(first.returns        ? { returns: first.returns } : {}),
  }
}

function walkProperty(child) {
  return {
    name: child.name,
    type: typeStr(child.type),
    description: commentText(child.comment),
    ...(child.flags?.isOptional ? { optional: true } : {}),
  }
}

function walkInterface(child) {
  return {
    description: commentText(child.comment),
    properties: (child.children ?? [])
      .filter(c => c.kind === KIND_PROPERTY)
      .map(walkProperty),
    methods: (child.children ?? [])
      .filter(c => c.kind === KIND_METHOD)
      .map(walkMethod),
  }
}

function walkFunction(child) {
  const sig = child.signatures?.[0]
  if (!sig) return null
  const { params, returns } = walkSignature(sig)
  return {
    name:        child.name,
    description: commentText(sig.comment),
    params,
    returns,
  }
}

function walkNamespace(child) {
  const functions = []
  const types = {}
  for (const c of (child.children ?? [])) {
    if (c.kind === KIND_FUNCTION) {
      const fn = walkFunction(c)
      if (fn) functions.push(fn)
    } else if (c.kind === KIND_INTERFACE) {
      types[c.name] = walkInterface(c)
    }
  }
  return {
    namespace:   child.name,
    description: commentText(child.comment),
    functions,
    ...(Object.keys(types).length ? { types } : {}),
  }
}

export function walkUtilsDocs(typedocJson) {
  const topChildren = typedocJson.children ?? []
  const candidates = topChildren.flatMap(c =>
    c.kind === KIND_MODULE ? (c.children ?? []) : [c]
  )
  return candidates
    .filter(c => c.kind === KIND_NAMESPACE || c.kind === KIND_FUNCTION)
    .map(walkNamespace)
}
