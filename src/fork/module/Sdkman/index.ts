import { join } from 'path'
import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, versionFixed } from '../../Fn'
import { compareVersions } from '@shared/compare-versions'

class Sdkman extends Base {
  constructor() {
    super()
  }

  /**
   * Parse SDKMAN `sdk list java` output (table format with Vendor/Version/Dist/Status/Identifier)
   */
  async sdkmanJavaSearch(initPrefix: string) {
    try {
      const command = `bash -c '${initPrefix} && sdk list java 2>/dev/null'`
      const res = await execPromiseWithEnv(command)
      const stdout = res.stdout
      const lines = stdout.split('\n')
      const items: any[] = []
      let currentVendor = ''

      for (const line of lines) {
        // Match data lines: " Vendor    |     | Version  | Dist  | Status  | Identifier"
        // or continuation:  "           |     | Version  | Dist  | Status  | Identifier"
        const match = line.match(
          /^\s(.{14})\|\s{0,3}(.{3,5})\|\s(.{12,14})\|\s(\S+)\s+\|\s*(.*?)\s*\|\s*(\S+)\s*$/
        )
        if (!match) continue

        const vendor = match[1].trim()
        const version = match[3].trim()
        const status = match[5].trim()
        const identifier = match[6].trim()

        if (!version || !identifier) continue

        if (vendor) {
          currentVendor = vendor
        }

        items.push({
          name: identifier,
          version: version,
          installed:
            status.toLowerCase().includes('installed') || status.toLowerCase().includes('local'),
          flag: 'sdkman',
          vendor: currentVendor,
          identifier: identifier
        })
      }

      return items
    } catch (e) {
      console.log('sdkmanJavaSearch err: ', e)
    }
    return []
  }

  /**
   * Parse SDKMAN `sdk list maven` output (simple version list with * and > markers)
   */
  async sdkmanOtherSearch(initPrefix: string, flag: 'maven' | 'gradle') {
    try {
      const command = `bash -c '${initPrefix} && sdk list ${flag} 2>/dev/null'`
      const res = await execPromiseWithEnv(command)
      const stdout = res.stdout
      const lines = stdout.split('\n')
      const items: any[] = []

      for (const line of lines) {
        // Skip header/footer/separator lines
        if (
          line.includes('===') ||
          line.includes('---') ||
          line.includes('local version') ||
          !line.trim()
        ) {
          continue
        }
        // Extract version strings from the line
        // Format: "     4.0.0-rc-5          3.9.1               3.5.4"
        // or:     " > * 3.9.14              3.8.9               3.5.3"
        const tokens = line
          .replace(/[>*]/g, ' ')
          .trim()
          .split(/\s+/)
          .filter((t: string) => t.length > 0)
        for (const token of tokens) {
          // Valid version tokens contain digits and dots
          if (/^\d/.test(token)) {
            const installed = line.includes(`* ${token}`) || line.includes(`*${token}`)
            items.push({
              name: `${flag}-${token}`,
              version: token,
              installed: installed,
              flag: 'sdkman',
              identifier: token
            })
          }
        }
      }

      items.sort((a, b) => compareVersions(versionFixed(b.version), versionFixed(a.version)))
      return items
    } catch (e) {
      console.log('sdkmanMavenSearch err: ', e)
    }
    return []
  }

  /**
   * Get SDKMAN init command prefix
   * All sdk commands require sourcing sdkman-init.sh first
   */
  private _initPrefix(): string {
    const sdkmanHome = global.Server.SdkmanHome ?? join(global.Server.UserHome!, '.sdkman')
    return `source "${join(sdkmanHome, 'bin/sdkman-init.sh')}"`
  }

  sdkmaninfo(flag: 'java' | 'maven' | 'gradle') {
    return new ForkPromise(async (resolve) => {
      if (flag === 'java') {
        const list = await this.sdkmanJavaSearch(this._initPrefix())
        return resolve(list)
      }
      const list = await this.sdkmanOtherSearch(this._initPrefix(), flag)
      return resolve(list)
    })
  }
}

export default new Sdkman()
