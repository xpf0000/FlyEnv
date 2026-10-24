import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import axios from 'axios'
import type { SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { findPeclArchive, installPeclArchive } from './PeclWindows'

export type ExtensionPackage = { name: string; description: string }
export type PhpExtensionProfile = {
  bin: string
  ini: string
  version: string
  architecture: string
  threadSafety: string
  build: string
  extensionDir: string
  loaded: string[]
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

export function validateExtensionPackage(name: string): string {
  if (!/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/.test(name)) {
    throw new Error('Choose a valid vendor/package extension from the catalog')
  }
  return name
}

export function phpExtensionTarget(version: SoftInstalled) {
  const bin = resolve(version.phpBin || join(version.path, 'php.exe'))
  return { bin, ini: join(dirname(bin), 'php.ini') }
}

export function pieInstallArguments(bin: string, name: string): string[] {
  return [
    '--no-interaction',
    '--no-ansi',
    'install',
    `--with-php-path=${bin}`,
    validateExtensionPackage(name)
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
  if (resolve(data.ini).toLowerCase() !== target.ini.toLowerCase()) {
    throw new Error('The selected PHP loaded a different php.ini; installation was not started')
  }
  return {
    ...target,
    version: data.version,
    architecture: field('Architecture'),
    threadSafety: field('Thread Safety'),
    build,
    extensionDir: isAbsolute(data.dir) ? data.dir : resolve(dirname(target.bin), data.dir),
    loaded: data.loaded
  }
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
    return new Promise<string>((resolveResult, reject) => {
      const child = spawn(bin, args, {
        cwd,
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          PHPRC: ini,
          PHP_INI_SCAN_DIR: '',
          PATH: `${cwd};${process.env.PATH ?? ''}`
        }
      })
      this.children.add(child)
      let output = ''
      const append = (data: Buffer) => {
        const text = data.toString()
        output = (output + text).slice(-64000)
        progress?.(text)
      }
      child.stdout.on('data', append)
      child.stderr.on('data', append)
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
        if (code === 0) resolveResult(output)
        else
          reject(
            new Error(
              progress
                ? `Extension installation failed (exit code ${code}). See the installer output for details.`
                : output.trim() || `PHP extension command exited with code ${code}`
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
    const info = await this.run(target.bin, [...args, '-i'], dirname(target.bin), target.ini)
    const script = `echo 'FLYENV_EXT_PROFILE='.json_encode(['version'=>PHP_VERSION,'ini'=>php_ini_loaded_file(),'dir'=>ini_get('extension_dir'),'loaded'=>get_loaded_extensions()]);`
    const data = await this.run(
      target.bin,
      [...args, '-r', script],
      dirname(target.bin),
      target.ini
    )
    return parsePhpExtensionProfile(info + '\n' + data, target)
  }

  catalog(version: SoftInstalled, query: string) {
    return new ForkPromise<ExtensionCatalog>(async (done) => {
      const profile = await this.profile(version)
      const results = await Promise.allSettled(
        ['php-ext', 'php-ext-zend'].map(async (type) => {
          const response = await axios.get('https://packagist.org/search.json', {
            params: { type, q: query.slice(0, 100), per_page: 30 },
            timeout: 30000
          })
          return (response.data.results ?? []) as ExtensionPackage[]
        })
      )
      const successful = results.filter((result) => result.status === 'fulfilled')
      if (!successful.length) throw new Error('Could not search the PHP extension catalog')
      const packages = new Map<string, ExtensionPackage>()
      for (const result of results) {
        if (result.status !== 'fulfilled') continue
        for (const item of result.value) {
          if (!/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/.test(item.name)) continue
          packages.set(item.name, { name: item.name, description: item.description })
        }
      }
      done({
        profile,
        packages: [...packages.values()],
        partial: successful.length < results.length
      })
    })
  }

  private async pie(progress: (text: string) => void): Promise<string> {
    if (process.arch !== 'x64')
      throw new Error('The official standalone PIE download requires x64 Windows')
    const response = await axios.get('https://api.github.com/repos/php/pie/releases/latest', {
      timeout: 30000
    })
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
    const download = await axios.get(asset.browser_download_url, {
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

  install(version: SoftInstalled, name: string) {
    return new ForkPromise<ExtensionInstallResult>(async (done, _reject, progress) => {
      if (this.installing) throw new Error('A PHP extension installation is already running')
      validateExtensionPackage(name)
      this.installing = true
      let backup = ''
      let started = false
      try {
        const profile = await this.profile(version)
        const metadata = await axios.get(`https://repo.packagist.org/p2/${name}.json`, {
          timeout: 30000
        })
        const releases = metadata.data.packages?.[name] ?? []
        const release = releases.find((item: { type?: string }) =>
          ['php-ext', 'php-ext-zend'].includes(item.type ?? '')
        )
        if (!release) throw new Error('This package is not a PHP extension')
        const extension = release['php-ext']?.['extension-name'] ?? name.split('/')[1]
        const operationDir = join(global.Server.Cache!, 'php-extensions', `install-${Date.now()}`)
        let archive: string | undefined
        try {
          archive = await findPeclArchive(extension, profile)
        } catch {
          // Discovery has no side effects; PIE is an independent package source.
          progress(
            'The official Windows archive could not be queried. Checking the package publisher with PIE.\n'
          )
        }
        if (archive) {
          const installed = await installPeclArchive({
            url: archive,
            extension,
            zend: release.type === 'php-ext-zend',
            profile,
            directory: operationDir,
            progress,
            verify: () => this.profile(version)
          })
          done({ ...installed, package: name, verified: true, warning: '' })
          return
        }
        const pie = await this.pie(progress)
        await mkdir(operationDir, { recursive: true })
        backup = join(operationDir, 'php.ini.before')
        await copyFile(profile.ini, backup)
        progress(
          `PHP ${profile.version} | ${profile.build} | ${profile.architecture}\n${profile.bin}\n`
        )
        started = true
        await this.run(
          pie,
          pieInstallArguments(profile.bin, name),
          dirname(profile.bin),
          profile.ini,
          progress
        )
        let verified = false
        let warning = ''
        try {
          const updated = await this.profile(version)
          verified = updated.loaded.some((item) => item.toLowerCase() === extension.toLowerCase())
          if (!verified)
            warning =
              'The extension was installed but is not loaded. Check php.ini and the installer output.'
          done({ profile: updated, package: name, verified, warning, backup })
        } catch {
          done({
            profile,
            package: name,
            verified: false,
            warning:
              'Installation completed, but PHP validation failed. Check the installer output before retrying.',
            backup
          })
        }
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
}

export default new WindowsExtensionInstaller()
