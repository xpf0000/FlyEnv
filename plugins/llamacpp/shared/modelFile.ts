export const isStandaloneGGUFPath = (path: string): boolean => {
  const segments = path.replace(/\\/g, '/').split('/')
  const filename = segments.at(-1)?.toLowerCase() ?? ''
  return (
    filename.endsWith('.gguf') &&
    !/-\d{5}-of-\d{5}\.gguf$/.test(filename) &&
    !/mmproj/.test(filename) &&
    !/^imatrix(?:[-_.]|$)/.test(filename) &&
    !/^mtp(?:[-_.]|$)/.test(filename) &&
    !segments.slice(0, -1).some((segment) => /^(?:mtp|mmproj|imatrix)$/i.test(segment))
  )
}
