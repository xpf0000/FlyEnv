import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv } from '../../Fn'
import { appDebugLog } from '@shared/utils'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import fs from 'fs-extra'
import YAML from 'yamljs'
import { _sanitizeProjectName, _normalizeBundleId, _toProjectRelative } from './util'
import { _replaceByRegex, _syncAndroidEntryPackage, _readPubspec } from './fs-utils'

export const projectMethods = {
  flutterPubDevSearch(this: any, query: string) {
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
  },

  flutterPubPackageVersions(this: any, packageName: string) {
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
  },

  flutterProjectPackages(this: any, projectDir: string, setup?: any) {
    return new ForkPromise(async (resolve) => {
      const dir = `${projectDir ?? ''}`.trim()
      if (!dir || !existsSync(dir) || !existsSync(join(dir, 'pubspec.yaml'))) {
        resolve({
          ok: false,
          message: 'Invalid Flutter project directory',
          dependencies: [],
          devDependencies: [],
          outdated: []
        })
        return
      }

      const pubspec = await _readPubspec(dir)
      if (!pubspec) {
        resolve({
          ok: false,
          message: 'Failed to parse pubspec.yaml',
          dependencies: [],
          devDependencies: [],
          outdated: []
        })
        return
      }

      const depsObj =
        pubspec?.dependencies && typeof pubspec.dependencies === 'object'
          ? pubspec.dependencies
          : {}
      const devDepsObj =
        pubspec?.dev_dependencies && typeof pubspec.dev_dependencies === 'object'
          ? pubspec.dev_dependencies
          : {}

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
  },

  flutterReadProjectConfig(this: any, projectDir: string, setup?: any) {
    return new ForkPromise(async (resolve) => {
      const dir = `${projectDir ?? ''}`.trim()
      if (!dir || !existsSync(dir) || !existsSync(join(dir, 'pubspec.yaml'))) {
        resolve({ ok: false, message: 'Invalid Flutter project directory' })
        return
      }

      const pubspec = await _readPubspec(dir)
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
  },

  flutterApplyProjectConfig(this: any, projectDir: string, payload?: any, setup?: any) {
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
      const pubspec = (await _readPubspec(dir)) ?? {}
      const projectNameRaw = `${data?.projectName ?? pubspec?.name ?? ''}`.trim()
      const projectName = _sanitizeProjectName(projectNameRaw || pubspec?.name || 'my_app')
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
        const oldDeps =
          pubspec.dependencies && typeof pubspec.dependencies === 'object'
            ? pubspec.dependencies
            : {}
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
          launcherCfg.image_path_android = _toProjectRelative(dir, androidIcon)
        }
        if (iosIcon) {
          launcherCfg.ios = true
          launcherCfg.image_path_ios = _toProjectRelative(dir, iosIcon)
        }
        if (webIcon) {
          launcherCfg.web = {
            generate: true,
            image_path: _toProjectRelative(dir, webIcon),
            background_color: '#ffffff',
            theme_color: '#ffffff'
          }
        }
        if (windowsIcon) {
          launcherCfg.windows = {
            generate: true,
            image_path: _toProjectRelative(dir, windowsIcon),
            icon_size: 48
          }
        }
        if (macosIcon) {
          launcherCfg.macos = {
            generate: true,
            image_path: _toProjectRelative(dir, macosIcon)
          }
        }
        if (linuxIcon) {
          warnings.push(
            'Linux icon auto-generation is limited; launcher config was not applied for linux specifically'
          )
        }

        pubspec.flutter_launcher_icons = launcherCfg
        requiresPubGet = true
        logs.push('App icon configuration added')
      }

      await fs.writeFile(pubspecPath, YAML.stringify(pubspec, 8, 2))

      const packageNames =
        data?.packageNames && typeof data.packageNames === 'object' ? data.packageNames : {}
      const androidPackage = _normalizeBundleId(
        `${packageNames?.android ?? ''}`,
        orgName,
        projectName
      )
      const iosPackage = _normalizeBundleId(`${packageNames?.ios ?? ''}`, orgName, projectName)
      const desktopPackage = _normalizeBundleId(
        `${packageNames?.desktop ?? ''}`,
        orgName,
        projectName
      )
      const webPackage = `${packageNames?.web ?? ''}`.trim()

      const gradleFile = join(dir, 'android', 'app', 'build.gradle')
      const gradleKtsFile = join(dir, 'android', 'app', 'build.gradle.kts')

      const androidChangedGroovy = await _replaceByRegex(
        gradleFile,
        /applicationId\s+['\"][^'\"]+['\"]/g,
        `applicationId "${androidPackage}"`
      )
      const androidChangedKts = await _replaceByRegex(
        gradleKtsFile,
        /applicationId\s*=\s*['\"][^'\"]+['\"]/g,
        `applicationId = "${androidPackage}"`
      )
      await _replaceByRegex(
        gradleFile,
        /namespace\s+['\"][^'\"]+['\"]/g,
        `namespace "${androidPackage}"`
      )
      await _replaceByRegex(
        gradleKtsFile,
        /namespace\s*=\s*['\"][^'\"]+['\"]/g,
        `namespace = "${androidPackage}"`
      )
      if (androidChangedGroovy || androidChangedKts) {
        logs.push(`Android package set: ${androidPackage}`)
      }

      try {
        const androidSync = await _syncAndroidEntryPackage(dir, androidPackage)
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
      const iosChanged = await _replaceByRegex(
        iosPbxproj,
        /PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/g,
        `PRODUCT_BUNDLE_IDENTIFIER = ${iosPackage};`
      )
      const macChanged = await _replaceByRegex(
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

      const firebaseFiles =
        data?.firebaseFiles && typeof data.firebaseFiles === 'object' ? data.firebaseFiles : {}
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

      const flutterBin =
        `${data?.flutterBin ?? ''}`.trim() || (await this._resolveFlutterBin(setup))
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
          const iconRes = await execPromiseWithEnv(
            `"${flutterBin}" pub run flutter_launcher_icons`,
            {
              cwd: dir
            }
          )
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
          const outRes = await execPromiseWithEnv(`"${flutterBin}" pub outdated --json`, {
            cwd: dir
          })
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
  },

  flutterCreateProject(
    this: any,
    projectName: string,
    outputDir: string,
    template: 'app' | 'package' | 'plugin' | 'module' | 'skeleton',
    orgName: string,
    flutterBinOverride: string,
    setup?: any,
    extraConfig?: any
  ) {
    return new ForkPromise(async (resolve) => {
      const name = _sanitizeProjectName(projectName)
      if (!name) {
        resolve({ ok: false, message: 'Project name is required', output: '', projectPath: '' })
        return
      }

      const dir = `${outputDir ?? ''}`.trim()
      if (!dir || !existsSync(dir)) {
        resolve({
          ok: false,
          message: 'Output directory does not exist',
          output: '',
          projectPath: ''
        })
        return
      }

      const projectPath = join(dir, name)
      if (existsSync(projectPath)) {
        resolve({
          ok: false,
          message: `Directory already exists: ${projectPath}`,
          output: '',
          projectPath
        })
        return
      }

      const flutterBin =
        `${flutterBinOverride ?? ''}`.trim() || (await this._resolveFlutterBin(setup))
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

        resolve({
          ok: true,
          message: `Project "${name}" created successfully`,
          output: output.slice(-120000),
          projectPath
        })
      } catch (e: any) {
        const output = `${e?.stdout ?? ''}${e?.stderr ?? ''}`
        appDebugLog(
          '[flutter][createProject][error]',
          JSON.stringify({ error: e?.message })
        ).catch()
        resolve({
          ok: false,
          message: e?.message ?? 'flutter create failed',
          output: output.slice(-120000),
          projectPath
        })
      }
    })
  }
}
