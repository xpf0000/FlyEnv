import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { type SoftInstalled } from '@/store/brew'
import { join } from '@/util/path-browserify'
import { exec } from '@/util/NodeFn'

export const LoadedSetup = reactive<{
  list: { [k: string]: any }
  fetching: Partial<Record<string, boolean>>
  reFetch: () => void
}>({
  fetching: {},
  list: {},
  reFetch: () => 0
})

export const Setup = (version: SoftInstalled) => {
  const search = ref('')

  const fetching = computed(() => {
    return LoadedSetup.fetching?.[version.bin] ?? false
  })

  const fetchData = () => {
    if (!version?.version || fetching.value || LoadedSetup?.list?.[version.bin]) {
      return
    }
    LoadedSetup.fetching[version.bin] = true
    const bin = version?.phpBin ?? join(version?.path, 'bin/php')
    console.log('macport bin: ', bin)
    exec
      .exec(`"${bin}" -m`)
      .then((res: any) => {
        console.log('execAsync: ', res)
        let phpModules = res.stdout.split(`[PHP Modules]\n`).pop()!.trim()!
        const arr = phpModules.split(`[Zend Modules]`)
        phpModules = arr.shift()!.trim()
        const zendModules = arr.pop()?.trim() ?? ''
        const phpModuleArr = phpModules
          .split(`\n`)
          .filter((s: string) => !!s.trim())
          .map((s: string) => s.trim().toLowerCase())
        const zendModuleArr = zendModules
          .split(`\n`)
          .filter((s: string) => !!s.trim())
          .map((s: string) => s.trim().toLowerCase())
        LoadedSetup.list[version.bin] = reactive(
          Array.from(new Set([...phpModuleArr, ...zendModuleArr])).map((s) => ({ name: s }))
        )
        LoadedSetup.fetching[version.bin] = false
      })
      .catch(() => {
        LoadedSetup.fetching[version.bin] = false
      })
  }

  const reGetData = () => {
    console.log('reGetData !!!')
    delete LoadedSetup?.list?.[version.bin]
    delete LoadedSetup.fetching?.[version.bin]
    fetchData()
  }

  LoadedSetup.reFetch = reGetData

  const tableData = computed(() => {
    const sortName = (a: any, b: any) => {
      return a.name - b.name
    }
    const sortStatus = (a: any, b: any) => {
      if (a.status === b.status) {
        return 0
      }
      if (a.status) {
        return -1
      }
      if (b.status) {
        return 1
      }
      return 0
    }
    const list = LoadedSetup.list?.[version.bin] ?? []
    if (!search.value) {
      return Array.from(list).sort(sortName).sort(sortStatus)
    }
    return list
      .filter((d: any) => {
        const dl = d.name.toLowerCase()
        const sl = search.value.trim().toLowerCase()
        return dl.includes(sl) || sl.includes(dl)
      })
      .sort(sortName)
      .sort(sortStatus)
  })

  fetchData()

  onMounted(() => {})

  onUnmounted(() => {})

  return {
    tableData,
    reGetData,
    fetching,
    search
  }
}
