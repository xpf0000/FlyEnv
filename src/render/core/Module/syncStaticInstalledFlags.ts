type StaticRow = {
  bin?: string
  installed?: boolean
}

export const syncStaticInstalledFlags = async (
  rows: StaticRow[],
  exists: (bin: string) => Promise<boolean>
) => {
  // Static actions target this package's files, not other installations with the same version.
  await Promise.all(
    rows.map(async (row) => {
      try {
        row.installed = row.bin ? await exists(row.bin) : false
      } catch (error) {
        // A failed supplementary check must not invalidate the installed-version scan.
        console.error('syncStaticInstalledFlags error:', row.bin, error)
      }
    })
  )
}
