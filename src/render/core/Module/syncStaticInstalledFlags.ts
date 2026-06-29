type StaticRow = {
  version?: string
  bin?: string
  installed?: boolean
}

type InstalledRow = {
  version?: string | null
  bin?: string
}

export const syncStaticInstalledFlags = (rows: StaticRow[], installed: InstalledRow[]) => {
  const installedBins = new Set(installed.map((item) => item.bin).filter(Boolean))
  const installedVersions = new Set(
    installed.map((item) => item.version).filter((value): value is string => !!value)
  )

  rows.forEach((row) => {
    row.installed =
      (!!row.bin && installedBins.has(row.bin)) ||
      (!!row.version && installedVersions.has(row.version))
  })
}
