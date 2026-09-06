const ANSI_ESCAPE_PATTERN = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g

export interface SdkmanJavaItem {
  name: string
  version: string
  installed: boolean
  flag: 'sdkman'
  vendor: string
  identifier: string
}

/** Parse SDKMAN's Java table, including both current and legacy column layouts. */
export function parseSdkmanJavaOutput(stdout: string): SdkmanJavaItem[] {
  const items: SdkmanJavaItem[] = []
  let currentVendor = ''

  for (const rawLine of stdout.replace(ANSI_ESCAPE_PATTERN, '').split(/\r?\n/)) {
    const columns = rawLine.split('|').map((column) => column.trim())
    if (columns.length < 4) continue

    const vendor = columns[0]
    const version = columns[2]
    const identifier = columns[columns.length - 1]
    const markers = columns.slice(1, -1).join(' ').toLowerCase()

    if (
      !version ||
      !identifier ||
      vendor.toLowerCase() === 'vendor' ||
      version.toLowerCase() === 'version' ||
      identifier.toLowerCase() === 'identifier'
    ) {
      continue
    }

    if (vendor) currentVendor = vendor

    items.push({
      name: identifier,
      version,
      installed:
        markers.includes('*') || markers.includes('installed') || markers.includes('local'),
      flag: 'sdkman',
      vendor: currentVendor,
      identifier
    })
  }

  return items
}
