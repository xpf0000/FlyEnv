import { appDebugLog, isWindows } from '@shared/utils'
import { shellEnv } from 'shell-env'

class EnvSync {
  AppEnv: Record<string, any> | undefined
  constructor() {}

  async sync() {
    if (this.AppEnv) {
      return this.AppEnv
    }
    if (isWindows()) {
      let path = `${process.env['PATH']};C:\\Program Files\\RedHat\\Podman;C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\;%SYSTEMROOT%\\System32\\WindowsPowerShell\\v1.0\\`
      path = Array.from(new Set(path.split(';')))
        .filter((s) => !!s)
        .join(';')
      const env: any = { ...process.env, PATH: path }
      if (global.Server.Proxy) {
        for (const k in global.Server.Proxy) {
          env[k] = global.Server.Proxy[k]
        }
      }
      this.AppEnv = env
      return this.AppEnv
    }

    this.AppEnv = await shellEnv()
    const PATH = `${this.AppEnv!['PATH']}:/opt/podman/bin:/home/linuxbrew/.linuxbrew/bin:$HOME/.linuxbrew/bin:/opt:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/Homebrew/bin:/opt/local/bin:/opt/local/sbin:/usr/local/bin:/usr/bin:/usr/sbin`
    this.AppEnv!['PATH'] = Array.from(new Set(PATH.split(':'))).join(':')
    if (global.Server.Proxy) {
      for (const k in global.Server.Proxy) {
        this.AppEnv![k] = global.Server.Proxy[k]
      }
    }
    appDebugLog('[EnvSync][sync]', `${JSON.stringify(this.AppEnv, null, 2)}`).catch()
    return this.AppEnv!
  }
}

export default new EnvSync()
