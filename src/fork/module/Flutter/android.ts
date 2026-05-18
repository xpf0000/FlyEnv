import { join } from 'path'
import { existsSync } from 'fs'
import { ForkPromise } from '@shared/ForkPromise'
import { addPath, execPromiseWithEnv, getSubDirAsync } from '../../Fn'
import { isLinux, isMacOS, isWindows } from '@shared/utils'
import { appDebugLog } from '@shared/utils'
import { userInfo } from 'os'

export const androidMethods = {
  _androidSdkCandidates(this: any) {
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
  },

  _detectAndroidSdkDir(this: any) {
    const sdkCandidates = this._androidSdkCandidates()
    for (const dir of sdkCandidates) {
      if (existsSync(dir)) {
        return dir
      }
    }
    return ''
  },

  async _resolveAdbPath(this: any): Promise<string> {
    const sdkDir = this._detectAndroidSdkDir()
    const adbBySdk = sdkDir ? join(sdkDir, 'platform-tools', isWindows() ? 'adb.exe' : 'adb') : ''

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
  },

  androidDeviceAction(this: any, action: 'set-target' | 'disconnect' | 'info', deviceId: string) {
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
  },

  androidAutoFix(this: any, action: 'set-sdk-env' | 'add-platform-tools-path' | 'all' = 'all') {
    return new ForkPromise(async (resolve) => {
      const sdkDir = this._detectAndroidSdkDir()
      const platformToolsDir = sdkDir ? join(sdkDir, 'platform-tools') : ''

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
  },

  androidDevices(this: any) {
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
  },

  androidReadiness(this: any) {
    return new ForkPromise(async (resolve) => {
      const envAndroidHome = process.env.ANDROID_HOME ?? ''
      const envAndroidSdkRoot = process.env.ANDROID_SDK_ROOT ?? ''
      const envJavaHome = process.env.JAVA_HOME ?? ''
      const sdkDir = this._detectAndroidSdkDir()

      const adbBySdk = sdkDir ? join(sdkDir, 'platform-tools', isWindows() ? 'adb.exe' : 'adb') : ''

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
        javaVersion =
          `${javaRes.stderr ?? ''}${javaRes.stdout ?? ''}`
            .split('\n')
            .map((s) => s.trim())
            .find((s) => !!s)
            ?.replace(/\"/g, '') ?? ''
      } catch {
        javaVersion = ''
      }

      let gradleVersion = ''
      try {
        const gradleRes = await execPromiseWithEnv('gradle -v')
        gradleVersion =
          `${gradleRes.stdout ?? ''}${gradleRes.stderr ?? ''}`
            .split('\n')
            .map((s) => s.trim())
            .find((s) => s.toLowerCase().startsWith('gradle ')) ?? ''
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
}
