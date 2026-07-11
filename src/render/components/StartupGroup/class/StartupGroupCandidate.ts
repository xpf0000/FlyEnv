import { StartupGroup } from './StartupGroup'
import type {
  StartupGroupCandidateData,
  StartupGroupCandidateWarning,
  StartupGroupItem
} from '../type'

export class StartupGroupCandidate {
  constructor(private readonly createId: () => string) {}

  matchesItem(candidate: StartupGroupCandidateData, item: StartupGroupItem) {
    if (StartupGroup.itemKey(candidate.item) !== StartupGroup.itemKey(item)) return false
    return item.type !== 'language-project' || candidate.item.type !== 'language-project'
      ? item.type === candidate.item.type
      : candidate.item.projectPath === item.projectPath
  }

  allowsMultiple(candidate: StartupGroupCandidateData) {
    return candidate.item.type === 'language-project' || candidate.item.module === 'php-fpm'
  }

  updateSelection(
    selectedKeys: string[],
    candidate: StartupGroupCandidateData,
    candidates: StartupGroupCandidateData[],
    selected: boolean
  ) {
    const next = selectedKeys.filter((key) => key !== candidate.key)
    if (!selected) return next
    if (this.allowsMultiple(candidate)) return [...next, candidate.key]
    const sameModuleKeys = new Set(
      candidates
        .filter(
          (item) =>
            item.item.type === 'service-version' && item.item.module === candidate.item.module
        )
        .map((item) => item.key)
    )
    return [...next.filter((key) => !sameModuleKeys.has(key)), candidate.key]
  }

  toggleSelection(
    selectedKeys: string[],
    candidate: StartupGroupCandidateData,
    candidates: StartupGroupCandidateData[]
  ) {
    return this.updateSelection(
      selectedKeys,
      candidate,
      candidates,
      !selectedKeys.includes(candidate.key)
    )
  }

  normalizeSelection(selectedKeys: string[], candidates: StartupGroupCandidateData[]) {
    const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
    return selectedKeys.reduce<string[]>((next, key) => {
      const candidate = candidateByKey.get(key)
      return candidate ? this.updateSelection(next, candidate, candidates, true) : next
    }, [])
  }

  filterValidItems(items: StartupGroupItem[], candidates: StartupGroupCandidateData[]) {
    const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
    return items.filter((item) => {
      const candidate = candidateByKey.get(StartupGroup.itemKey(item))
      return candidate ? this.matchesItem(candidate, item) : false
    })
  }

  syncSelectedItems(
    items: StartupGroupItem[],
    candidates: StartupGroupCandidateData[],
    selectedKeys: string[]
  ) {
    const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
    const selected = new Set(selectedKeys)
    const used = new Set<string>()
    const next: StartupGroupItem[] = []
    for (const item of items) {
      const key = StartupGroup.itemKey(item)
      const candidate = candidateByKey.get(key)
      if (!candidate) {
        next.push(item)
        continue
      }
      if (this.matchesItem(candidate, item)) {
        if (selected.has(key)) {
          next.push(item)
          used.add(key)
        }
        continue
      }
      if (selected.has(key)) {
        next.push({ ...candidate.item, id: this.createId() })
        used.add(key)
      } else {
        next.push(item)
      }
    }
    for (const key of selectedKeys) {
      if (used.has(key)) continue
      const candidate = candidateByKey.get(key)
      if (candidate) {
        next.push({ ...candidate.item, id: this.createId() })
        used.add(key)
      }
    }
    return next
  }

  warnings(candidates: StartupGroupCandidateData[], selectedKeys: string[]) {
    const selected = candidates.filter((candidate) => selectedKeys.includes(candidate.key))
    const moduleCount = new Map<string, number>()
    const portCount = new Map<number, number>()
    for (const candidate of selected) {
      if (candidate.item.type === 'service-version') {
        moduleCount.set(candidate.item.module, (moduleCount.get(candidate.item.module) ?? 0) + 1)
      }
      if (candidate.port) portCount.set(candidate.port, (portCount.get(candidate.port) ?? 0) + 1)
    }
    const warnings = new Map<string, StartupGroupCandidateWarning[]>()
    for (const candidate of selected) {
      const itemWarnings: StartupGroupCandidateWarning[] = []
      if (
        candidate.item.type === 'service-version' &&
        (moduleCount.get(candidate.item.module) ?? 0) > 1
      ) {
        itemWarnings.push('same-module')
      }
      if (candidate.port && (portCount.get(candidate.port) ?? 0) > 1) {
        itemWarnings.push('same-port')
      }
      if (itemWarnings.length > 0) warnings.set(candidate.key, itemWarnings)
    }
    return warnings
  }
}
