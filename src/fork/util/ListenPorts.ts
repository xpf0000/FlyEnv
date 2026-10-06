/** Extract numeric TCP listeners without interpreting shell commands or Unix sockets. */
export function portFromAddress(address: string, defaultPort = 80): number | undefined {
  address = address.replace(/^['"]|['"]$/g, '')
  if (/^(?:unix|fd)[:/]/i.test(address)) return undefined
  const match = address.match(/:(\d+)(?:-\d+)?$/)
  const port = /^\d+$/.test(address) ? Number(address) : match ? Number(match[1]) : defaultPort
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined
}

export function portsFromListenConfig(content: string): number[] {
  const ports = new Set<number>()
  // Tokenize both line-based Apache and inline Nginx directives. Quoted text
  // and comments cannot introduce a listener; braces/semicolons start directives.
  const tokens =
    content.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|[{};\n]|[^\s{};#"']+/g) ?? []
  let directiveStart = true
  let listener = false
  for (const token of tokens) {
    if (token.startsWith('#')) continue
    if (token === '\n' && listener) continue
    if (/^[{};\n]$/.test(token)) {
      directiveStart = true
      listener = false
      continue
    }
    if (listener) {
      const port = portFromAddress(token)
      if (port) ports.add(port)
      listener = false
    } else if (directiveStart) listener = token.toLowerCase() === 'listen'
    directiveStart = false
  }
  return [...ports]
}
