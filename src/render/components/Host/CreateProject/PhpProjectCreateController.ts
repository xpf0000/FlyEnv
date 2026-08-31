import { markRaw } from 'vue'
import { I18nT } from '@lang/index'
import { MessageError } from '@/util/Element'
import { reactiveBind } from '@/util/Index'
import IPC from '@/util/IPC'
import { fs } from '@/util/NodeFn'
import { dirname, join } from '@/util/path-browserify'
import XTerm from '@/util/XTerm'

export type PhpProjectCreateRequest = {
  dir: string
  php: string
  composer: string
  version: string | undefined
  package: string
  framework: string
  isWordPress: boolean
  proxy: Record<string, string>
  isWindows: boolean
}

const wordpressComposerJson = (version: string | undefined) => `{
  "require": {
    "johnpbloch/wordpress": "${version}"
  },
  "config": {
    "allow-plugins": {
      "johnpbloch/wordpress-core-installer": true
    }
  }
}
`

export class PhpProjectCreateController {
  running = false
  created = false
  failed = false
  error = ''

  private terminal: XTerm | undefined
  private inFlight: Promise<void> | undefined
  private cancelled = false

  start(request: PhpProjectCreateRequest, terminalDom: HTMLElement): Promise<void> {
    if (this.inFlight) {
      return this.inFlight
    }

    this.terminal?.destroy()
    this.terminal = markRaw(new XTerm())
    this.running = true
    this.created = false
    this.failed = false
    this.error = ''
    this.cancelled = false
    this.inFlight = this.run(request, terminalDom, this.terminal)
    return this.inFlight
  }

  async stop(): Promise<void> {
    if (!this.inFlight) {
      return
    }

    this.cancelled = true
    await this.terminal?.stop()
    await this.inFlight
  }

  async attach(terminalDom: HTMLElement): Promise<void> {
    if (!this.terminal || this.terminal.dom === terminalDom) {
      return
    }

    this.terminal.unmounted()
    await this.terminal.mount(terminalDom)
  }

  detach(): void {
    this.terminal?.unmounted()
  }

  reset(): void {
    if (this.inFlight) {
      return
    }

    this.terminal?.destroy()
    this.terminal = undefined
    this.created = false
    this.failed = false
    this.error = ''
    this.cancelled = false
  }

  private async run(
    request: PhpProjectCreateRequest,
    terminalDom: HTMLElement,
    terminal: XTerm
  ): Promise<void> {
    try {
      const commands = await this.buildCommands(request)
      await terminal.mount(terminalDom)
      await terminal.send(commands, false)
      if (this.cancelled) {
        return
      }

      if (request.isWordPress) {
        this.created = true
      } else {
        await this.moveProjectDirectory(request)
        this.created = true
      }
    } catch (error) {
      if (!this.cancelled) {
        this.failed = true
        this.error = error instanceof Error ? error.message : `${error}`
        MessageError(this.error || I18nT('base.fail'))
      }
    } finally {
      this.running = false
      this.inFlight = undefined
    }
  }

  private async buildCommands(request: PhpProjectCreateRequest): Promise<string[]> {
    const commands: string[] = []
    for (const [key, value] of Object.entries(request.proxy)) {
      if (request.isWindows) {
        commands.push(`$env:${key}="${value}"`)
      } else {
        commands.push(`export ${key}="${value}"`)
      }
    }
    commands.push(`cd "${request.dir}"`)

    if (request.isWordPress) {
      await fs.writeFile(join(request.dir, 'composer.json'), wordpressComposerJson(request.version))
      this.addWordPressCommands(commands, request)
    } else {
      this.addCreateProjectCommands(commands, request)
    }

    return commands
  }

  private addWordPressCommands(commands: string[], request: PhpProjectCreateRequest): void {
    if (request.isWindows) {
      if (request.php && request.composer) {
        commands.push(`$env:PATH = "${dirname(request.php)};" + $env:PATH`)
        commands.push(`php "${request.composer}" update`)
      } else if (request.php) {
        commands.push(`$env:PATH = "${dirname(request.php)};" + $env:PATH`)
        commands.push('composer update')
      } else if (request.composer) {
        commands.push(`php "${request.composer}" update`)
      } else {
        commands.push('composer update')
      }
      return
    }

    if (request.php && request.composer) {
      commands.push(`export PATH="${request.php}:$PATH"`)
      commands.push(`"${request.php}" "${request.composer}" self-update`)
      commands.push(`"${request.php}" "${request.composer}" update`)
    } else if (request.php) {
      commands.push(`export PATH="${request.php}:$PATH"`)
      commands.push('composer self-update')
      commands.push('composer update')
    } else if (request.composer) {
      commands.push(`php "${request.composer}" self-update`)
      commands.push(`php "${request.composer}" update`)
    } else {
      commands.push('composer self-update')
      commands.push('composer update')
    }
  }

  private addCreateProjectCommands(commands: string[], request: PhpProjectCreateRequest): void {
    const command = `create-project --prefer-dist "${request.package}" "flyenv-create-project" "${request.version}"`

    if (request.isWindows) {
      if (request.php && request.composer) {
        commands.push(`$env:PATH = "${dirname(request.php)};" + $env:PATH`)
        commands.push(`php "${request.composer}" ${command}`)
      } else if (request.php) {
        commands.push(`$env:PATH = "${dirname(request.php)};" + $env:PATH`)
        commands.push(`composer ${command}`)
      } else if (request.composer) {
        commands.push(`php "${request.composer}" ${command}`)
      } else {
        commands.push(`composer ${command}`)
      }
      return
    }

    if (request.php && request.composer) {
      commands.push(`export PATH="${request.php}:$PATH"`)
      commands.push(`"${request.php}" "${request.composer}" self-update`)
      commands.push(`"${request.php}" "${request.composer}" ${command}`)
    } else if (request.php) {
      commands.push(`export PATH="${request.php}:$PATH"`)
      commands.push('composer self-update')
      commands.push(`composer ${command}`)
    } else if (request.composer) {
      commands.push(`php "${request.composer}" self-update`)
      commands.push(`php "${request.composer}" ${command}`)
    } else {
      commands.push('composer self-update')
      commands.push(`composer ${command}`)
    }
  }

  private moveProjectDirectory(request: PhpProjectCreateRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      IPC.send('app-fork:project', 'handleProjectDir', request.dir, request.framework).then(
        (key: string, response: any) => {
          if (response?.code === 200) {
            return
          }

          IPC.off(key)
          if (response?.code === 0) {
            resolve()
          } else {
            reject(new Error(response?.msg ?? I18nT('base.fail')))
          }
        }
      )
    })
  }
}

export default reactiveBind(new PhpProjectCreateController())
