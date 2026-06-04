import type { AllAppModule } from '@/core/type'
import type { SoftInstalled } from '@shared/app'
import { normalize } from '@/util/path-browserify'
import { reactive } from 'vue'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'

export type InstalledVersionNotes = Record<string, string>

const storageKey = 'flyenv-installed-version-notes'
const notes = reactive<InstalledVersionNotes>({})

let loaded = false
let loading: Promise<InstalledVersionNotes> | undefined

const replaceNotes = (next: InstalledVersionNotes) => {
  Object.keys(notes).forEach((key) => {
    delete notes[key]
  })
  Object.assign(notes, next)
}

const saveNotes = async () => {
  await StorageSetAsync(storageKey, JSON.parse(JSON.stringify(notes)))
}

export const loadInstalledVersionNotes = async () => {
  if (loaded) {
    return notes
  }

  if (!loading) {
    loading = StorageGetAsync<InstalledVersionNotes>(storageKey)
      .catch(() => {
        return {}
      })
      .then(async (saved) => {
        replaceNotes(saved ?? {})
        loaded = true
        return notes
      })
      .finally(() => {
        loading = undefined
      })
  }

  return loading
}

export const installedVersionNoteKey = (item: SoftInstalled, typeFlag?: AllAppModule | string) => {
  return JSON.stringify([
    typeFlag || item.typeFlag,
    item.version || '',
    normalize(item.bin || ''),
    normalize(item.path || '')
  ])
}

export const installedVersionNote = (item: SoftInstalled, typeFlag?: AllAppModule | string) => {
  return notes?.[installedVersionNoteKey(item, typeFlag)] ?? ''
}

const isNoteKeyForType = (key: string, typeFlag: AllAppModule | string) => {
  try {
    const parsed = JSON.parse(key)
    return Array.isArray(parsed) && parsed[0] === typeFlag
  } catch {
    return false
  }
}

export const syncInstalledVersionNotes = async (
  typeFlag: AllAppModule | string,
  installed: SoftInstalled[]
) => {
  await loadInstalledVersionNotes()
  const installedKeys = new Set(installed.map((item) => installedVersionNoteKey(item, typeFlag)))
  let changed = false
  Object.keys(notes).forEach((key) => {
    if (isNoteKeyForType(key, typeFlag) && !installedKeys.has(key)) {
      delete notes[key]
      changed = true
    }
  })
  if (changed) {
    await saveNotes()
  }
}

export const setInstalledVersionNote = async (
  item: SoftInstalled,
  note: string,
  typeFlag?: AllAppModule | string
) => {
  await loadInstalledVersionNotes()
  const key = installedVersionNoteKey(item, typeFlag)
  const value = note.trim()
  if (value) {
    notes[key] = value
  } else {
    delete notes[key]
  }
  await saveNotes()
}
