export function parseProjectPort(input: unknown): number | undefined {
  if (typeof input === 'string') {
    const value = input.trim()
    if (!/^\d+$/.test(value)) return undefined
    input = Number(value)
  }
  return typeof input === 'number' && Number.isInteger(input) && input >= 1 && input <= 65535
    ? input
    : undefined
}

export function validateProjectPorts(primary: unknown, additional?: unknown) {
  const projectPort = parseProjectPort(primary)
  const additionalProjectPorts: number[] = []
  const invalidPrimary = projectPort === undefined
  let invalidAdditional = additional !== undefined && !Array.isArray(additional)
  const seen = new Set<number>(projectPort === undefined ? [] : [projectPort])
  if (Array.isArray(additional)) {
    for (const input of additional) {
      const port = parseProjectPort(input)
      if (port === undefined || seen.has(port)) {
        invalidAdditional = true
        continue
      }
      seen.add(port)
      additionalProjectPorts.push(port)
    }
  }
  return {
    valid: !invalidPrimary && !invalidAdditional,
    projectPort,
    additionalProjectPorts,
    invalidPrimary,
    invalidAdditional
  }
}

// Stored configuration must contain numbers. Do not turn corrupt values into links.
export function projectPortUrl(port: unknown): string | undefined {
  return typeof port === 'number' && parseProjectPort(port) !== undefined
    ? `http://127.0.0.1:${port}`
    : undefined
}

export function inspectProjectPorts(project: {
  projectPort: unknown
  additionalProjectPorts?: unknown
}) {
  const primaryUrl = projectPortUrl(project.projectPort)
  const additionalPorts: number[] = []
  const additional = project.additionalProjectPorts
  let hasInvalidPorts = !primaryUrl || (additional !== undefined && !Array.isArray(additional))
  const seen = new Set<number>(primaryUrl ? [project.projectPort as number] : [])
  if (Array.isArray(additional)) {
    for (const port of additional) {
      if (!projectPortUrl(port) || seen.has(port)) {
        hasInvalidPorts = true
        continue
      }
      seen.add(port)
      additionalPorts.push(port)
    }
  }
  return { primaryUrl, additionalPorts, hasInvalidPorts }
}
