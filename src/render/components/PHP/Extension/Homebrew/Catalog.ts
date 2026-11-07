import { reactive } from 'vue'
import IPC from '@/util/IPC'

export const BrewExtensionCatalog = reactive({
  list: {} as Record<string, any[]>,
  fetching: {} as Record<string, boolean>,
  reFetch: () => {}
})
const flights = new Map<string, Promise<void>>()
export function fetchHomebrewExtensions(
  version: { bin: string; version: string | null },
  fresh = false
): Promise<void> {
  const current = flights.get(version.bin)
  if (current) return fresh ? current.then(() => fetchHomebrewExtensions(version, true)) : current
  if (BrewExtensionCatalog.list[version.bin] && !fresh) return Promise.resolve()
  BrewExtensionCatalog.fetching[version.bin] = true
  const flight = new Promise<void>((resolve, reject) => {
    const request = IPC.send(
      'app-fork:brew',
      'fetchAllPhpExtensions',
      version.version?.split('.').slice(0, 2).join('.') ?? ''
    )
    request.then((key: string, response: any) => {
      if (response?.code === 200) return
      IPC.off(key)
      if (response?.code === 0) {
        BrewExtensionCatalog.list[version.bin] = response.data
        resolve()
      } else reject(new Error(response?.msg || 'Homebrew extension catalog failed'))
    })
  }).finally(() => {
    BrewExtensionCatalog.fetching[version.bin] = false
    flights.delete(version.bin)
  })
  flights.set(version.bin, flight)
  return flight
}
