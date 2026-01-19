import { compareVersions as compareVersion } from 'compare-versions'

export function versionFixed(version?: string | null) {
  return (
    version
      ?.split('.')
      ?.map((v) => {
        const vn = parseInt(v)
        if (isNaN(vn)) {
          return '0'
        }
        return `${vn}`
      })
      ?.join('.') ?? '0'
  )
}

export function compareVersions(av: any, bv: any) {
  return compareVersion(versionFixed(`${av}`), versionFixed(`${bv}`))
}
