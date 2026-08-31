type BrewFormulaItem = {
  name?: string
  installed?: boolean
}

const formulaRackName = (name: string) => name.trim().split('/').pop() ?? ''

export const brewFormulaSourceName = (name: string) => {
  const parts = name.trim().split('/')
  const tap = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  return !tap || tap === 'homebrew/core' ? 'Homebrew Core' : tap
}

export const findInstalledFormulaConflict = (
  item: BrewFormulaItem,
  items: BrewFormulaItem[]
): string | undefined => {
  if (item.installed) {
    return undefined
  }

  const rackName = formulaRackName(item.name ?? '')
  if (!rackName) {
    return undefined
  }

  return items.find(
    (candidate) =>
      candidate.installed &&
      candidate.name !== item.name &&
      formulaRackName(candidate.name ?? '') === rackName
  )?.name
}
