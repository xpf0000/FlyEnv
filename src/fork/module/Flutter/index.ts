import { basename, dirname, join, relative } from 'path'
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
import fs from 'fs-extra'
import YAML from 'yamljs'

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
      const resolved = bins
        .map((v) => v.bin)
        .find((b) => !!b && existsSync(b))
      if (!resolved) {
        return {
          bin: '',
          source: 'unknown',
          searchDirs
        }
      }

      const normalizedBin = resolved.toLowerCase()
      const appDir = `${global.Server.AppDir ?? ''}`.toLowerCase()
      const customDirs = (Array.isArray(setup?.flutter?.dirs) ? setup.flutter.dirs : []).map((d: string) =>
        `${d}`.toLowerCase()
      )

      if (appDir && normalizedBin.includes(`${appDir}`) && normalizedBin.includes('static-flutter-')) {
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

  private async _resolveFlutterBin(setup?: any): Promise<string> {
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
        resolve({ ok: true, message: '', flutterBin, source: flutterInfo.source, searchDirs: flutterInfo.searchDirs, flutterVersion, dartVersion, channel, engineRevision, buildDate, raw })
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
          const dartBin = isWindows()
            ? join(flutterDir, 'dart.bat')
            : join(flutterDir, 'dart')
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
          message: 'Flutter binary not found. Set Flutter Version Folder Path or add flutter to PATH.',
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

  androidDevices() {
    return new ForkPromise(async (resolve) => {
      const adbPath = await this._resolveAdbPath()
      if (!adbPath) {
        resolve({
          ok: false,
          message: 'ADB not found',
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
          ok: false,
          message: e?.message ?? 'Failed to read ADB devices',
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
        ok: true,
        message: '',
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
        ok: true,
        message: '',
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

  private _sanitizeProjectName(name: string): string {
    return `${name ?? ''}`.trim().replace(/[^a-z0-9_]/gi, '_').toLowerCase()
  }

  private _bundleIdFrom(orgName: string, projectName: string): string {
    const org = `${orgName ?? ''}`.trim().replace(/[^a-z0-9.]/gi, '').toLowerCase()
    const name = this._sanitizeProjectName(projectName)
    const tail = name || 'app'
    if (!org) {
      return `com.example.${tail}`
    }
    const fixedOrg = org.endsWith('.') ? org.slice(0, -1) : org
    return `${fixedOrg}.${tail}`
  }

  private _normalizeBundleId(raw: string, orgName: string, projectName: string): string {
    const input = `${raw ?? ''}`.trim().toLowerCase()
    if (!input) {
      return this._bundleIdFrom(orgName, projectName)
    }
    const cleaned = input
      .replace(/[^a-z0-9._]/g, '_')
      .replace(/\.+/g, '.')
      .replace(/^\./, '')
      .replace(/\.$/, '')
    if (!cleaned.includes('.')) {
      return this._bundleIdFrom(orgName, cleaned)
    }
    return cleaned
  }

  private _toProjectRelative(projectDir: string, filePath: string): string {
    const p = `${filePath ?? ''}`.trim()
    if (!p) {
      return ''
    }
    if (!projectDir) {
      return p.replace(/\\/g, '/')
    }
    const rel = relative(projectDir, p).replace(/\\/g, '/')
    if (!rel || rel === '.') {
      return p.replace(/\\/g, '/')
    }
    return rel
  }

  private async _replaceByRegex(file: string, regex: RegExp, replaceWith: string): Promise<boolean> {
    if (!existsSync(file)) {
      return false
    }
    const content = await fs.readFile(file, 'utf-8')
    const next = content.replace(regex, replaceWith)
    if (next === content) {
      return false
    }
    await fs.writeFile(file, next)
    return true
  }

  private async _listFilesRecursive(root: string): Promise<string[]> {
    if (!root || !existsSync(root)) {
      return []
    }

    const files: string[] = []
    const stack: string[] = [root]

    while (stack.length) {
      const current = stack.pop() as string
      let entries: fs.Dirent[] = []
      try {
        entries = await fs.readdir(current, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        const full = join(current, entry.name)
        if (entry.isDirectory()) {
          stack.push(full)
        } else if (entry.isFile()) {
          files.push(full)
        }
      }
    }

    return files
  }

  private async _syncAndroidEntryPackage(projectDir: string, androidPackage: string): Promise<{
    updatedFiles: string[]
    manifestUpdated: boolean
  }> {
    const updatedFiles: string[] = []
    let manifestUpdated = false

    const sourceRoots = [
      join(projectDir, 'android', 'app', 'src', 'main', 'kotlin'),
      join(projectDir, 'android', 'app', 'src', 'main', 'java')
    ]

    const candidates: string[] = []
    for (const root of sourceRoots) {
      const files = await this._listFilesRecursive(root)
      candidates.push(
        ...files.filter((f) => /(MainActivity|MainApplication)\.(kt|java)$/i.test(basename(f)))
      )
    }

    for (const file of candidates) {
      let source = ''
      try {
        source = await fs.readFile(file, 'utf-8')
      } catch {
        continue
      }

      let next = source
      const hasPackageLine = /^\s*package\s+[a-zA-Z0-9_.]+\s*$/m.test(next)
      if (hasPackageLine) {
        next = next.replace(/^\s*package\s+[a-zA-Z0-9_.]+\s*$/m, `package ${androidPackage}`)
      } else {
        next = `package ${androidPackage}\n\n${next}`
      }

      if (next !== source) {
        await fs.writeFile(file, next)
        updatedFiles.push(file)
      }
    }

    const manifests = [
      join(projectDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
      join(projectDir, 'android', 'app', 'src', 'debug', 'AndroidManifest.xml'),
      join(projectDir, 'android', 'app', 'src', 'profile', 'AndroidManifest.xml')
    ]

    for (const manifest of manifests) {
      if (!existsSync(manifest)) {
        continue
      }
      let xml = ''
      try {
        xml = await fs.readFile(manifest, 'utf-8')
      } catch {
        continue
      }

      const nextXml = xml.replace(
        /(android:name\s*=\s*")[^"]*MainActivity(")/g,
        `$1.${'MainActivity'}$2`
      )

      if (nextXml !== xml) {
        await fs.writeFile(manifest, nextXml)
        manifestUpdated = true
      }
    }

    return { updatedFiles, manifestUpdated }
  }

  private async _readPubspec(projectDir: string): Promise<any> {
    const pubspec = join(projectDir, 'pubspec.yaml')
    if (!existsSync(pubspec)) {
      return null
    }
    try {
      const raw = await fs.readFile(pubspec, 'utf-8')
      const parsed = YAML.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }

  flutterPubDevSearch(query: string) {
    return new ForkPromise(async (resolve) => {
      const q = `${query ?? ''}`.trim()
      if (!q) {
        resolve({ ok: true, results: [] })
        return
      }
      try {
        const searchRes = await axios.get('https://pub.dev/api/search', {
          params: { q },
          timeout: 20000,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        const packages: string[] = Array.isArray(searchRes?.data?.packages)
          ? searchRes.data.packages.map((p: any) => `${p?.package ?? ''}`).filter(Boolean)
          : []
        const limited = packages.slice(0, 25)
        const details = await Promise.all(
          limited.map(async (name) => {
            try {
              const info = await axios.get(`https://pub.dev/api/packages/${name}`, {
                timeout: 20000,
                httpAgent: new http.Agent({ keepAlive: false }),
                httpsAgent: new https.Agent({ keepAlive: false }),
                proxy: this.getAxiosProxy()
              })
              return {
                name,
                latest: `${info?.data?.latest?.version ?? ''}`,
                description: `${info?.data?.latest?.pubspec?.description ?? ''}`.trim(),
                homepage: `${info?.data?.latest?.pubspec?.homepage ?? ''}`.trim(),
                repository: `${info?.data?.latest?.pubspec?.repository ?? ''}`.trim()
              }
            } catch {
              return {
                name,
                latest: '',
                description: '',
                homepage: '',
                repository: ''
              }
            }
          })
        )
        resolve({
          ok: true,
          query: q,
          total: packages.length,
          results: details
        })
      } catch (e: any) {
        resolve({
          ok: false,
          query: q,
          total: 0,
          results: [],
          message: e?.message ?? 'Failed to search pub.dev'
        })
      }
    })
  }

  flutterPubPackageVersions(packageName: string) {
    return new ForkPromise(async (resolve) => {
      const name = `${packageName ?? ''}`.trim()
      if (!name) {
        resolve({ ok: true, package: '', latest: '', versions: [] })
        return
      }
      try {
        const info = await axios.get(`https://pub.dev/api/packages/${name}`, {
          timeout: 20000,
          httpAgent: new http.Agent({ keepAlive: false }),
          httpsAgent: new https.Agent({ keepAlive: false }),
          proxy: this.getAxiosProxy()
        })
        const versions = Array.isArray(info?.data?.versions)
          ? info.data.versions
              .map((v: any) => `${v?.version ?? ''}`)
              .filter(Boolean)
              .slice(0, 80)
          : []
        resolve({
          ok: true,
          package: name,
          latest: `${info?.data?.latest?.version ?? ''}`,
          versions
        })
      } catch (e: any) {
        resolve({
          ok: false,
          package: name,
          latest: '',
          versions: [],
          message: e?.message ?? 'Failed to fetch package versions'
        })
      }
    })
  }

  flutterProjectPackages(projectDir: string, setup?: any) {
    return new ForkPromise(async (resolve) => {
      const dir = `${projectDir ?? ''}`.trim()
      if (!dir || !existsSync(dir) || !existsSync(join(dir, 'pubspec.yaml'))) {
        resolve({ ok: false, message: 'Invalid Flutter project directory', dependencies: [], devDependencies: [], outdated: [] })
        return
      }

      const pubspec = await this._readPubspec(dir)
      if (!pubspec) {
        resolve({ ok: false, message: 'Failed to parse pubspec.yaml', dependencies: [], devDependencies: [], outdated: [] })
        return
      }

      const depsObj = pubspec?.dependencies && typeof pubspec.dependencies === 'object' ? pubspec.dependencies : {}
      const devDepsObj = pubspec?.dev_dependencies && typeof pubspec.dev_dependencies === 'object' ? pubspec.dev_dependencies : {}

      const normalize = (obj: any) =>
        Object.keys(obj)
          .filter((name) => name !== 'flutter')
          .map((name) => {
            const val = obj[name]
            if (typeof val === 'string') {
              return { name, version: val, type: 'hosted' }
            }
            if (val && typeof val === 'object') {
              return { name, version: JSON.stringify(val), type: 'complex' }
            }
            return { name, version: '', type: 'unknown' }
          })

      let outdated: any[] = []
      const flutterBin = await this._resolveFlutterBin(setup)
      if (flutterBin) {
        try {
          const cmd = `"${flutterBin}" pub outdated --json`
          const res = await execPromiseWithEnv(cmd, { cwd: dir })
          const raw = `${res.stdout ?? ''}`.trim()
          const parsed = raw ? JSON.parse(raw) : null
          const packages = Array.isArray(parsed?.packages) ? parsed.packages : []
          outdated = packages.map((p: any) => ({
            package: `${p?.package ?? ''}`,
            kind: `${p?.kind ?? ''}`,
            current: `${p?.current?.version ?? ''}`,
            upgradable: `${p?.upgradable?.version ?? ''}`,
            resolvable: `${p?.resolvable?.version ?? ''}`,
            latest: `${p?.latest?.version ?? ''}`
          }))
        } catch {
          outdated = []
        }
      }

      resolve({
        ok: true,
        message: '',
        projectName: `${pubspec?.name ?? ''}`,
        dependencies: normalize(depsObj),
        devDependencies: normalize(devDepsObj),
        outdated
      })
    })
  }

  flutterReadProjectConfig(projectDir: string, setup?: any) {
    return new ForkPromise(async (resolve) => {
      const dir = `${projectDir ?? ''}`.trim()
      if (!dir || !existsSync(dir) || !existsSync(join(dir, 'pubspec.yaml'))) {
        resolve({ ok: false, message: 'Invalid Flutter project directory' })
        return
      }

      const pubspec = await this._readPubspec(dir)
      if (!pubspec) {
        resolve({ ok: false, message: 'Failed to parse pubspec.yaml' })
        return
      }

      const projectName = `${pubspec?.name ?? ''}`

      const androidGradle = join(dir, 'android', 'app', 'build.gradle')
      const androidGradleKts = join(dir, 'android', 'app', 'build.gradle.kts')
      const iosPbxproj = join(dir, 'ios', 'Runner.xcodeproj', 'project.pbxproj')
      const webManifest = join(dir, 'web', 'manifest.json')

      let androidPackage = ''
      let iosPackage = ''
      let webPackage = ''

      try {
        const source = existsSync(androidGradleKts)
          ? await fs.readFile(androidGradleKts, 'utf-8')
          : existsSync(androidGradle)
            ? await fs.readFile(androidGradle, 'utf-8')
            : ''
        const m = source.match(/applicationId\s*[= ]\s*['\"]([^'\"]+)['\"]/)
        androidPackage = `${m?.[1] ?? ''}`
      } catch {
        androidPackage = ''
      }

      try {
        if (existsSync(iosPbxproj)) {
          const pbx = await fs.readFile(iosPbxproj, 'utf-8')
          const m = pbx.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/)
          iosPackage = `${m?.[1] ?? ''}`.trim()
        }
      } catch {
        iosPackage = ''
      }

      try {
        if (existsSync(webManifest)) {
          const m = JSON.parse(await fs.readFile(webManifest, 'utf-8'))
          webPackage = `${m?.name ?? ''}`
        }
      } catch {
        webPackage = ''
      }

      const orgName = (() => {
        const source = androidPackage || iosPackage
        if (!source || !source.includes('.')) {
          return 'com.example'
        }
        const seg = source.split('.')
        return seg.length > 1 ? seg.slice(0, -1).join('.') : 'com.example'
      })()

      const packagesRes: any = await this.flutterProjectPackages(dir, setup)
      const packData = packagesRes?.data ?? packagesRes

      resolve({
        ok: true,
        message: '',
        projectName,
        orgName,
        packageNames: {
          android: androidPackage,
          ios: iosPackage,
          web: webPackage,
          desktop: ''
        },
        dependencies: packData?.dependencies ?? [],
        devDependencies: packData?.devDependencies ?? [],
        outdated: packData?.outdated ?? []
      })
    })
  }

  flutterApplyProjectConfig(projectDir: string, payload?: any, setup?: any) {
    return new ForkPromise(async (resolve) => {
      const dir = `${projectDir ?? ''}`.trim()
      if (!dir || !existsSync(dir) || !existsSync(join(dir, 'pubspec.yaml'))) {
        resolve({ ok: false, message: 'Invalid Flutter project directory', logs: [], warnings: [] })
        return
      }

      const logs: string[] = []
      const warnings: string[] = []
      const data = payload && typeof payload === 'object' ? payload : {}

      const pubspecPath = join(dir, 'pubspec.yaml')
      const pubspec = (await this._readPubspec(dir)) ?? {}
      const projectNameRaw = `${data?.projectName ?? pubspec?.name ?? ''}`.trim()
      const projectName = this._sanitizeProjectName(projectNameRaw || pubspec?.name || 'my_app')
      const orgName = `${data?.orgName ?? ''}`.trim()

      if (projectName) {
        pubspec.name = projectName
        logs.push(`Project name set to ${projectName}`)
      }

      const hasDepPayload = Array.isArray(data?.dependencies)
      const depList: Array<{ name: string; version?: string; isDev?: boolean }> = hasDepPayload
        ? data.dependencies
        : []

      let requiresPubGet = false
      if (hasDepPayload) {
        const oldDeps = pubspec.dependencies && typeof pubspec.dependencies === 'object' ? pubspec.dependencies : {}
        const oldFlutterDep = oldDeps?.flutter

        pubspec.dependencies = {}
        if (oldFlutterDep) {
          pubspec.dependencies.flutter = oldFlutterDep
        }
        pubspec.dev_dependencies = {}

        for (const dep of depList) {
          const name = `${dep?.name ?? ''}`.trim()
          if (!name) {
            continue
          }
          const version = `${dep?.version ?? ''}`.trim() || 'any'
          if (dep?.isDev) {
            pubspec.dev_dependencies[name] = version
          } else {
            pubspec.dependencies[name] = version
          }
          requiresPubGet = true
        }
        logs.push(`Dependencies synced: ${depList.length}`)
      }

      const icons = data?.appIcons && typeof data.appIcons === 'object' ? data.appIcons : {}
      const hasIconConfig = Object.values(icons).some((v) => !!`${v ?? ''}`.trim())
      if (hasIconConfig) {
        pubspec.dev_dependencies =
          pubspec.dev_dependencies && typeof pubspec.dev_dependencies === 'object'
            ? pubspec.dev_dependencies
            : {}
        pubspec.dev_dependencies.flutter_launcher_icons = '^0.14.4'

        const launcherCfg: any = {}
        const androidIcon = `${icons?.android ?? ''}`.trim()
        const iosIcon = `${icons?.ios ?? ''}`.trim()
        const webIcon = `${icons?.web ?? ''}`.trim()
        const windowsIcon = `${icons?.windows ?? ''}`.trim()
        const macosIcon = `${icons?.macos ?? ''}`.trim()
        const linuxIcon = `${icons?.linux ?? ''}`.trim()

        if (androidIcon) {
          launcherCfg.android = true
          launcherCfg.image_path_android = this._toProjectRelative(dir, androidIcon)
        }
        if (iosIcon) {
          launcherCfg.ios = true
          launcherCfg.image_path_ios = this._toProjectRelative(dir, iosIcon)
        }
        if (webIcon) {
          launcherCfg.web = {
            generate: true,
            image_path: this._toProjectRelative(dir, webIcon),
            background_color: '#ffffff',
            theme_color: '#ffffff'
          }
        }
        if (windowsIcon) {
          launcherCfg.windows = {
            generate: true,
            image_path: this._toProjectRelative(dir, windowsIcon),
            icon_size: 48
          }
        }
        if (macosIcon) {
          launcherCfg.macos = {
            generate: true,
            image_path: this._toProjectRelative(dir, macosIcon)
          }
        }
        if (linuxIcon) {
          warnings.push('Linux icon auto-generation is limited; launcher config was not applied for linux specifically')
        }

        pubspec.flutter_launcher_icons = launcherCfg
        requiresPubGet = true
        logs.push('App icon configuration added')
      }

      await fs.writeFile(pubspecPath, YAML.stringify(pubspec, 8, 2))

      const packageNames = data?.packageNames && typeof data.packageNames === 'object' ? data.packageNames : {}
      const androidPackage = this._normalizeBundleId(`${packageNames?.android ?? ''}`, orgName, projectName)
      const iosPackage = this._normalizeBundleId(`${packageNames?.ios ?? ''}`, orgName, projectName)
      const desktopPackage = this._normalizeBundleId(`${packageNames?.desktop ?? ''}`, orgName, projectName)
      const webPackage = `${packageNames?.web ?? ''}`.trim()

      const gradleFile = join(dir, 'android', 'app', 'build.gradle')
      const gradleKtsFile = join(dir, 'android', 'app', 'build.gradle.kts')

      const androidChangedGroovy = await this._replaceByRegex(
        gradleFile,
        /applicationId\s+['\"][^'\"]+['\"]/g,
        `applicationId "${androidPackage}"`
      )
      const androidChangedKts = await this._replaceByRegex(
        gradleKtsFile,
        /applicationId\s*=\s*['\"][^'\"]+['\"]/g,
        `applicationId = "${androidPackage}"`
      )
      await this._replaceByRegex(gradleFile, /namespace\s+['\"][^'\"]+['\"]/g, `namespace "${androidPackage}"`)
      await this._replaceByRegex(gradleKtsFile, /namespace\s*=\s*['\"][^'\"]+['\"]/g, `namespace = "${androidPackage}"`)
      if (androidChangedGroovy || androidChangedKts) {
        logs.push(`Android package set: ${androidPackage}`)
      }

      try {
        const androidSync = await this._syncAndroidEntryPackage(dir, androidPackage)
        if (androidSync.updatedFiles.length) {
          logs.push(`Android entry package synced in ${androidSync.updatedFiles.length} file(s)`)
        }
        if (androidSync.manifestUpdated) {
          logs.push('AndroidManifest activity names synced')
        }
      } catch (e: any) {
        warnings.push(e?.message ?? 'Failed to sync Android MainActivity package')
      }

      const iosPbxproj = join(dir, 'ios', 'Runner.xcodeproj', 'project.pbxproj')
      const macPbxproj = join(dir, 'macos', 'Runner.xcodeproj', 'project.pbxproj')
      const iosChanged = await this._replaceByRegex(
        iosPbxproj,
        /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/g,
        `PRODUCT_BUNDLE_IDENTIFIER = ${iosPackage};`
      )
      const macChanged = await this._replaceByRegex(
        macPbxproj,
        /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/g,
        `PRODUCT_BUNDLE_IDENTIFIER = ${desktopPackage};`
      )
      if (iosChanged) {
        logs.push(`iOS package set: ${iosPackage}`)
      }
      if (macChanged) {
        logs.push(`macOS package set: ${desktopPackage}`)
      }

      const webManifest = join(dir, 'web', 'manifest.json')
      if (webPackage && existsSync(webManifest)) {
        try {
          const manifest = JSON.parse(await fs.readFile(webManifest, 'utf-8'))
          manifest.name = webPackage
          if (!manifest.short_name) {
            manifest.short_name = webPackage
          }
          await fs.writeFile(webManifest, JSON.stringify(manifest, null, 2))
          logs.push(`Web package/app name set: ${webPackage}`)
        } catch {
          warnings.push('Failed to update web/manifest.json')
        }
      }

      const firebaseFiles = data?.firebaseFiles && typeof data.firebaseFiles === 'object' ? data.firebaseFiles : {}
      const firebaseTargets: Record<string, string> = {
        android: join(dir, 'android', 'app', 'google-services.json'),
        ios: join(dir, 'ios', 'Runner', 'GoogleService-Info.plist'),
        macos: join(dir, 'macos', 'Runner', 'GoogleService-Info.plist'),
        web: join(dir, 'web', 'firebase-options.json'),
        windows: join(dir, 'windows', 'firebase_app_id_file.json'),
        linux: join(dir, 'linux', 'firebase_app_id_file.json')
      }
      for (const platform of Object.keys(firebaseTargets)) {
        const src = `${firebaseFiles?.[platform] ?? ''}`.trim()
        if (!src) {
          continue
        }
        if (!existsSync(src)) {
          warnings.push(`Firebase file not found for ${platform}: ${src}`)
          continue
        }
        const target = firebaseTargets[platform]
        await fs.mkdirp(dirname(target))
        await fs.copy(src, target, { overwrite: true })
        logs.push(`Firebase file applied for ${platform}`)
      }

      const flutterBin = `${data?.flutterBin ?? ''}`.trim() || (await this._resolveFlutterBin(setup))
      let commandOutput = ''

      if (flutterBin && requiresPubGet) {
        try {
          const getRes = await execPromiseWithEnv(`"${flutterBin}" pub get`, { cwd: dir })
          commandOutput += `${getRes.stdout ?? ''}${getRes.stderr ?? ''}`
          logs.push('flutter pub get completed')
        } catch (e: any) {
          commandOutput += `${e?.stdout ?? ''}${e?.stderr ?? ''}`
          warnings.push(e?.message ?? 'flutter pub get failed')
        }
      }

      if (flutterBin && hasIconConfig) {
        try {
          const iconRes = await execPromiseWithEnv(`"${flutterBin}" pub run flutter_launcher_icons`, {
            cwd: dir
          })
          commandOutput += `${iconRes.stdout ?? ''}${iconRes.stderr ?? ''}`
          logs.push('flutter_launcher_icons completed')
        } catch (e: any) {
          commandOutput += `${e?.stdout ?? ''}${e?.stderr ?? ''}`
          warnings.push(e?.message ?? 'flutter_launcher_icons failed')
        }
      }

      let outdated: any[] = []
      if (flutterBin && data?.checkOutdated) {
        try {
          const outRes = await execPromiseWithEnv(`"${flutterBin}" pub outdated --json`, { cwd: dir })
          const parsed = JSON.parse(`${outRes.stdout ?? ''}`.trim() || '{}')
          outdated = Array.isArray(parsed?.packages) ? parsed.packages : []
          logs.push('pub outdated checked')
        } catch {
          warnings.push('Failed to parse flutter pub outdated output')
        }
      }

      resolve({
        ok: true,
        message: 'Flutter project config applied',
        logs,
        warnings,
        packageNames: {
          android: androidPackage,
          ios: iosPackage,
          web: webPackage,
          desktop: desktopPackage
        },
        outdated,
        output: commandOutput.slice(-120000)
      })
    })
  }

  flutterCreateProject(
    projectName: string,
    outputDir: string,
    template: 'app' | 'package' | 'plugin' | 'module' | 'skeleton',
    orgName: string,
    flutterBinOverride: string,
    setup?: any,
    extraConfig?: any
  ) {
    return new ForkPromise(async (resolve) => {
      const name = this._sanitizeProjectName(projectName)
      if (!name) {
        resolve({ ok: false, message: 'Project name is required', output: '', projectPath: '' })
        return
      }

      const dir = `${outputDir ?? ''}`.trim()
      if (!dir || !existsSync(dir)) {
        resolve({ ok: false, message: 'Output directory does not exist', output: '', projectPath: '' })
        return
      }

      const projectPath = join(dir, name)
      if (existsSync(projectPath)) {
        resolve({ ok: false, message: `Directory already exists: ${projectPath}`, output: '', projectPath })
        return
      }

      const flutterBin = `${flutterBinOverride ?? ''}`.trim() || (await this._resolveFlutterBin(setup))
      if (!flutterBin) {
        resolve({ ok: false, message: 'Flutter binary not found', output: '', projectPath: '' })
        return
      }

      const args: string[] = [`create`, `--template=${template || 'app'}`]
      const org = `${orgName ?? ''}`.trim()
      if (org) {
        args.push(`--org`, org)
      }
      args.push(name)

      const command = `"${flutterBin}" ${args.join(' ')}`
      appDebugLog('[flutter][createProject][cmd]', command).catch()

      try {
        const res = await execPromiseWithEnv(command, { cwd: dir })
        let output = `${res.stdout ?? ''}${res.stderr ?? ''}`

        if (extraConfig && typeof extraConfig === 'object') {
          const applied: any = await this.flutterApplyProjectConfig(
            projectPath,
            {
              ...extraConfig,
              projectName: extraConfig?.projectName || name,
              orgName: extraConfig?.orgName || org,
              flutterBin: flutterBin
            },
            setup
          )
          const applyData = applied?.data ?? applied
          const applyOutput = `${applyData?.output ?? ''}`
          if (applyOutput) {
            output += `\n${applyOutput}`
          }
          const warnings = Array.isArray(applyData?.warnings) ? applyData.warnings : []
          if (warnings.length) {
            output += `\nWarnings:\n- ${warnings.join('\n- ')}`
          }
        }

        resolve({ ok: true, message: `Project "${name}" created successfully`, output: output.slice(-120000), projectPath })
      } catch (e: any) {
        const output = `${e?.stdout ?? ''}${e?.stderr ?? ''}`
        appDebugLog('[flutter][createProject][error]', JSON.stringify({ error: e?.message })).catch()
        resolve({ ok: false, message: e?.message ?? 'flutter create failed', output: output.slice(-120000), projectPath })
      }
    })
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
