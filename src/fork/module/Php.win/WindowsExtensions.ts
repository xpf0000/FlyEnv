import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, win32 } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { installPeclArchive } from './PeclWindows'
import { extensionHttpGet, packageExtensionName, peclPublisherExtension } from './ExtensionHttp'
import peclRepository from './PeclRepository'
import { stableExtensionVersion } from './ExtensionSources'
import type { ExtensionPreparation } from './ExtensionSources'
import {
  configuredExtensions,
  extensionIsLoaded,
  extensionName,
  updateExtensionIni
} from './ExtensionConfig'
import { replaceIniIfUnchanged, withPhpIniMutation } from './IniMutation'

export type ExtensionPackage = {
  name: string
  description: string
  extension?: string
  source?: 'pecl' | 'pie'
}
export type PhpExtensionProfile = {
  bin: string
  ini: string
  version: string
  architecture: string
  threadSafety: string
  build: string
  extensionDir: string
  loaded: string[]
  loadWarnings?: string
  configured?: ReturnType<typeof configuredExtensions>
}
export type ExtensionCatalog = {
  profile: PhpExtensionProfile
  packages: ExtensionPackage[]
  partial: boolean
}
export type ExtensionInstallResult = {
  profile: PhpExtensionProfile
  package: string
  verified: boolean
  warning: string
  backup: string
}

type PieRelease = {
  version: string
  type: string
  'php-ext'?: { 'extension-name'?: string }
}

const powershellCommand = (bin: string, args: string[]) =>
  '& ' + [bin, ...args].map((argument) => `'${argument.replaceAll("'", "''")}'`).join(' ')

export function validateExtensionPackage(name: string): string {
  if (!/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/.test(name)) {
    throw new Error('Choose a valid vendor/package extension from the catalog')
  }
  return name
}

export function phpExtensionTarget(version: SoftInstalled) {
  const bin = win32.resolve(version.phpBin || win32.join(version.path, 'php.exe'))
  return { bin, ini: win32.join(win32.dirname(bin), 'php.ini') }
}

export function pieInstallArguments(bin: string, name: string, version?: string): string[] {
  if (version && !stableExtensionVersion(version)) throw new Error('Invalid extension release')
  return [
    '--no-interaction',
    '--no-ansi',
    'install',
    `--with-php-path=${bin}`,
    validateExtensionPackage(name) + (version ? `:${version}` : '')
  ]
}

export function parsePhpExtensionProfile(
  info: string,
  target: { bin: string; ini: string }
): PhpExtensionProfile {
  const field = (name: string) =>
    info.match(new RegExp(`^${name} => (.+)$`, 'm'))?.[1]?.trim() ?? ''
  const marker = info.match(/FLYENV_EXT_PROFILE=(\{[^\r\n]+\})/)
  if (!marker) throw new Error('Could not read the selected PHP build')
  const data = JSON.parse(marker[1])
  const build = field('PHP Extension Build')
  if (!data.version || !build || !field('Architecture') || !data.ini) {
    throw new Error('The selected PHP must have a readable php.ini and build information')
  }
  if (win32.resolve(data.ini).toLowerCase() !== win32.resolve(target.ini).toLowerCase()) {
    throw new Error('The selected PHP loaded a different php.ini; installation was not started')
  }
  return {
    ...target,
    version: data.version,
    architecture: field('Architecture'),
    threadSafety: field('Thread Safety'),
    build,
    extensionDir: win32.resolve(win32.dirname(target.bin), data.dir),
    loaded: data.loaded
  }
}

export function phpExtensionProfileScript() {
  // INFO_GENERAL contains build metadata without dumping extensions or environment variables.
  return `ob_start();phpinfo(INFO_GENERAL);$info=ob_get_clean();echo $info,"\\nFLYENV_EXT_PROFILE=",json_encode(['version'=>PHP_VERSION,'ini'=>php_ini_loaded_file(),'dir'=>ini_get('extension_dir'),'loaded'=>array_values(array_unique(array_merge(get_loaded_extensions(),get_loaded_extensions(true))))]);`
}

export function verifyPieDownload(bytes: Buffer, digest: string) {
  if (
    !/^sha256:[a-f0-9]{64}$/.test(digest) ||
    `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== digest
  ) {
    throw new Error('PIE download checksum verification failed')
  }
}

export class WindowsExtensionInstaller {
  private readonly children = new Set<ChildProcess>()
  private installing = false

  constructor() {
    const cleanup = () => {
      for (const child of this.children) child.kill()
    }
    process.once('disconnect', cleanup)
    process.once('exit', cleanup)
  }

  private run(
    bin: string,
    args: string[],
    cwd: string,
    ini: string,
    progress?: (text: string) => void
  ) {
    return new Promise<{ stdout: string; stderr: string }>((resolveResult, reject) => {
      const child = spawn(bin, args, {
        cwd,
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          ...global.Server?.Proxy,
          PHPRC: ini,
          PHP_INI_SCAN_DIR: '',
          PATH: `${cwd};${process.env.PATH ?? ''}`
        }
      })
      this.children.add(child)
      let output = ''
      const stdoutDecoder = new StringDecoder('utf8')
      const stderrDecoder = new StringDecoder('utf8')
      let diagnostics = ''
      const append = (text: string, stdout: boolean) => {
        if (stdout) output = progress ? (output + text).slice(-64000) : output + text
        else diagnostics = progress ? (diagnostics + text).slice(-64000) : diagnostics + text
        progress?.(text)
      }
      child.stdout.on('data', (data: Buffer) => append(stdoutDecoder.write(data), true))
      child.stderr.on('data', (data: Buffer) => append(stderrDecoder.write(data), false))
      const timer = setTimeout(
        () => {
          child.kill()
          reject(new Error('PHP extension command timed out; inspect its output before retrying'))
        },
        progress ? 600000 : 30000
      )
      const cleanup = () => {
        clearTimeout(timer)
        this.children.delete(child)
      }
      child.once('error', (error) => {
        cleanup()
        reject(error)
      })
      child.once('close', (code) => {
        cleanup()
        append(stdoutDecoder.end(), true)
        append(stderrDecoder.end(), false)
        if (code === 0) resolveResult({ stdout: output, stderr: diagnostics })
        else
          reject(
            new Error(
              progress
                ? `Extension installation failed (exit code ${code}). See the installer output for details.`
                : diagnostics.trim() ||
                    output.trim() ||
                    `PHP extension command exited with code ${code}`
            )
          )
      })
    })
  }

  async profile(version: SoftInstalled): Promise<PhpExtensionProfile> {
    if (process.platform !== 'win32') throw new Error('This installer requires Windows')
    const target = phpExtensionTarget(version)
    if (!existsSync(target.bin) || !existsSync(target.ini)) {
      throw new Error('Open php.ini for this PHP version first, then try again')
    }
    const args = ['-c', target.ini]
    const data = await this.run(
      target.bin,
      [...args, '-r', phpExtensionProfileScript()],
      dirname(target.bin),
      target.ini
    )
    const profile = parsePhpExtensionProfile(data.stdout, target)
    profile.loadWarnings = data.stderr + '\n' + data.stdout
    profile.configured = configuredExtensions(await readFile(target.ini, 'utf8'), profile.loaded)
    return profile
  }

  catalog(version: SoftInstalled, query: string, refresh = false) {
    return new ForkPromise<ExtensionCatalog>(async (done) => {
      const profile = await this.profile(version)
      const results = await Promise.allSettled([
        ...['php-ext', 'php-ext-zend'].map(async (type) => {
          const response = await extensionHttpGet('https://packagist.org/search.json', {
            params: { type, q: query.slice(0, 100), per_page: 30 },
            timeout: 30000
          })
          return (response.data.results ?? []).map((item: ExtensionPackage) => ({
            ...item,
            source: 'pie'
          })) as ExtensionPackage[]
        }),
        peclRepository.catalog(query, refresh)
      ])
      const successful = results.filter((result) => result.status === 'fulfilled')
      if (!successful.length) throw new Error('Could not search the PHP extension catalog')
      const packages = new Map<string, ExtensionPackage>()
      for (const result of results) {
        if (result.status !== 'fulfilled') continue
        for (const item of result.value) {
          if (
            !/^pecl:[a-z][a-z0-9_]*$/.test(item.name) &&
            !/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/.test(item.name)
          )
            continue
          packages.set(item.name, {
            name: item.name,
            description: item.description,
            extension: item.extension ?? packageExtensionName(item.name),
            source: item.source
          })
        }
      }
      done({
        profile,
        packages: [...packages.values()].filter((item) => {
          const known = peclPublisherExtension(item.name)
          return !known || !packages.has(`pecl:${known}`)
        }),
        partial: successful.length < results.length
      })
    })
  }

  private async pieReleases(name: string): Promise<PieRelease[]> {
    validateExtensionPackage(name)
    const metadata = await extensionHttpGet(`https://repo.packagist.org/p2/${name}.json`, {
      timeout: 30000,
      maxContentLength: 4_000_000
    })
    // Packagist's minified p2 records inherit omitted fields from the previous release.
    let inherited: Partial<PieRelease> = {}
    return (metadata.data.packages?.[name] ?? [])
      .map((item: Partial<PieRelease>) => {
        inherited = { ...inherited, ...item }
        return inherited as PieRelease
      })
      .filter(
        (item: PieRelease) =>
          ['php-ext', 'php-ext-zend'].includes(item.type) && stableExtensionVersion(item.version)
      )
  }

  prepare(version: SoftInstalled, name: string, selected?: string) {
    return new ForkPromise<ExtensionPreparation>(async (done) => {
      const profile = await this.profile(version)
      if (name.startsWith('pecl:')) {
        done(await peclRepository.prepare(name, profile, selected))
        return
      }
      const releases = await this.pieReleases(name)
      if (!releases.length) throw new Error('No stable PHP extension releases were found')
      if (selected && !releases.some((item) => item.version === selected))
        throw new Error('The selected extension release is unavailable')
      done({
        name,
        source: 'pie',
        homepage: `https://packagist.org/packages/${name}`,
        profile,
        releases: releases.map((item) => ({ version: item.version, compatible: null })),
        command: powershellCommand(
          'pie.exe',
          pieInstallArguments(profile.bin, name, selected ?? releases[0].version)
        )
      })
    })
  }

  private async pie(progress: (text: string) => void): Promise<string> {
    if (process.arch !== 'x64')
      throw new Error('The official standalone PIE download requires x64 Windows')
    const response = await extensionHttpGet(
      'https://api.github.com/repos/php/pie/releases/latest',
      {
        timeout: 30000
      }
    )
    const asset = response.data.assets?.find(
      (item: { name: string }) => item.name === 'pie-Windows-X64.exe'
    )
    if (
      !asset ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? '') ||
      !/^https:\/\/github\.com\/php\/pie\/releases\/download\/[^/]+\/pie-Windows-X64\.exe$/.test(
        asset.browser_download_url
      )
    ) {
      throw new Error('The official PIE release does not provide a verifiable Windows installer')
    }
    const directory = join(global.Server.Cache!, 'php-extensions', asset.digest.slice(7))
    const binary = join(directory, 'pie.exe')
    if (existsSync(binary)) {
      const data = await readFile(binary)
      if (`sha256:${createHash('sha256').update(data).digest('hex')}` === asset.digest)
        return binary
    }
    progress('Downloading the official PHP extension installer...\n')
    const download = await extensionHttpGet(asset.browser_download_url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: 64000000
    })
    const bytes = Buffer.from(download.data)
    verifyPieDownload(bytes, asset.digest)
    await mkdir(directory, { recursive: true })
    await writeFile(binary, bytes)
    return binary
  }

  install(version: SoftInstalled, name: string, selected?: string) {
    return new ForkPromise<ExtensionInstallResult>(async (done, _reject, progress) => {
      if (this.installing) throw new Error('A PHP extension installation is already running')
      if (!name.startsWith('pecl:')) validateExtensionPackage(name)
      this.installing = true
      let backup = ''
      let started = false
      try {
        const result = await withPhpIniMutation(phpExtensionTarget(version).ini, async () => {
          const profile = await this.profile(version)
          const operationDir = join(global.Server.Cache!, 'php-extensions', `install-${Date.now()}`)
          const official = name.startsWith('pecl:')
            ? name
            : !selected && peclPublisherExtension(name)
              ? `pecl:${peclPublisherExtension(name)}`
              : undefined
          if (official) {
            const preparation = await peclRepository.prepare(official, profile, selected)
            const release = selected ?? preparation.releases[0]?.version
            if (!release) throw new Error(`No stable releases found. ${preparation.homepage}`)
            progress(
              `Source: PECL\n${preparation.homepage}\nPHP ${profile.version} | ${profile.build} | ${profile.architecture}\n${profile.bin}\nExtension: ${official} ${release}\n`
            )
            const archive = await peclRepository.resolve(official, profile, release)
            const installed = await installPeclArchive({
              ...archive,
              profile,
              directory: operationDir,
              progress,
              verify: () => this.profile(version)
            })
            return { ...installed, package: name, verified: true, warning: '' }
          }
          const releases = await this.pieReleases(name)
          const release = selected
            ? releases.find((item) => item.version === selected)
            : releases[0]
          if (!release) throw new Error('This package is not a PHP extension')
          const extension = extensionName(
            release['php-ext']?.['extension-name'] ?? packageExtensionName(name)
          )
          if (!/^[a-z][a-z0-9_]*$/.test(extension)) throw new Error('Invalid PHP extension name')
          const pie = await this.pie(progress)
          await mkdir(operationDir, { recursive: true })
          backup = join(operationDir, 'php.ini.before')
          await copyFile(profile.ini, backup)
          progress(
            `Source: PIE\nhttps://packagist.org/packages/${name}\nPHP ${profile.version} | ${profile.build} | ${profile.architecture}\n${profile.bin}\n${powershellCommand(pie, pieInstallArguments(profile.bin, name, release.version))}\n`
          )
          started = true
          await this.run(
            pie,
            pieInstallArguments(profile.bin, name, release.version),
            dirname(profile.bin),
            profile.ini,
            progress
          )
          let verified = false
          let warning = ''
          try {
            const dll = join(profile.extensionDir, `php_${extension}.dll`)
            if (!existsSync(dll)) throw new Error('The installed extension DLL was not found')
            const ini = await readFile(profile.ini)
            const directory = join(global.Server.PhpDir!, 'xdebug')
            if (extension === 'xdebug') await mkdir(directory, { recursive: true })
            const content = updateExtensionIni(
              ini.toString('utf8'),
              extension,
              true,
              release.type === 'php-ext-zend',
              dll,
              directory
            )
            await replaceIniIfUnchanged(profile.ini, ini, Buffer.from(content))
            const updated = await this.profile(version)
            verified = extensionIsLoaded(updated.loaded, extension, updated.loadWarnings)
            if (!verified)
              warning =
                'The extension was installed but is not loaded. Check its runtime dependencies and php.ini.' +
                (updated.loadWarnings ? `\n${updated.loadWarnings.slice(-4000)}` : '')
            return { profile: updated, package: name, verified, warning, backup }
          } catch (error) {
            return {
              profile,
              package: name,
              verified: false,
              warning:
                'Installation completed, but PHP validation failed. Check the installer output before retrying.\n' +
                (error instanceof Error ? error.message : String(error)),
              backup
            }
          }
        })
        done(result)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(
          started
            ? `${detail}\nThe installer may have changed files. php.ini backup: ${backup}`
            : detail
        )
      } finally {
        this.installing = false
      }
    })
  }

  disable(version: SoftInstalled, name: string) {
    return new ForkPromise<PhpExtensionProfile>(async (done) => {
      if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid PHP extension name')
      const profile = await withPhpIniMutation(phpExtensionTarget(version).ini, async () => {
        const target = await this.profile(version)
        const original = await readFile(target.ini)
        const updated = Buffer.from(updateExtensionIni(original.toString('utf8'), name, false))
        await replaceIniIfUnchanged(target.ini, original, updated)
        try {
          const result = await this.profile(version)
          if (result.loaded.some((item) => extensionName(item) === name))
            throw new Error('The extension is still loaded; php.ini was restored')
          return result
        } catch (error) {
          await replaceIniIfUnchanged(target.ini, updated, original)
          throw error
        }
      })
      done(profile)
    })
  }
}

export default new WindowsExtensionInstaller()
