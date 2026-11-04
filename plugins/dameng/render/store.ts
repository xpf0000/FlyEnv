import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { MessageError, MessageSuccess } from '@/util/Element'
import { BrewStore, type SoftInstalled } from '@/store/brew'
import { AppStore } from '@/store/app'
import { dialog } from '@/util/NodeFn'
import { normalize } from '@/util/path-browserify'
import IPC from '@/util/IPC'
import { DamengT } from './lang'
import { showSetupDialog } from './setup'
import {
  defaultDamengSettings,
  validateDamengSettings,
  type DamengCredentials,
  type DamengInitParams,
  type DamengInitResult,
  type DamengInstallPath,
  type DamengInstallResult,
  type DamengInstanceInfo,
  type DamengRuntime,
  type DamengSettings,
  type DamengVersionItem
} from '../shared'

const storageKey = 'flyenv-dameng-settings'
export const isInitialPasswordValid = (password: string): boolean => {
  return (
    password.length >= 9 &&
    password.length <= 48 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password) &&
    !/[\s"\\\x00-\x1f\x7f]/.test(password)
  )
}
export const isCurrentPasswordValid = (password: string): boolean =>
  !/["\\\x00-\x1f\x7f]/.test(password)
export const generateInitialPassword = (): string => {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '_!@#$%&*']
  const index = (length: number) => crypto.getRandomValues(new Uint32Array(1))[0] % length
  const characters = groups.map((group) => group[index(group.length)])
  const alphabet = groups.join('')
  while (characters.length < 16) characters.push(alphabet[index(alphabet.length)])
  for (let i = characters.length - 1; i > 0; i--) {
    const other = index(i + 1)
    ;[characters[i], characters[other]] = [characters[other], characters[i]]
  }
  return characters.join('')
}
export const initialCredentialError = (credentials: DamengCredentials): string => {
  for (const key of ['sysdbaPassword', 'auditorPassword'] as const) {
    const field = DamengT(key === 'sysdbaPassword' ? 'initialSysdbaPassword' : 'auditorPassword')
    if (!credentials[key]) return DamengT('initialPasswordMissing', { field })
    if (!isInitialPasswordValid(credentials[key]))
      return DamengT('initialPasswordInvalid', { field })
  }
  return ''
}
export type DamengInstalled = SoftInstalled & { damengRuntime?: DamengRuntime }
type Target = { id?: string; bin?: string; appDir?: string; damengRuntime?: DamengRuntime }
type OperationState = {
  busy: boolean
  progress: number
  stage: string
  error: string
  unknown: boolean
}
type InfoState = { busy: boolean; error: string; data?: DamengInstanceInfo }

// Explicit whitelist: persisted values can never acquire credentials from a request.
export const copySettings = (value: Partial<DamengSettings> = {}): DamengSettings => {
  const defaults = defaultDamengSettings()
  return {
    port: value.port ?? defaults.port,
    pageSize: value.pageSize ?? defaults.pageSize,
    extentSize: value.extentSize ?? defaults.extentSize,
    charset: value.charset ?? defaults.charset,
    caseSensitive: value.caseSensitive ?? defaults.caseSensitive,
    bufferMB: value.bufferMB ?? defaults.bufferMB,
    logSizeMB: value.logSizeMB ?? defaults.logSizeMB
  }
}

const validateSettings = (value: DamengSettings) => {
  try {
    validateDamengSettings(value)
  } catch {
    throw new Error(DamengT('invalidSettings'))
  }
}

/**
 * Singleton owns immutable request snapshots, progress, terminal notices and IPC
 * cleanup across page unmount/reentry. Duplicate requests share their promise.
 * code 200 is progress; code 0 / failure / timeout terminates the listener.
 * Unknown mutation outcomes block replay for the rest of this session. The fork
 * alone owns actual installation and process state. Rescans are supplementary.
 */
export class DamengPluginManager {
  settings = defaultDamengSettings()
  credentials: DamengCredentials = { sysdbaPassword: '', auditorPassword: '' }
  onlineVersions: DamengVersionItem[] = []
  states: Record<string, OperationState> = {}
  information: Record<string, InfoState> = {}
  fetching = false
  inited = false
  private initPromise?: Promise<void>
  private catalogPromise?: Promise<void>
  private operations = new Map<string, Promise<boolean>>()
  private infoRequests = new Map<string, Promise<void>>()
  private unknown = new Set<string>()
  private directoryPicker?: Promise<string | undefined>
  private startRequests = new Map<string, Promise<[{ sysdbaPassword: string }]>>()

  constructor(private readonly timeoutMs = 45 * 60 * 1000) {}

  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = StorageGetAsync<DamengSettings>(storageKey)
        .then((saved) => {
          const settings = copySettings(saved ?? {})
          validateSettings(settings)
          this.settings = settings
        })
        .catch(() => undefined)
        .finally(() => {
          this.inited = true
        })
    }
    return this.initPromise
  }

  async saveSettings(settings: DamengSettings, credentials: DamengCredentials) {
    const snapshot = copySettings(settings)
    validateSettings(snapshot)
    if (!isCurrentPasswordValid(credentials.sysdbaPassword))
      throw new Error(DamengT('currentPasswordInvalid'))
    await this.init()
    await StorageSetAsync(storageKey, snapshot)
    this.settings = snapshot
    this.credentials = {
      sysdbaPassword: credentials.sysdbaPassword,
      auditorPassword: credentials.auditorPassword
    }
  }

  operationKey(item: Target): string {
    // The chosen program path can change while this operation is in flight.
    return item.damengRuntime?.installId || item.id || item.bin || item.appDir || ''
  }

  state(item: Target): OperationState | undefined {
    return this.states[this.operationKey(item)]
  }
  info(item: Target): InfoState | undefined {
    return this.information[this.operationKey(item)]
  }

  private safeMessage(value: unknown, secrets: string[] = []): string {
    let message = value instanceof Error ? value.message : `${value ?? DamengT('operationFailed')}`
    for (const secret of [
      ...secrets,
      this.credentials.sysdbaPassword,
      this.credentials.auditorPassword
    ]) {
      if (secret) message = message.replaceAll(secret, '[redacted]')
    }
    return message
  }

  private request(
    action: string,
    args: unknown[] = [],
    progress?: (data: any) => void,
    timeout = this.timeoutMs
  ): Promise<any> {
    const readOnly =
      action === 'fetchAllOnlineVersion' ||
      action === 'getInstanceInfo' ||
      action === 'getInitializationState' ||
      action === 'validateInstallPath'
    return new Promise((resolve, reject) => {
      let request: ReturnType<typeof IPC.send> | undefined
      let settled = false
      const finish = (error?: unknown, data?: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (request) IPC.off(request.key)
        if (error) reject(error)
        else resolve(data)
      }
      const timer = setTimeout(
        () =>
          finish(
            Object.assign(new Error(DamengT(readOnly ? 'readTimeout' : 'operationTimeout')), {
              outcomeUnknown: !readOnly
            })
          ),
        timeout
      )
      try {
        request = IPC.send('app-fork:dameng', action, ...args)
        request.then((_key: string, response: any) => {
          if (settled) return
          try {
            if (response?.code === 200) {
              progress?.(response.msg)
              return
            }
            if (response?.code === 0) finish(undefined, response.data)
            else finish(new Error(`${response?.msg ?? DamengT('operationFailed')}`))
          } catch (error) {
            finish(error)
          }
        })
      } catch (error) {
        finish(error)
      }
    })
  }

  private operation(
    item: Target,
    work: (state: OperationState) => Promise<boolean>,
    secrets: string[] = []
  ): Promise<boolean> {
    const key = this.operationKey(item)
    const previous = this.operations.get(key)
    if (previous) return previous
    if (this.unknown.has(key)) {
      MessageError(DamengT('outcomeUnknown'))
      return Promise.resolve(false)
    }
    this.states[key] = { busy: true, progress: 0, stage: '', error: '', unknown: false }
    const state = this.states[key]
    const catalog = this.onlineVersions.find((row) => this.operationKey(row) === key)
    if (catalog) catalog.downing = true
    // Defer all preconditions/IPC until admission is recorded.
    const pending = Promise.resolve()
      .then(() => work(state))
      .catch((error) => {
        state.error = this.safeMessage(error, secrets)
        if (
          error?.outcomeUnknown ||
          /DAMENG_OUTCOME_UNKNOWN|result is unknown/i.test(state.error)
        ) {
          state.unknown = true
          this.unknown.add(key)
          if (catalog) catalog.disabled = true
        }
        MessageError(state.error)
        return false
      })
      .finally(() => {
        state.busy = false
        if (catalog) catalog.downing = false
        if (this.operations.get(key) === pending) this.operations.delete(key)
      })
    this.operations.set(key, pending)
    return pending
  }

  private progress(state: OperationState, row?: DamengVersionItem, secrets: string[] = []) {
    return (message: any) => {
      if (typeof message?.progress === 'number') {
        state.progress = Math.max(0, Math.min(100, message.progress))
        if (row) row.progress = state.progress
      }
      const stage = typeof message === 'string' ? message : message?.downState
      if (stage) {
        state.stage = this.safeMessage(stage, secrets)
        if (row) row.downState = state.stage
      }
    }
  }

  async refreshInstalled(): Promise<void> {
    const module = BrewStore().module('dameng')
    module.installedFetched = false
    await module.fetchInstalled(true)
    if (!module.installedFetched) throw new Error(DamengT('rescanFailed'))
  }

  private async rescanAfterOperation() {
    try {
      await this.refreshInstalled()
    } catch (error) {
      MessageError(`${DamengT('rescanFailed')}: ${this.safeMessage(error)}`)
    }
  }

  fetchOnlineVersions(force = false): Promise<void> {
    if (this.catalogPromise) return this.catalogPromise
    if (!force && this.onlineVersions.length) return Promise.resolve()
    this.fetching = true
    const pending = this.request(
      'fetchAllOnlineVersion',
      [JSON.parse(JSON.stringify(AppStore().config.setup))],
      undefined,
      Math.min(this.timeoutMs, 120_000)
    )
      .then((list: DamengVersionItem[]) => {
        if (!Array.isArray(list)) throw new Error(DamengT('operationFailed'))
        const keep = new Set(list.map((row) => this.operationKey(row)))
        for (const row of list) {
          const key = this.operationKey(row)
          const old = this.onlineVersions.find((value) => this.operationKey(value) === key)
          const disabled = !!row.disabled || this.unknown.has(key)
          if (old && !old.downing) Object.assign(old, row, { downing: false, disabled })
          else if (!old) this.onlineVersions.push({ ...row, downing: false, disabled })
        }
        this.onlineVersions = this.onlineVersions.filter(
          (row) => row.downing || keep.has(this.operationKey(row))
        )
      })
      .catch((error) => {
        MessageError(this.safeMessage(error))
      })
      .finally(() => {
        this.fetching = false
        if (this.catalogPromise === pending) this.catalogPromise = undefined
      })
    this.catalogPromise = pending
    return pending
  }

  chooseInstallDirectory(currentPath = ''): Promise<string | undefined> {
    if (this.directoryPicker) return this.directoryPicker
    const pending = Promise.resolve()
      .then(() =>
        dialog.showOpenDialog({
          properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'],
          title: DamengT('chooseInstallDirectory'),
          ...(currentPath ? { defaultPath: currentPath } : {})
        })
      )
      .then((picked) => (picked.canceled ? undefined : picked.filePaths?.[0]))
      .catch((error) => {
        MessageError(this.safeMessage(error))
        return undefined
      })
      .finally(() => {
        if (this.directoryPicker === pending) this.directoryPicker = undefined
      })
    this.directoryPicker = pending
    return pending
  }

  install(item: DamengVersionItem, directory = '', onValidated?: () => void): Promise<boolean> {
    const previous = this.operations.get(this.operationKey(item))
    if (previous) return previous
    if (item.installed || item.disabled) return Promise.resolve(false)
    const snapshot = JSON.parse(JSON.stringify({ ...item, typeFlag: 'dameng' }))
    const selectedPath = directory
    return this.operation(item, async (state) => {
      let result: DamengInstallResult | undefined
      if (!snapshot.registrationPending) {
        const validSyntax = window.Server.isWindows
          ? /^[A-Za-z]:[\\/][A-Za-z0-9_]+(?:[\\/][A-Za-z0-9_]+)*[\\/]?$/.test(selectedPath)
          : /^\/[A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*\/?$/.test(selectedPath)
        if (!validSyntax) throw new Error(DamengT('installDirectoryInvalid'))
        state.stage = DamengT('validateInstallDirectory')
        const validated: DamengInstallPath = await this.request('validateInstallPath', [
          snapshot,
          selectedPath
        ])
        if (!validated?.programDir || !validated.bin) throw new Error(DamengT('operationFailed'))
        // One-shot presentation callback; operation ownership stays in this controller.
        onValidated?.()
        onValidated = undefined
        result = await this.request(
          'installSoft',
          [snapshot, selectedPath],
          this.progress(state, item)
        )
        if (result?.installed !== true || !result.programDir || !result.bin)
          throw new Error(DamengT('operationFailed'))
        item.appDir = result.programDir
        item.bin = result.bin
        item.downloaded = true
        item.registrationPending = true
      }
      await this.registerInstallation(item)
      item.registrationPending = false
      item.installed = true
      state.progress = item.progress = 100
      await this.rescanAfterOperation()
      if (result?.installError) {
        this.unknown.add(this.operationKey(item))
        state.unknown = item.disabled = true
        state.error = this.safeMessage(result.installError)
        MessageError(state.error)
        return false
      }
      MessageSuccess(DamengT('installComplete'))
      if (result?.warning) MessageError(this.safeMessage(result.warning))
      return true
    })
  }

  private async registerInstallation(item: DamengVersionItem): Promise<void> {
    if (!item.appDir || !item.bin) throw new Error(DamengT('operationFailed'))
    const programDir = item.appDir
    const app = AppStore()
    // The user explicitly authorized this existing custom-version integration.
    const setup = app.config.setup as { dameng?: { dirs?: string[] } }
    const module = (setup.dameng ??= {})
    const dirs = Array.isArray(module.dirs) ? module.dirs : (module.dirs = [])
    const canonical = (value: string) => {
      const path = normalize(value).replace(/\/+$/, '')
      return window.Server.isWindows ? path.toLowerCase() : path
    }
    const added = !dirs.some(
      (value) => typeof value === 'string' && canonical(value) === canonical(programDir)
    )
    if (added) dirs.push(programDir)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const saved = await Promise.race([
        app.saveConfig(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(DamengT('registrationSaveTimeout'))),
            Math.min(this.timeoutMs, 60_000)
          )
        })
      ])
      if (saved === false) throw new Error(DamengT('operationFailed'))
    } catch (error) {
      if (added) {
        const index = module.dirs?.indexOf(programDir) ?? -1
        if (index !== -1) module.dirs!.splice(index, 1)
      }
      item.installed = false
      item.registrationPending = true
      throw new Error(`${DamengT('registrationPending')}: ${this.safeMessage(error)}`)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  initialize(
    item: DamengInstalled,
    params?: DamengInitParams,
    fromStart = false
  ): Promise<boolean> {
    const previous = this.operations.get(this.operationKey(item))
    if (previous) return previous
    const snapshot = JSON.parse(JSON.stringify(item))
    const resume = !!snapshot.damengRuntime?.initializationCompleted
    const settings = copySettings(params)
    const secrets = resume ? [] : [params?.sysdbaPassword ?? '', params?.auditorPassword ?? '']
    const request = resume
      ? undefined
      : { ...settings, sysdbaPassword: secrets[0], auditorPassword: secrets[1] }
    return this.operation(
      item,
      async (state) => {
        if (request) {
          validateSettings(settings)
          const error = initialCredentialError(request)
          if (error) throw new Error(error)
        }
        if (snapshot.damengRuntime?.initialized) throw new Error(DamengT('initialized'))
        if (snapshot.run || (snapshot.running && !fromStart))
          throw new Error(DamengT('operationInProgress'))
        const result: DamengInitResult = await this.request(
          'initializeDatabase',
          [snapshot, request],
          this.progress(state, undefined, secrets)
        ).catch(async (error) => {
          // dminit may have completed before registration failed. Refresh only
          // its metadata; the original failure remains this operation's result.
          await this.rescanAfterOperation()
          throw error
        })
        if (result?.initialized !== true || typeof result.resumed !== 'boolean')
          throw new Error(DamengT('operationFailed'))
        if (!result.resumed && request) {
          this.settings = settings
          this.credentials = {
            sysdbaPassword: request.sysdbaPassword,
            auditorPassword: request.auditorPassword
          }
          try {
            await StorageSetAsync(storageKey, copySettings(settings))
          } catch (error) {
            MessageError(`${DamengT('settingsSaveFailed')}: ${this.safeMessage(error, secrets)}`)
          }
        }
        state.progress = 100
        await this.rescanAfterOperation()
        MessageSuccess(DamengT('initializeComplete'))
        return true
      },
      secrets
    )
  }

  uninstall(item: DamengVersionItem): Promise<boolean> {
    const previous = this.operations.get(this.operationKey(item))
    if (previous) return previous
    if (!item.installed || item.disabled) return Promise.resolve(false)
    const snapshot = JSON.parse(JSON.stringify(item))
    return this.operation(item, async (state) => {
      const service = BrewStore()
        .module('dameng')
        .installed.find((row) => row.bin === snapshot.bin)
      if (service) {
        const stopped = await service.stop()
        if (stopped !== true) throw new Error(`${stopped || DamengT('operationFailed')}`)
      }
      const result = await this.request('uninstallSoft', [snapshot], this.progress(state, item))
      if (result?.uninstalled !== true) throw new Error(DamengT('operationFailed'))
      item.installed = false
      state.progress = 100
      await this.rescanAfterOperation()
      MessageSuccess(DamengT('uninstallComplete'))
      if (result.warning) MessageError(this.safeMessage(result.warning))
      return true
    })
  }

  getInstanceInfo(item: DamengInstalled): Promise<void> {
    const key = this.operationKey(item)
    const previous = this.infoRequests.get(key)
    if (previous) return previous
    const snapshot = JSON.parse(JSON.stringify(item))
    const password = this.credentials.sysdbaPassword
    this.information[key] = { busy: true, error: '' }
    const state = this.information[key]
    const pending = Promise.resolve()
      .then(async () => {
        if (!snapshot.run) throw new Error(DamengT('notRunning'))
        if (!password) throw new Error(DamengT('passwordRequired'))
        if (!isCurrentPasswordValid(password)) throw new Error(DamengT('currentPasswordInvalid'))
        const info = await this.request(
          'getInstanceInfo',
          [snapshot, { sysdbaPassword: password }],
          undefined,
          Math.min(this.timeoutMs, 60_000)
        )
        if (!info || typeof info.version !== 'string') throw new Error(DamengT('operationFailed'))
        state.data = {
          ...info,
          licenseError: info.licenseError
            ? this.safeMessage(info.licenseError, [password])
            : undefined
        }
      })
      .catch((error) => {
        state.error = this.safeMessage(error, [password])
      })
      .finally(() => {
        state.busy = false
        if (this.infoRequests.get(key) === pending) this.infoRequests.delete(key)
      })
    this.infoRequests.set(key, pending)
    return pending
  }

  startParams(item: DamengInstalled): Promise<[{ sysdbaPassword: string }]> {
    const key = this.operationKey(item)
    const previous = this.startRequests.get(key)
    if (previous) return previous
    const pending = Promise.resolve()
      .then(async (): Promise<[{ sysdbaPassword: string }]> => {
        await this.init()
        if (this.operations.has(key)) throw new Error(DamengT('operationInProgress'))
        if (this.unknown.has(key)) throw new Error(DamengT('outcomeUnknown'))
        const refreshState = async () => {
          const runtime: DamengRuntime = await this.request(
            'getInitializationState',
            [JSON.parse(JSON.stringify(item))],
            undefined,
            Math.min(this.timeoutMs, 60_000)
          )
          if (typeof runtime?.initialized !== 'boolean' || runtime.installId !== key)
            throw new Error(DamengT('operationFailed'))
          item.damengRuntime = runtime
          return runtime
        }
        if (!(await refreshState()).initialized) {
          if (!(await showSetupDialog(item))) throw new Error(DamengT('initializationCanceled'))
          if (!(await refreshState()).initialized)
            throw new Error(DamengT('initializationRequired'))
        }
        if (!this.credentials.sysdbaPassword) {
          if (!(await showSetupDialog())) throw new Error(DamengT('initializationCanceled'))
          if (!this.credentials.sysdbaPassword) throw new Error(DamengT('passwordRequired'))
        }
        if (!isCurrentPasswordValid(this.credentials.sysdbaPassword))
          throw new Error(DamengT('currentPasswordInvalid'))
        return [{ sysdbaPassword: this.credentials.sysdbaPassword }]
      })
      .finally(() => {
        if (this.startRequests.get(key) === pending) this.startRequests.delete(key)
      })
    this.startRequests.set(key, pending)
    return pending
  }

  async stopParams(): Promise<[]> {
    return []
  }
}

export const DamengManager = reactiveBind(new DamengPluginManager())
