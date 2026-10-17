import axios from 'axios'
import { readFile } from 'node:fs/promises'
import type { RuntimeObservation } from '../shared/settings'
export const observeRuntime = async (
  endpoint: string,
  apiKeyFile?: string
): Promise<RuntimeObservation> => {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 5000)
  let reason = 'Runtime did not report capabilities'
  try {
    const key = apiKeyFile ? (await readFile(apiKeyFile, 'utf8')).trim() : undefined
    for (const path of ['/props', '/v1/models']) {
      try {
        const response = await axios.get(endpoint + path, {
          timeout: 1500,
          signal: abort.signal,
          headers: key ? { Authorization: 'Bearer ' + key } : undefined
        })
        const data = response.data
        const model = data?.data?.[0]
        const rawModalities =
          data?.modalities ?? model?.modalities ?? model?.architecture?.input_modalities
        const modalities =
          rawModalities &&
          !Array.isArray(rawModalities) &&
          typeof rawModalities === 'object' &&
          Object.values(rawModalities).every((v) => typeof v === 'boolean')
            ? Object.entries(rawModalities)
                .filter(([, enabled]) => enabled)
                .map(([name]) => (name === 'vision' ? 'image' : name))
            : rawModalities
        const templateCaps = data?.chat_template_caps
        if (Array.isArray(modalities) && modalities.every((v) => typeof v === 'string'))
          return {
            modalities,
            templateCaps:
              templateCaps && typeof templateCaps === 'object' ? templateCaps : undefined
          }
        if (templateCaps && typeof templateCaps === 'object') return { templateCaps, reason }
      } catch (e) {
        reason = e instanceof Error ? e.message : String(e)
      }
    }
    return { reason }
  } catch (e) {
    return { reason: String(e) }
  } finally {
    clearTimeout(timer)
  }
}
