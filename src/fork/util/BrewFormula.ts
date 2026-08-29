import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type BrewFormulaInfo = {
  name?: string
  tap?: string
  installed?: Array<{ version?: string }>
}

type BrewInstallReceipt = {
  source?: {
    tap?: string
  }
}

export const qualifyHomebrewCoreFormula = (name: string) => {
  const formula = name.trim()
  return formula.includes('/') ? formula : `homebrew/core/${formula}`
}

export const brewFormulaInstalledForTap = async (item: BrewFormulaInfo, cellarDirs: string[]) => {
  const installed = Array.isArray(item.installed) ? item.installed : []
  if (installed.length === 0) {
    return false
  }

  const formulaName = `${item.name ?? ''}`.trim()
  const formulaTap = `${item.tap ?? ''}`.trim()
  if (!formulaName || !formulaTap) {
    return true
  }

  let foundTapIdentity = false
  for (const install of installed) {
    const version = `${install?.version ?? ''}`.trim()
    if (!version) {
      continue
    }
    for (const cellarDir of cellarDirs) {
      const receiptFile = join(cellarDir, formulaName, version, 'INSTALL_RECEIPT.json')
      if (!existsSync(receiptFile)) {
        continue
      }
      try {
        const receipt = JSON.parse(await readFile(receiptFile, 'utf8')) as BrewInstallReceipt
        const receiptTap = `${receipt?.source?.tap ?? ''}`.trim()
        if (!receiptTap) {
          continue
        }
        foundTapIdentity = true
        if (receiptTap === formulaTap) {
          return true
        }
      } catch (error) {
        console.warn(`Unable to read Homebrew install receipt ${receiptFile}: `, error)
      }
    }
  }

  return !foundTapIdentity
}
