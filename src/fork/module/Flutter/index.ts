import { join } from 'path'
import { existsSync } from 'fs'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  addPath,
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

class Flutter extends Base {
  constructor() {
    super()
    this.type = 'flutter'
  }

  private async _resolveAdbPath(): Promise<string> {
    const sdkDir = this._detectAndroidSdkDir()
    const adbBySdk = sdkDir
      ? join(sdkDir, 'platform-tools', isWindows() ? 'adb.exe' : 'adb')
      : ''

    let adbByPath = ''
    try {
      const command = isWindows() ? 'where adb' : 'which adb'
      const adbRes = await execPromiseWithEnv(command)
      adbByPath =
        adbRes.stdout
          ?.split('\n')
          ?.map((s) => s.trim())
          ?.find((s) => !!s) ?? ''
    } catch {
      adbByPath = ''
    }

    return existsSync(adbBySdk) ? adbBySdk : adbByPath
  }

  androidDeviceAction(action: 'set-target' | 'disconnect' | 'info', deviceId: string) {
    return new ForkPromise(async (resolve) => {
      const id = `${deviceId ?? ''}`.trim()
      if (!id) {
        resolve({
          ok: false,
          action,
          message: 'Device ID is required'
        })
        return
      }

      const adbPath = await this._resolveAdbPath()
      if (!adbPath) {
        resolve({
          ok: false,
          action,
          message: 'ADB not found',
          adbPath: ''
        })
        return
      }

      try {
        if (action === 'set-target') {
          process.env.FLYENV_FLUTTER_TARGET_DEVICE = id
          resolve({
            ok: true,
            action,
            adbPath,
            targetDevice: id,
            message: `Target device set to ${id}`
          })
          return
        }

        if (action === 'disconnect') {
          const cmd = `"${adbPath}" disconnect "${id}"`
          const res = await execPromiseWithEnv(cmd)
          resolve({
            ok: true,
            action,
            adbPath,
            targetDevice: process.env.FLYENV_FLUTTER_TARGET_DEVICE ?? '',
            message: `${res.stdout ?? ''}${res.stderr ?? ''}`.trim() || `Disconnected ${id}`
          })
          return
        }

        const stateCmd = `"${adbPath}" -s "${id}" get-state`
        const propCmd = `"${adbPath}" -s "${id}" shell getprop`
        const [stateRes, propRes] = await Promise.all([
          execPromiseWithEnv(stateCmd),
          execPromiseWithEnv(propCmd)
        ])
        resolve({
          ok: true,
          action,
          adbPath,
          targetDevice: process.env.FLYENV_FLUTTER_TARGET_DEVICE ?? '',
          state: `${stateRes.stdout ?? ''}${stateRes.stderr ?? ''}`.trim(),
          details: `${propRes.stdout ?? ''}${propRes.stderr ?? ''}`.trim(),
          message: `Fetched info for ${id}`
        })
      } catch (e: any) {
        resolve({
          ok: false,
          action,
          adbPath,
          targetDevice: process.env.FLYENV_FLUTTER_TARGET_DEVICE ?? '',
          message: e?.message ?? `Failed to run action: ${action}`
        })
      }
    })
  }

  private _androidSdkCandidates() {
    const home = userInfo().homedir
    const envAndroidHome = process.env.ANDROID_HOME ?? ''
    const envAndroidSdkRoot = process.env.ANDROID_SDK_ROOT ?? ''

    return [
      envAndroidSdkRoot,
      envAndroidHome,
      isWindows() ? join(home, 'AppData', 'Local', 'Android', 'Sdk') : '',
      isMacOS() ? join(home, 'Library', 'Android', 'sdk') : '',
      isLinux() ? join(home, 'Android', 'Sdk') : ''
    ].filter((v, i, arr) => !!v && arr.indexOf(v) === i)
  }

  private _detectAndroidSdkDir() {
    const sdkCandidates = this._androidSdkCandidates()
    for (const dir of sdkCandidates) {
      if (existsSync(dir)) {
        return dir
      }
    }
    return ''
  }

  androidAutoFix(action: 'set-sdk-env' | 'add-platform-tools-path' | 'all' = 'all') {
    return new ForkPromise(async (resolve) => {
      const sdkDir = this._detectAndroidSdkDir()
      const platformToolsDir = sdkDir
        ? join(sdkDir, 'platform-tools')
        : ''

      const results: Array<{ key: string; ok: boolean; message: string }> = []

      if (!sdkDir) {
        resolve({
          ok: false,
          message: 'Android SDK not found. Install Android SDK first.',
          results,
          sdkDir: '',
          platformToolsDir: ''
        })
        return
      }

      const shouldSetSdkEnv = action === 'all' || action === 'set-sdk-env'
      const shouldSetPath = action === 'all' || action === 'add-platform-tools-path'

      if (shouldSetSdkEnv) {
        let ok = true
        let message = 'ANDROID_HOME and ANDROID_SDK_ROOT updated'
        try {
          if (isWindows()) {
            await execPromiseWithEnv(`setx ANDROID_HOME "${sdkDir}"`)
            await execPromiseWithEnv(`setx ANDROID_SDK_ROOT "${sdkDir}"`)
          } else {
            const profile = isMacOS() ? '$HOME/.zshrc' : '$HOME/.bashrc'
            const exportHome = `export ANDROID_HOME=\"${sdkDir}\"`
            const exportRoot = `export ANDROID_SDK_ROOT=\"${sdkDir}\"`
            await execPromiseWithEnv(
              `grep -q 'ANDROID_HOME=' ${profile} || echo '${exportHome}' >> ${profile}`
            )
            await execPromiseWithEnv(
              `grep -q 'ANDROID_SDK_ROOT=' ${profile} || echo '${exportRoot}' >> ${profile}`
            )
          }

          process.env.ANDROID_HOME = sdkDir
          process.env.ANDROID_SDK_ROOT = sdkDir
        } catch (e: any) {
          ok = false
          message = e?.message ?? 'Failed to set Android SDK environment variables'
        }
        results.push({
          key: 'set-sdk-env',
          ok,
          message
        })
      }

      if (shouldSetPath) {
        let ok = true
        let message = 'platform-tools added to PATH'

        if (!platformToolsDir || !existsSync(platformToolsDir)) {
          ok = false
          message = 'platform-tools not found in Android SDK'
        } else {
          try {
            if (isWindows()) {
              await addPath(platformToolsDir)
            } else {
              const profile = isMacOS() ? '$HOME/.zshrc' : '$HOME/.bashrc'
              const exportPath = `export PATH=\"${platformToolsDir}:$PATH\"`
              await execPromiseWithEnv(
                `grep -q '${platformToolsDir.replace(/\\/g, '\\\\')}' ${profile} || echo '${exportPath}' >> ${profile}`
              )
            }

            const sep = isWindows() ? ';' : ':'
            const oldPath = process.env.PATH ?? ''
            const hasPath = oldPath
              .split(sep)
              .map((s) => s.trim())
              .some((p) => p === platformToolsDir)
            if (!hasPath) {
              process.env.PATH = `${platformToolsDir}${sep}${oldPath}`
            }
          } catch (e: any) {
            ok = false
            message = e?.message ?? 'Failed to add platform-tools to PATH'
          }
        }

        results.push({
          key: 'add-platform-tools-path',
          ok,
          message
        })
      }

      const ok = results.every((r) => r.ok)
      const message = ok
        ? 'Android auto-fix completed'
        : 'Android auto-fix completed with partial failures'

      appDebugLog(
        '[flutter][androidAutoFix][result]',
        JSON.stringify({ action, sdkDir, platformToolsDir, results, ok })
      ).catch()

      resolve({
        ok,
        message,
        results,
        sdkDir,
        platformToolsDir
      })
    })
  }

  private async _resolveFlutterBin(): Promise<string> {
    try {
      const command = isWindows() ? 'where flutter' : 'which flutter'
      const res = await execPromiseWithEnv(command)
      const hit = `${res.stdout ?? ''}`
        .split('\n')
        .map((s) => s.trim())
        .find((s) => !!s)
      if (hit) {
        return hit
      }
    } catch {
      // noop
    }

    const customDirs = Array.from(
      new Set([
        global.Server.AppDir ?? '',
        global.Server.Static ?? '',
        global.Server.BaseDir ?? ''
      ])
    ).filter((s) => !!s)
    const bins = await versionLocalFetch(
      customDirs,
      isWindows() ? 'flutter.bat' : 'flutter',
      isWindows() ? undefined : 'flutter',
      isWindows()
        ? ['flutter.bat', 'bin/flutter.bat', 'flutter/bin/flutter.bat']
        : ['flutter', 'bin/flutter', 'flutter/bin/flutter']
    )

    const resolved = bins
      .map((v) => v.bin)
      .find((b) => !!b && existsSync(b))

    return resolved ?? ''
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

      const flutterBin = await this._resolveFlutterBin()
      if (!flutterBin) {
        resolve({
          ok: false,
          action,
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
          targetDevice,
          cwd: dir,
          command,
          message,
          output: `${stdout}${stderr}`.slice(-120000)
        })
      }
    })
  }

  flutterDoctor() {
    return new ForkPromise(async (resolve) => {
      const flutterBin = await this._resolveFlutterBin()
      if (!flutterBin) {
        resolve({
          flutterBin: '',
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
          flutterBin,
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

      const lines = output
        .split('\n')
        .map((line) => line.replace(/\r/g, ''))

      const items: DoctorItem[] = []
      let current: DoctorItem | null = null

      const hasBracketPrefix = (line: string): boolean => {
        return /^\[[^\]]+\]\s+/.test(line.trim())
      }

      const normalizeMark = (line: string): string => {
        const m = line.trim().match(/^\[([^\]]+)\]/)
        const raw = `${m?.[1] ?? ''}`
        if (raw.includes('!')) {
          return '!'
        }
        if (raw.toLowerCase().includes('x')) {
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
        flutterBin,
        items,
        summary,
        raw: output
      })
    })
  }

  androidDevices() {
    return new ForkPromise(async (resolve) => {
      const adbPath = await this._resolveAdbPath()
      if (!adbPath) {
        resolve({
          adbPath: '',
          devices: [],
          targetDevice: process.env.FLYENV_FLUTTER_TARGET_DEVICE ?? '',
          summary: {
            total: 0,
            online: 0,
            offline: 0,
            unauthorized: 0,
            other: 0
          }
        })
        return
      }

      let stdout = ''
      try {
        const command = `"${adbPath}" devices -l`
        const res = await execPromiseWithEnv(command)
        stdout = `${res.stdout ?? ''}`
      } catch (e: any) {
        appDebugLog(
          '[flutter][androidDevices][error]',
          JSON.stringify({ adbPath, error: e?.message ?? String(e) })
        ).catch()
        resolve({
          adbPath,
          devices: [],
          targetDevice: process.env.FLYENV_FLUTTER_TARGET_DEVICE ?? '',
          summary: {
            total: 0,
            online: 0,
            offline: 0,
            unauthorized: 0,
            other: 0
          }
        })
        return
      }

      const lines = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => !!s)
        .filter((s) => !s.toLowerCase().startsWith('list of devices attached'))

      const devices = lines
        .map((line) => {
          const parts = line.split(/\s+/).filter(Boolean)
          if (!parts.length) {
            return null
          }
          const id = parts[0] ?? ''
          const status = parts[1] ?? 'unknown'
          const meta = parts.slice(2).join(' ')
          if (!id) {
            return null
          }
          return {
            id,
            status,
            meta
          }
        })
        .filter((item): item is { id: string; status: string; meta: string } => !!item)

      const summary = {
        total: devices.length,
        online: devices.filter((d) => d.status === 'device').length,
        offline: devices.filter((d) => d.status === 'offline').length,
        unauthorized: devices.filter((d) => d.status === 'unauthorized').length,
        other: devices.filter(
          (d) => d.status !== 'device' && d.status !== 'offline' && d.status !== 'unauthorized'
        ).length
      }

      appDebugLog(
        '[flutter][androidDevices][summary]',
        JSON.stringify({ adbPath, summary, count: devices.length })
      ).catch()

      resolve({
        adbPath,
        devices,
        targetDevice: process.env.FLYENV_FLUTTER_TARGET_DEVICE ?? '',
        summary
      })
    })
  }

  androidReadiness() {
    return new ForkPromise(async (resolve) => {
      const envAndroidHome = process.env.ANDROID_HOME ?? ''
      const envAndroidSdkRoot = process.env.ANDROID_SDK_ROOT ?? ''
      const envJavaHome = process.env.JAVA_HOME ?? ''
      const sdkDir = this._detectAndroidSdkDir()

      const adbBySdk = sdkDir
        ? join(sdkDir, 'platform-tools', isWindows() ? 'adb.exe' : 'adb')
        : ''

      let adbByPath = ''
      try {
        const command = isWindows() ? 'where adb' : 'which adb'
        const adbRes = await execPromiseWithEnv(command)
        adbByPath =
          adbRes.stdout
            ?.split('\n')
            ?.map((s) => s.trim())
            ?.find((s) => !!s) ?? ''
      } catch {
        adbByPath = ''
      }

      const adbPath = existsSync(adbBySdk) ? adbBySdk : adbByPath

      let javaVersion = ''
      try {
        const javaRes = await execPromiseWithEnv('java -version')
        javaVersion = `${javaRes.stderr ?? ''}${javaRes.stdout ?? ''}`
          .split('\n')
          .map((s) => s.trim())
          .find((s) => !!s)
          ?.replace(/\"/g, '')
          ?? ''
      } catch {
        javaVersion = ''
      }

      let gradleVersion = ''
      try {
        const gradleRes = await execPromiseWithEnv('gradle -v')
        gradleVersion = `${gradleRes.stdout ?? ''}${gradleRes.stderr ?? ''}`
          .split('\n')
          .map((s) => s.trim())
          .find((s) => s.toLowerCase().startsWith('gradle '))
          ?? ''
      } catch {
        gradleVersion = ''
      }

      const buildToolsDir = sdkDir ? join(sdkDir, 'build-tools') : ''
      const cmdlineToolsDir = sdkDir ? join(sdkDir, 'cmdline-tools') : ''
      const platformToolsDir = sdkDir ? join(sdkDir, 'platform-tools') : ''

      let buildToolsCount = 0
      if (buildToolsDir && existsSync(buildToolsDir)) {
        try {
          const subs = await getSubDirAsync(buildToolsDir)
          buildToolsCount = subs.length
        } catch {
          buildToolsCount = 0
        }
      }

      const checks = [
        {
          key: 'sdk',
          label: 'Android SDK',
          ok: !!sdkDir,
          value: sdkDir || 'Not found',
          hint: 'Set ANDROID_HOME or ANDROID_SDK_ROOT to your SDK path'
        },
        {
          key: 'platform-tools',
          label: 'platform-tools',
          ok: !!platformToolsDir && existsSync(platformToolsDir),
          value: platformToolsDir || 'Not found',
          hint: 'Install Android platform-tools from SDK Manager'
        },
        {
          key: 'adb',
          label: 'ADB',
          ok: !!adbPath,
          value: adbPath || 'Not found',
          hint: 'Ensure adb is installed and available in PATH'
        },
        {
          key: 'cmdline-tools',
          label: 'cmdline-tools',
          ok: !!cmdlineToolsDir && existsSync(cmdlineToolsDir),
          value: cmdlineToolsDir || 'Not found',
          hint: 'Install Android cmdline-tools (latest) from SDK Manager'
        },
        {
          key: 'build-tools',
          label: 'build-tools',
          ok: buildToolsCount > 0,
          value: buildToolsCount > 0 ? `${buildToolsCount} installed` : 'Not found',
          hint: 'Install at least one Android build-tools version'
        },
        {
          key: 'java',
          label: 'JDK (java)',
          ok: !!javaVersion,
          value: javaVersion || 'Not found',
          hint: 'Install JDK and set JAVA_HOME'
        },
        {
          key: 'gradle',
          label: 'Gradle',
          ok: !!gradleVersion,
          value: gradleVersion || 'Not found',
          hint: 'Optional globally, but useful for local Android workflows'
        }
      ]

      const passed = checks.filter((c) => c.ok).length
      const total = checks.length

      resolve({
        env: {
          ANDROID_HOME: envAndroidHome,
          ANDROID_SDK_ROOT: envAndroidSdkRoot,
          JAVA_HOME: envJavaHome
        },
        checks,
        summary: {
          passed,
          total,
          failed: total - passed
        }
      })
    })
  }

  private _archiveExt(url: string): string {
    const lower = (url || '').toLowerCase()
    if (lower.endsWith('.tar.xz')) {
      return '.tar.xz'
    }
    if (lower.endsWith('.tar.gz')) {
      return '.tar.gz'
    }
    if (lower.endsWith('.zip')) {
      return '.zip'
    }
    if (isWindows() || isMacOS()) {
      return '.zip'
    }
    return '.tar.xz'
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        let all: OnlineVersionItem[] = await this._fetchOnlineVersion('flutter')
        if (!Array.isArray(all) || all.length === 0) {
          all = await this._fetchFlutterOfficialVersion()
        }
        all.forEach((a: any) => {
          const channelRaw = `${a.channel ?? ''}`.toLowerCase()
          const channel =
            channelRaw === 'stable' || channelRaw === 'beta' || channelRaw === 'dev'
              ? channelRaw
              : this._detectChannelByUrl(a.url)
          const ext = this._archiveExt(a.url)
          const appDir = join(global.Server.AppDir!, `static-flutter-${a.version}`)
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

  private _detectChannelByUrl(url: string): 'stable' | 'beta' | 'dev' {
    const lower = `${url ?? ''}`.toLowerCase()
    if (lower.includes('/beta/')) {
      return 'beta'
    }
    if (lower.includes('/dev/')) {
      return 'dev'
    }
    return 'stable'
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
    return new ForkPromise((resolve) => {
      const customDirs = setup?.flutter?.dirs ?? []
      appDebugLog('[flutter][allInstalledVersions][customDirs]', JSON.stringify(customDirs)).catch()

      let versions: SoftInstalled[] = []
      let all: Promise<SoftInstalled[]>[] = []
      if (isWindows()) {
        all = [
          versionLocalFetch(customDirs, 'flutter.bat', undefined, [
            'flutter.bat',
            'bin/flutter.bat',
            'flutter/bin/flutter.bat'
          ])
        ]
      } else {
        all = [
          versionLocalFetch(customDirs, 'flutter', 'flutter', [
            'flutter',
            'bin/flutter',
            'flutter/bin/flutter'
          ])
        ]
      }

      Promise.all(all)
        .then(async (list) => {
          versions = list.flat()
          appDebugLog(
            '[flutter][allInstalledVersions][rawCount]',
            `${versions.length}`
          ).catch()
          appDebugLog(
            '[flutter][allInstalledVersions][rawBins]',
            JSON.stringify(versions.map((v) => v.bin))
          ).catch()
          versions = versionFilterSame(versions)
          appDebugLog(
            '[flutter][allInstalledVersions][uniqueCount]',
            `${versions.length}`
          ).catch()
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
    if (isWindows()) {
      await remove(row.appDir)
      await mkdirp(row.appDir)
      await zipUnpack(row.zip, row.appDir)
      await moveChildDirToParent(row.appDir)
      return
    }

    const dir = row.appDir
    await super._installSoftHandle(row)
    await moveChildDirToParent(dir)
  }
}

export default new Flutter()
