type ParsedVersion = {
  segments: string[]
  preRelease?: string
}

const versionPattern =
  /^[v^~<>=]*?(\d+(?:\.(?:[x*]|\d+))*)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i

function parseVersion(version: unknown): ParsedVersion {
  if (typeof version !== 'string') {
    throw new TypeError('Invalid argument expected string')
  }

  const match = version.match(versionPattern)
  if (!match) {
    throw new Error(`Invalid argument not valid semver ('${version}' received)`)
  }

  return {
    segments: match[1].split('.'),
    preRelease: match[2]
  }
}

function isWildcard(segment: string) {
  return segment === '*' || segment.toLowerCase() === 'x'
}

function compareNumericSegments(a: string, b: string) {
  const normalizedA = a.replace(/^0+/, '') || '0'
  const normalizedB = b.replace(/^0+/, '') || '0'

  if (normalizedA.length !== normalizedB.length) {
    return normalizedA.length > normalizedB.length ? 1 : -1
  }
  if (normalizedA === normalizedB) {
    return 0
  }
  return normalizedA > normalizedB ? 1 : -1
}

function compareSegment(a: string, b: string) {
  if (isWildcard(a) || isWildcard(b)) {
    return 0
  }

  const aIsNumeric = /^\d+$/.test(a)
  const bIsNumeric = /^\d+$/.test(b)
  if (aIsNumeric && bIsNumeric) {
    return compareNumericSegments(a, b)
  }
  if (aIsNumeric !== bIsNumeric) {
    return aIsNumeric ? -1 : 1
  }
  if (a === b) {
    return 0
  }
  return a > b ? 1 : -1
}

function compareSegments(a: string[], b: string[]) {
  const length = Math.max(a.length, b.length)

  for (let i = 0; i < length; i++) {
    const result = compareSegment(a[i] ?? '0', b[i] ?? '0')
    if (result !== 0) {
      return result
    }
  }

  return 0
}

export function compareVersions(av: unknown, bv: unknown) {
  const a = parseVersion(av)
  const b = parseVersion(bv)
  const segmentResult = compareSegments(a.segments, b.segments)
  if (segmentResult !== 0) {
    return segmentResult
  }

  if (a.preRelease && b.preRelease) {
    return compareSegments(a.preRelease.split('.'), b.preRelease.split('.'))
  }
  if (a.preRelease || b.preRelease) {
    return a.preRelease ? -1 : 1
  }

  return 0
}
