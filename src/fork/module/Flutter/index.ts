import { basename, dirname, join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  execPromiseWithEnv,
  getSubDirAsync,
  mkdirp,
  moveChildDirToParent,
  remove,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionLocalFetch,
  versionSort,
  zipUnpack
} from '../../Fn'
import TaskQueue from '../../TaskQueue'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { appDebugLog } from '@shared/utils'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import { userInfo } from 'os'
import { androidMethods } from './android'
import { projectMethods } from './project'
import { _archiveExt, _detectChannelByUrl } from './util'

class Flutter extends Base {
  constructor() {
    super()
    this.type = 'flutter'
  }

  private async _collectFlutterSearchDirs(setup?: any): Promise<string[]> {
    const home = userInfo().homedir
    const envFlutterRoot = `${process.env.FLUTTER_ROOT ?? ''}`.trim()
    const customDirs = Array.isArray(setup?.flutter?.dirs) ? setup.flutter.dirs : []

    const defaults: string[] = []
    if (isWindows()) {
      defaults.push(
        join(home, 'development', 'flutter'),
        join(home, 'flutter'),
        join(home, 'scoop', 'apps', 'flutter', 'current'),
        join(home, 'AppData', 'Local', 'Flutter')
      )
    } else {
      defaults.push(
        join(home, 'development', 'flutter'),
        join(home, 'flutter'),
        '/opt/flutter',
        '/usr/local/flutter'
      )
    }

    let staticDirs: string[] = []
    const appDir = `${global.Server.AppDir ?? ''}`.trim()
    if (appDir && existsSync(appDir)) {
      try {
        const subs = await getSubDirAsync(appDir)
        staticDirs = subs
          .filter((d) => basename(d).startsWith('static-flutter-'))
          .sort((a, b) => (a > b ? -1 : 1))
      } catch {
        staticDirs = []
      }
    }

    const all = [envFlutterRoot, ...defaults, ...customDirs, ...staticDirs].filter(Boolean)
    return Array.from(new Set(all))
  }

  private async _resolveFlutterBinInfo(setup?: any): Promise<{
    bin: string
    source: 'path' | 'default' | 'custom' | 'flyenv' | 'unknown'
    searchDirs: string[]
  }> {
    try {
      const command = isWindows() ? 'where flutter' : 'which flutter'
      const res = await execPromiseWithEnv(command)
      const hit = `${res.stdout ?? ''}`
        .split('\n')
        .map((s) => s.trim())
        .find((s) => !!s)
      if (hit) {
        return {
          bin: hit,
          source: 'path',
          searchDirs: []
        }
      }
    } catch {
      // noop
    }

    const searchDirs = await this._collectFlutterSearchDirs(setup)
    if (!searchDirs.length) {
      return {
        bin: '',
        source: 'unknown',
        searchDirs
      }
    }

    try {
      const bins = await versionLocalFetch(
        searchDirs,
        isWindows() ? 'flutter.bat' : 'flutter',
        isWindows() ? undefined : 'flutter',
        isWindows()
          ? ['flutter.bat', 'bin/flutter.bat', 'flutter/bin/flutter.bat']
          : ['flutter', 'bin/flutter', 'flutter/bin/flutter']
      )
      const resolved = bins.map((v) => v.bin).find((b) => !!b && existsSync(b))
      if (!resolved) {
        return {
          bin: '',
          source: 'unknown',
          searchDirs
        }
      }

      const normalizedBin = resolved.toLowerCase()
      const appDir = `${global.Server.AppDir ?? ''}`.toLowerCase()
      const customDirs = (Array.isArray(setup?.flutter?.dirs) ? setup.flutter.dirs : []).map(
        (d: string) => `${d}`.toLowerCase()
      )

      if (
        appDir &&
        normalizedBin.includes(`${appDir}`) &&
        normalizedBin.includes('static-flutter-')
      ) {
        return {
          bin: resolved,
          source: 'flyenv',
          searchDirs
        }
      }

      if (customDirs.some((d: string) => d && normalizedBin.includes(d))) {
        return {
          bin: resolved,
          source: 'custom',
          searchDirs
        }
      }

      return {
        bin: resolved,
        source: 'default',
        searchDirs
      }
    } catch {
      return {
        bin: '',
        source: 'unknown',
        searchDirs
      }
    }
  }

  protected async _resolveFlutterBin(setup?: any): Promise<string> {
    const info = await this._resolveFlutterBinInfo(setup)
    return info.bin
  }

  flutterQuickAction(action: 'run' | 'build-apk' | 'build-appbundle', projectDir: string) {
    return new ForkPromise(async (resolve) => {
      const dir = `${projectDir ?? ''}`.trim()
      if (!dir || !existsSync(dir)) {
        resolve({
          ok: false,
          action,
          message: 'Invalid Flutter project directory',
          output: ''
        })
        return
      }

      const pubspec = join(dir, 'pubspec.yaml')
      if (!existsSync(pubspec)) {
        resolve({
          ok: false,
          action,
          message: 'pubspec.yaml not found in selected directory',
          output: ''
        })
        return
      }

      const flutterInfo = await this._resolveFlutterBinInfo()
      const flutterBin = flutterInfo.bin
      if (!flutterBin) {
        resolve({
          ok: false,
          action,
          source: flutterInfo.source,
          searchDirs: flutterInfo.searchDirs,
          message: 'Flutter binary not found',
          output: ''
        })
        return
      }

      const targetDevice = process.env.FLYENV_FLUTTER_TARGET_DEVICE ?? ''
      let command = ''
      if (action === 'run') {
        const deviceArg = targetDevice ? ` -d "${targetDevice}"` : ''
        command = `"${flutterBin}" run${deviceArg}`
      } else if (action === 'build-apk') {
        command = `"${flutterBin}" build apk`
      } else {
        command = `"${flutterBin}" build appbundle`
      }

      try {
        const res = await execPromiseWithEnv(command, { cwd: dir })
        const output = `${res.stdout ?? ''}${res.stderr ?? ''}`
        resolve({
          ok: true,
          action,
          source: flutterInfo.source,
          searchDirs: flutterInfo.searchDirs,
          targetDevice,
          cwd: dir,
          command,
          message: 'Command completed successfully',
          output: output.slice(-120000)
        })
      } catch (e: any) {
        const stdout = `${e?.stdout ?? ''}`
        const stderr = `${e?.stderr ?? ''}`
        const message = e?.message ?? 'Command failed'
        resolve({
          ok: false,
          action,
          source: flutterInfo.source,
          searchDirs: flutterInfo.searchDirs,
          targetDevice,
          cwd: dir,
          command,
          message,
          output: `${stdout}${stderr}`.slice(-120000)
        })
      }
    })
  }

  flutterSdkInfo(setup?: any) {
    return new ForkPromise(async (resolve) => {
      const flutterInfo = await this._resolveFlutterBinInfo(setup)
      const flutterBin = flutterInfo.bin
      if (!flutterBin) {
        resolve({
          ok: false,
          message: 'Flutter binary not found',
          flutterBin: '',
          source: flutterInfo.source,
          searchDirs: flutterInfo.searchDirs,
          flutterVersion: '',
          dartVersion: '',
          channel: '',
          engineRevision: '',
          buildDate: '',
          raw: ''
        })
        return
      }
      try {
        let raw = ''
        let parsed: any = null
        try {
          const res = await execPromiseWithEnv(`"${flutterBin}" --version --machine`)
          raw = `${res.stdout ?? ''}`.trim()
          parsed = JSON.parse(raw)
        } catch {
          parsed = null
        }
        let flutterVersion = ''
        let dartVersion = ''
        let channel = ''
        let engineRevision = ''
        let buildDate = ''
        if (parsed && typeof parsed === 'object') {
          flutterVersion = `${parsed.flutterVersion ?? parsed.frameworkVersion ?? ''}`
          dartVersion = `${parsed.dartSdkVersion ?? parsed.dart ?? ''}`
          channel = `${parsed.channel ?? ''}`
          engineRevision = `${parsed.engineRevision ?? parsed.engineVersion ?? ''}`
          buildDate = `${parsed.buildDate ?? ''}`
        } else {
          const textRes = await execPromiseWithEnv(`"${flutterBin}" --version`)
          raw = `${textRes.stdout ?? ''}${textRes.stderr ?? ''}`
          const flutterMatch = raw.match(/Flutter\s+([\d.\w-]+)/)
          const dartMatch = raw.match(/Dart\s+([\d.\w-]+)/)
          const channelMatch = raw.match(/[•·]\s*channel\s+(\w+)/i) ?? raw.match(/channel\s+(\w+)/i)
          const engineMatch =
            raw.match(/Engine\s+[•·]\s*revision\s+([a-f0-9]+)/i) ??
            raw.match(/engine revision\s+([a-f0-9]+)/i)
          const buildMatch = raw.match(/([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})/)
          flutterVersion = flutterMatch?.[1] ?? ''
          dartVersion = dartMatch?.[1] ?? ''
          channel = channelMatch?.[1] ?? ''
          engineRevision = engineMatch?.[1] ?? ''
          buildDate = buildMatch?.[1] ?? ''
        }
        resolve({
          ok: true,
          message: '',
          flutterBin,
          source: flutterInfo.source,
          searchDirs: flutterInfo.searchDirs,
          flutterVersion,
          dartVersion,
          channel,
          engineRevision,
          buildDate,
          raw
        })
      } catch (e: any) {
        resolve({
          ok: false,
          message: e?.message ?? 'Failed to get Flutter SDK info',
          flutterBin,
          source: flutterInfo.source,
          searchDirs: flutterInfo.searchDirs,
          flutterVersion: '',
          dartVersion: '',
          channel: '',
          engineRevision: '',
          buildDate: '',
          raw: ''
        })
      }
    })
  }

  flutterAdvancedAction(
    action:
      | 'doctor'
      | 'upgrade'
      | 'channel-list'
      | 'channel-switch'
      | 'pub-get'
      | 'pub-upgrade'
      | 'pub-outdated'
      | 'pub-deps'
      | 'clean'
      | 'analyze'
      | 'test'
      | 'format'
      | 'build-apk'
      | 'build-apk-release'
      | 'build-web'
      | 'build-windows',
    arg?: string,
    setup?: any
  ) {
    return new ForkPromise(async (resolve) => {
      const flutterInfo = await this._resolveFlutterBinInfo(setup)
      const flutterBin = flutterInfo.bin
      if (!flutterBin) {
        resolve({
          ok: false,
          action,
          source: flutterInfo.source,
          searchDirs: flutterInfo.searchDirs,
          message: 'Flutter binary not found',
          output: '',
          command: ''
        })
        return
      }

      const noProjectActions = new Set(['doctor', 'upgrade', 'channel-list', 'channel-switch'])
      const cwd = noProjectActions.has(action) ? '' : `${arg ?? ''}`.trim()

      if (!noProjectActions.has(action)) {
        if (!cwd || !existsSync(cwd)) {
          resolve({
            ok: false,
            action,
            source: flutterInfo.source,
            searchDirs: flutterInfo.searchDirs,
            message: 'Invalid Flutter project directory',
            output: '',
            command: ''
          })
          return
        }
        if (!existsSync(join(cwd, 'pubspec.yaml'))) {
          resolve({
            ok: false,
            action,
            source: flutterInfo.source,
            searchDirs: flutterInfo.searchDirs,
            message: 'pubspec.yaml not found in selected directory',
            output: '',
            command: ''
          })
          return
        }
      }

      let command = ''
      switch (action) {
        case 'doctor':
          command = `"${flutterBin}" doctor -v`
          break
        case 'upgrade':
          command = `"${flutterBin}" upgrade`
          break
        case 'channel-list':
          command = `"${flutterBin}" channel`
          break
        case 'channel-switch': {
          const ch = `${arg ?? ''}`.trim() || 'stable'
          command = `"${flutterBin}" channel ${ch}`
          break
        }
        case 'pub-get':
          command = `"${flutterBin}" pub get`
          break
        case 'pub-upgrade':
          command = `"${flutterBin}" pub upgrade`
          break
        case 'pub-outdated':
          command = `"${flutterBin}" pub outdated`
          break
        case 'pub-deps':
          command = `"${flutterBin}" pub deps`
          break
        case 'clean':
          command = `"${flutterBin}" clean`
          break
        case 'analyze':
          command = `"${flutterBin}" analyze`
          break
        case 'test':
          command = `"${flutterBin}" test`
          break
        case 'format': {
          const flutterDir = dirname(flutterBin)
          const dartBin = isWindows() ? join(flutterDir, 'dart.bat') : join(flutterDir, 'dart')
          const dartCmd = existsSync(dartBin) ? `"${dartBin}"` : 'dart'
          command = `${dartCmd} format .`
          break
        }
        case 'build-apk':
          command = `"${flutterBin}" build apk --debug`
          break
        case 'build-apk-release':
          command = `"${flutterBin}" build apk --release`
          break
        case 'build-web':
          command = `"${flutterBin}" build web`
          break
        case 'build-windows':
          command = `"${flutterBin}" build windows`
          break
      }

      try {
        const res = await execPromiseWithEnv(command, cwd ? { cwd } : undefined)
        const output = `${res.stdout ?? ''}${res.stderr ?? ''}`
        resolve({
          ok: true,
          action,
          source: flutterInfo.source,
          searchDirs: flutterInfo.searchDirs,
          cwd,
          command,
          message: 'Command completed successfully',
          output: output.slice(-120000)
        })
      } catch (e: any) {
        const output = `${e?.stdout ?? ''}${e?.stderr ?? ''}`
        resolve({
          ok: false,
          action,
          source: flutterInfo.source,
          searchDirs: flutterInfo.searchDirs,
          cwd,
          command,
          message: e?.message ?? 'Command failed',
          output: output.slice(-120000)
        })
      }
    })
  }

  flutterDoctor(setup?: any) {
    return new ForkPromise(async (resolve) => {
      const flutterInfo = await this._resolveFlutterBinInfo(setup)
      const flutterBin = flutterInfo.bin
      if (!flutterBin) {
        resolve({
          ok: false,
          flutterBin: '',
          source: flutterInfo.source,
          message:
            'Flutter binary not found. Set Flutter Version Folder Path or add flutter to PATH.',
          items: [],
          summary: {
            total: 0,
            ok: 0,
            warning: 0,
            error: 0,
            unknown: 0
          },
          raw: ''
        })
        return
      }

      let output = ''
      try {
        const command = `"${flutterBin}" doctor -v`
        const res = await execPromiseWithEnv(command)
        output = `${res.stdout ?? ''}${res.stderr ?? ''}`
      } catch (e: any) {
        appDebugLog(
          '[flutter][doctor][error]',
          JSON.stringify({ flutterBin, error: e?.message ?? String(e) })
        ).catch()
        resolve({
          ok: false,
          flutterBin,
          source: flutterInfo.source,
          message: e?.message ?? 'Failed to run flutter doctor',
          items: [],
          summary: {
            total: 0,
            ok: 0,
            warning: 0,
            error: 0,
            unknown: 0
          },
          raw: ''
        })
        return
      }

      type DoctorItem = {
        status: 'ok' | 'warning' | 'error' | 'unknown'
        title: string
        details: string[]
      }

      const statusFromMark = (mark: string): DoctorItem['status'] => {
        if (mark === 'X') {
          return 'error'
        }
        if (mark === '!') {
          return 'warning'
        }
        if (mark === '+') {
          return 'ok'
        }
        return 'unknown'
      }

      const lines = output.split('\n').map((line) => line.replace(/\r/g, ''))

      const items: DoctorItem[] = []
      let current: DoctorItem | null = null

      const hasBracketPrefix = (line: string): boolean => {
        return /^\[[^\]]+\]\s+/.test(line.trim())
      }

      const normalizeMark = (line: string): string => {
        const m = line.trim().match(/^\[([^\]]+)\]/)
        const raw = `${m?.[1] ?? ''}`
        if (raw.includes('√') || raw.includes('✓') || raw.toLowerCase().includes('ok')) {
          return '+'
        }
        if (raw.includes('!')) {
          return '!'
        }
        if (
          raw.toLowerCase().includes('x') ||
          raw.includes('✗') ||
          raw.includes('×') ||
          raw.toLowerCase().includes('fail')
        ) {
          return 'X'
        }
        if (raw.includes('+') || raw.toLowerCase().includes('check')) {
          return '+'
        }
        return '?'
      }

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }

        if (hasBracketPrefix(trimmed)) {
          const mark = normalizeMark(trimmed)
          const title = trimmed.replace(/^\[[^\]]+\]\s+/, '')
          current = {
            status: statusFromMark(mark),
            title,
            details: []
          }
          items.push(current)
          continue
        }

        if (current) {
          current.details.push(trimmed)
        }
      }

      const summary = {
        total: items.length,
        ok: items.filter((i) => i.status === 'ok').length,
        warning: items.filter((i) => i.status === 'warning').length,
        error: items.filter((i) => i.status === 'error').length,
        unknown: items.filter((i) => i.status === 'unknown').length
      }

      appDebugLog(
        '[flutter][doctor][summary]',
        JSON.stringify({ flutterBin, summary, totalLines: lines.length })
      ).catch()

      resolve({
        ok: true,
        flutterBin,
        source: flutterInfo.source,
        message: '',
        items,
        summary,
        raw: output
      })
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchFlutterOfficialVersion()
        all.forEach((a: any) => {
          const channelRaw = `${a.channel ?? ''}`.toLowerCase()
          const channel =
            channelRaw === 'stable' || channelRaw === 'beta' || channelRaw === 'dev'
              ? channelRaw
              : _detectChannelByUrl(a.url)
          const ext = _archiveExt(a.url)
          const appDir = join(global.Server.AppDir!, `flutter`, a.version)
          const bin = isWindows()
            ? join(appDir, 'bin', 'flutter.bat')
            : join(appDir, 'bin', 'flutter')
          const zip = join(global.Server.Cache!, `static-flutter-${a.version}${ext}`)

          a.appDir = appDir
          a.zip = zip
          a.bin = bin
          a.downloaded = existsSync(zip)
          a.installed = existsSync(bin)
          a.name = `Flutter-${a.version}`
          a.channel = channel
        })
        resolve(all)
      } catch {
        resolve({})
      }
    })
  }

  private async _fetchFlutterOfficialVersion(): Promise<OnlineVersionItem[]> {
    try {
      let releaseFile = 'releases_windows.json'
      let platformKeyword = 'windows'
      if (isMacOS()) {
        releaseFile = 'releases_macos.json'
        platformKeyword = 'macos'
      } else if (isLinux()) {
        releaseFile = 'releases_linux.json'
        platformKeyword = 'linux'
      }

      const url = `https://storage.googleapis.com/flutter_infra_release/releases/${releaseFile}`
      const res = await axios({
        url,
        method: 'get',
        timeout: 30000,
        withCredentials: false,
        httpAgent: new http.Agent({ keepAlive: false }),
        httpsAgent: new https.Agent({ keepAlive: false }),
        proxy: this.getAxiosProxy()
      })

      const baseUrl: string = res?.data?.base_url ?? ''
      const releases: any[] = res?.data?.releases ?? []
      if (!baseUrl || !Array.isArray(releases)) {
        return []
      }

      const arch = global.Server.Arch === 'x86_64' ? 'x64' : 'arm64'
      const list = releases
        .filter((item) => {
          if (!item?.version || !item?.archive || !item?.channel) {
            return false
          }
          if (item.channel !== 'stable' && item.channel !== 'beta') {
            return false
          }
          const archive = `${item.archive}`.toLowerCase()
          if (!archive.includes(`/${platformKeyword}/`)) {
            return false
          }

          if (isMacOS()) {
            if (arch === 'arm64') {
              return archive.includes('_arm64_')
            }
            return !archive.includes('_arm64_')
          }

          return true
        })
        .map((item) => {
          return {
            version: item.version,
            mVersion: item.version,
            url: `${baseUrl}/${item.archive}`,
            channel: item.channel
          } as OnlineVersionItem
        })

      return list
    } catch {
      return []
    }
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise(async (resolve) => {
      const customDirs = setup?.flutter?.dirs ?? []
      const scanDirs = await this._collectFlutterSearchDirs(setup)
      appDebugLog('[flutter][allInstalledVersions][customDirs]', JSON.stringify(customDirs)).catch()
      appDebugLog('[flutter][allInstalledVersions][scanDirs]', JSON.stringify(scanDirs)).catch()

      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [
          versionLocalFetch(scanDirs, 'flutter.bat', undefined, [
            'flutter.bat',
            'bin/flutter.bat',
            'flutter/bin/flutter.bat'
          ])
        ]
      } else {
        all = [
          versionLocalFetch(scanDirs, 'flutter', 'flutter', [
            'flutter',
            'bin/flutter',
            'flutter/bin/flutter'
          ])
        ]
      }

      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          appDebugLog('[flutter][allInstalledVersions][rawCount]', `${versions.length}`).catch()
          appDebugLog(
            '[flutter][allInstalledVersions][rawBins]',
            JSON.stringify(versions.map((v) => v.bin))
          ).catch()
          versions = versionFilterSame(versions)
          appDebugLog('[flutter][allInstalledVersions][uniqueCount]', `${versions.length}`).catch()
          const all = versions.map((item) => {
            const command = `"${item.bin}" --version`
            const reg = /(Flutter\s+)(\d+(\.\d+){1,4})(.*?)/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then((list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            if (!version) {
              appDebugLog(
                '[flutter][allInstalledVersions][parseFailed]',
                JSON.stringify({ bin: versions[i]?.bin, error: error ?? '' })
              ).catch()
            }
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version,
              num,
              enable: version !== null,
              error
            })
          })
          appDebugLog(
            '[flutter][allInstalledVersions][resolved]',
            JSON.stringify(versions.map((v) => ({ version: v.version, bin: v.bin, path: v.path })))
          ).catch()
          resolve(versionSort(versions))
        })
        .catch(() => {
          appDebugLog('[flutter][allInstalledVersions][catch]', 'version discovery failed').catch()
          resolve([])
        })
    })
  }

  async _installSoftHandle(row: any): Promise<void> {
    console.log('_installSoftHandle !!!', row)
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
      await execPromiseWithEnv('git init', { cwd: row.appDir })
      return
    }

    const dir = row.appDir
    await super._installSoftHandle(row)
    await moveChildDirToParent(dir)
    await execPromiseWithEnv('git init', { cwd: dir })
  }

  getConfigFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Flutter 是 SDK/项目工具链，不是常驻服务；
    // pubspec.yaml / build.gradle / analysis_options.yaml 等配置均在具体项目目录下，
    // 不存在版本级或模块级固定配置文件路径。
    return []
  }

  getLogFiles(_version?: SoftInstalled): Array<{ name: string; path: string }> {
    // Flutter 命令直接输出到 stdout/stderr，没有固定版本级/模块级日志文件路径。
    return []
  }
}

Object.assign(Flutter.prototype, androidMethods, projectMethods)

export default new Flutter()
