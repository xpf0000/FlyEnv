import { join, dirname } from 'path'
import { homedir } from 'os'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import {
  execPromiseWithEnv,
  readFile,
  writeFile,
  existsSync,
  mkdirp,
  copyFile,
  uuid,
  remove
} from '../../Fn'
import { getAxiosProxy } from '../../util/Axios'
import axios from 'axios'
import { tmpdir } from 'node:os'

/**
 * Generic backend for AI coding CLI tools (#712).
 * One module serves all tools; the renderer passes a tool descriptor
 * (versionCmd / configFile path / config format) so this stays tool-agnostic.
 */
class AICli extends Base {
  constructor() {
    super()
    this.type = 'aicli'
  }

  /**
   * Run a `<tool> --version` style probe. Returns installed flag + raw output.
   * versionCmd is supplied by the renderer adapter (e.g. 'claude --version').
   */
  checkInstalled(versionCmd: string) {
    return new ForkPromise(async (resolve) => {
      let version = ''
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`${versionCmd} > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        version = content.trim()
      } catch (e) {
        console.log('aicli checkInstalled error: ', e)
        version = ''
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
      // A successful version probe prints something like "1.2.3 (Claude Code)".
      const m = version.match(/(\d+(\.\d+){1,3})/)
      resolve({ installed: !!m, version: m?.[1] ?? '', raw: version })
    })
  }

  /**
   * Check whether a dependency binary (e.g. node / npm) is available on PATH,
   * so the UI can guide the user to install it before the tool itself.
   */
  checkDep(depCmd: string) {
    return new ForkPromise(async (resolve) => {
      try {
        await execPromiseWithEnv(depCmd)
        resolve({ ok: true })
      } catch (e: any) {
        resolve({ ok: false, error: e?.message ?? String(e) })
      }
    })
  }

  /**
   * Fetch the model list for a provider. Supports:
   *  - 'ollama' : GET {host}/api/tags
   *  - 'openai' : GET {baseURL}/models (Bearer)
   *  - 'anthropic' : GET {baseURL}/models (x-api-key)
   */
  fetchModels(provider: {
    baseURL: string
    apiKey?: string
    modelsEndpoint?: 'ollama' | 'openai' | 'anthropic' | 'none'
  }) {
    return new ForkPromise(async (resolve, reject) => {
      const { baseURL, apiKey, modelsEndpoint } = provider
      if (!baseURL || modelsEndpoint === 'none') {
        resolve([])
        return
      }
      try {
        let url = baseURL.replace(/\/+$/, '')
        const headers: Record<string, string> = {}
        if (modelsEndpoint === 'ollama') {
          // ollama native list lives at /api/tags (strip a trailing /v1)
          url = url.replace(/\/v1$/, '') + '/api/tags'
        } else if (modelsEndpoint === 'anthropic') {
          url = url + '/models'
          if (apiKey) {
            headers['x-api-key'] = apiKey
            headers['anthropic-version'] = '2023-06-01'
          }
        } else {
          url = url + '/models'
          if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`
          }
        }
        const res = await axios.request({
          url,
          method: 'get',
          headers,
          proxy: getAxiosProxy() as any,
          timeout: 15000
        })
        const data: any = res.data
        let models: string[] = []
        if (modelsEndpoint === 'ollama') {
          models = (data?.models ?? []).map((m: any) => m?.name).filter(Boolean)
        } else {
          models = (data?.data ?? []).map((m: any) => m?.id).filter(Boolean)
        }
        resolve(models)
      } catch (e: any) {
        reject(e?.message ?? String(e))
      }
    })
  }

  /**
   * Resolve a `~`-prefixed or absolute config path the renderer adapter gives us.
   */
  private resolvePath(p: string): string {
    if (p.startsWith('~')) {
      return join(homedir(), p.slice(1))
    }
    return p
  }

  /**
   * Apply a provider's config patch to a tool's config file.
   * `format` is 'json' (only supported merge format for MVP); other formats
   * are written by the adapter via env instead. Always backs up first.
   */
  applyProvider(opts: { configFile?: string; format?: 'json'; patch?: Record<string, any> }) {
    return new ForkPromise(async (resolve, reject) => {
      const { configFile, format, patch } = opts
      if (!configFile || !patch || format !== 'json') {
        // Nothing to write to disk (env-only tools) — treat as success.
        resolve({ written: false })
        return
      }
      try {
        const file = this.resolvePath(configFile)
        await mkdirp(dirname(file))
        let current: Record<string, any> = {}
        if (existsSync(file)) {
          // Back up before mutating the user's existing config.
          await copyFile(file, `${file}.flyenv.bak`)
          try {
            current = JSON.parse(await readFile(file, 'utf-8'))
          } catch {
            current = {}
          }
        }
        const merged = { ...current, ...patch }
        await writeFile(file, JSON.stringify(merged, null, 2))
        resolve({ written: true, file })
      } catch (e: any) {
        reject(e?.message ?? String(e))
      }
    })
  }

  /**
   * Return the resolved config-file path (for the renderer to open in editor).
   */
  configFilePath(configFile: string) {
    return new ForkPromise((resolve) => {
      resolve(this.resolvePath(configFile))
    })
  }
}

export default new AICli()
