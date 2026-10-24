import { computed, ref, watch } from 'vue'
import type { SoftInstalled } from '@shared/app'
import type { LoadedPhpExtension } from '@fork/module/Php/LoadedExtensions'
import { reactiveBind } from '@/util/Index'
import IPC from '@/util/IPC'
import { extensionRequest } from '../Request'
import { LoadedExtensionsController } from './Operation'

export const LoadedSetup = reactiveBind(
  new LoadedExtensionsController((version) =>
    extensionRequest<LoadedPhpExtension[]>(IPC, 'fetchLoadedExtensions', [version])
  )
)

export const Setup = (version: () => SoftInstalled) => {
  const search = ref('')
  const fetching = computed(() => LoadedSetup.fetching[version().bin] ?? false)
  const error = computed(() => LoadedSetup.errors[version().bin] ?? '')
  const tableData = computed(() => {
    const query = search.value.trim().toLowerCase()
    return (LoadedSetup.list[version().bin] ?? [])
      .filter((row) => !query || row.name.toLowerCase().includes(query))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  })
  watch(
    () => version().bin,
    () => {
      LoadedSetup.load(version())
    },
    { immediate: true }
  )
  return { tableData, search, fetching, error }
}
