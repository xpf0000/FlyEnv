import axios from 'axios'
import _node_machine_id from 'node-machine-id'
import { getAxiosProxy } from '../../util/Axios'

const { machineId } = _node_machine_id

type RequestFn = (config: Record<string, any>) => Promise<{ data?: any }>

type GitHubAccountDeps = {
  machineId: () => Promise<string>
  request: RequestFn
  getProxy: () => any
  failureMessage: () => string | Promise<string>
}

const defaults: GitHubAccountDeps = {
  machineId,
  request: (config) => axios(config),
  getProxy: getAxiosProxy,
  failureMessage: async () => (await import('@lang/runtime')).I18nT('base.fail')
}

export class GitHubAccountService {
  private uuidPromise?: Promise<string>
  private readonly deps: GitHubAccountDeps

  constructor(deps: Partial<GitHubAccountDeps> = {}) {
    this.deps = { ...defaults, ...deps }
  }

  private getMachineId() {
    if (!this.uuidPromise) {
      this.uuidPromise = this.deps.machineId().catch((error) => {
        this.uuidPromise = undefined
        throw error
      })
    }
    return this.uuidPromise
  }

  private async post(url: string, data: Record<string, any>) {
    return this.deps.request({
      url,
      method: 'post',
      data,
      proxy: this.deps.getProxy(),
      timeout: 30000
    })
  }

  async fetchUser(userUuid: string): Promise<Record<string, any>> {
    if (!userUuid) return {}
    const uuid = await this.getMachineId()
    const response = await this.post('https://api.one-env.com/api/app/user_github_auth', {
      user_uuid: userUuid,
      uuid
    })
    return response.data?.data?.user ? response.data.data : {}
  }

  async fetchLicenses(userUuid: string): Promise<any[]> {
    if (!userUuid) return []
    const uuid = await this.getMachineId()
    const response = await this.post('https://api.one-env.com/api/app/user_github_license', {
      user_uuid: userUuid,
      uuid
    })
    return Array.isArray(response.data?.data) ? response.data.data : []
  }

  private async updateBinding(
    endpoint: 'user_github_license_del' | 'user_github_license_add',
    userUuid: string,
    uuid: string,
    license: string
  ): Promise<any[]> {
    if (!userUuid) throw new Error(await this.deps.failureMessage())
    const response = await this.post(`https://api.one-env.com/api/app/${endpoint}`, {
      user_uuid: userUuid,
      uuid,
      license
    })
    if (!Array.isArray(response.data?.data)) {
      throw new Error(response.data?.message || (await this.deps.failureMessage()))
    }
    return response.data.data
  }

  deleteBinding(userUuid: string, uuid: string, license: string) {
    return this.updateBinding('user_github_license_del', userUuid, uuid, license)
  }

  addBinding(userUuid: string, uuid: string, license: string) {
    return this.updateBinding('user_github_license_add', userUuid, uuid, license)
  }
}
