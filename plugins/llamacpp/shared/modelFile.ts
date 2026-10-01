export const isGGUFShardPath = (path: string): boolean =>
  /-\d{5}-of-\d{5}\.gguf$/i.test(path.replace(/\\/g, '/').split('/').at(-1) ?? '')

export const isStandaloneGGUFPath = (path: string, repoId = ''): boolean => {
  const segments = path.replace(/\\/g, '/').split('/')
  const filename = segments.at(-1)?.toLowerCase() ?? ''
  return (
    filename.endsWith('.gguf') &&
    !/(?:^|[-_.])draft(?:[-_.]|$)/i.test(repoId) &&
    !isGGUFShardPath(path) &&
    !/mmproj/.test(filename) &&
    !/^imatrix(?:[-_.]|$)/.test(filename) &&
    !/^mtp(?:[-_.]|$)/.test(filename) &&
    !/(?:^|[-_.])dflash(?:[-_.]|$)/.test(filename) &&
    !/(?:^|[-_.])(?:mtp[-_.]draft|draft[-_.]mtp)(?:[-_.]|$)/.test(filename) &&
    !/[-_.]vision(?:[-_.]encoder)?\.gguf$/.test(filename) &&
    !segments.slice(0, -1).some((segment) => /^(?:mtp|mmproj|imatrix)$/i.test(segment))
  )
}
