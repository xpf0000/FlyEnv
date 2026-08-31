import { existsSync, realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

type BrewFormulaInfo = {
  name?: string
  tap?: string
  linked_keg?: string | null
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

const resolveOptKeg = (formulaName: string, cellarDirs: string[]) => {
  for (const cellarDir of cellarDirs) {
    try {
      const kegPath = realpathSync(join(dirname(cellarDir), 'opt', formulaName))
      const formulaRackPath = realpathSync(join(cellarDir, formulaName))
      if (dirname(kegPath) === formulaRackPath) {
        return { cellarDir, version: basename(kegPath) }
      }
    } catch {}
  }
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

  const linkedKeg = `${item.linked_keg ?? ''}`.trim()
  const optKeg = linkedKeg ? undefined : resolveOptKeg(formulaName, cellarDirs)
  const receiptVersions = linkedKeg
    ? [{ version: linkedKeg }]
    : optKeg
      ? [{ version: optKeg.version }]
      : installed
  const receiptCellarDirs = optKeg ? [optKeg.cellarDir] : cellarDirs
  let foundTapIdentity = false
  for (const install of receiptVersions) {
    const version = `${install?.version ?? ''}`.trim()
    if (!version) {
      continue
    }
    for (const cellarDir of receiptCellarDirs) {
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
