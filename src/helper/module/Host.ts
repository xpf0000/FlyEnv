import { BaseManager } from './Base'
import { execPromise, isLinux, isMacOS } from '../util'
import { join } from 'node:path'

class Manager extends BaseManager {
  async sslAddTrustedCert(cwd: string, caName: string): Promise<boolean> {
    if (isMacOS()) {
      await execPromise(
        `security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" "${caName}"`,
        {
          cwd
        }
      )
    } else if (isLinux()) {
      const caFile = join(cwd, caName)
      // 检查常见的 CA 信任目录
      const debianUbuntuPath = `/usr/local/share/ca-certificates/${caName}`
      const centosFedoraPath = `/etc/pki/ca-trust/source/anchors/${caName}`

      let error = false
      try {
        // 尝试复制到 Debian/Ubuntu 风格的路径
        await execPromise(`sudo cp "${caFile}" "${debianUbuntuPath}"`)
        // 更新证书
        await execPromise('sudo update-ca-certificates')
      } catch {
        error = true
      }
      if (error) {
        try {
          await execPromise(`sudo cp "${caFile}" "${centosFedoraPath}"`)
          // 更新证书
          await execPromise('sudo update-ca-trust extract')
        } catch {}
      }
    }
    return true
  }

  async sslFindCertificate(
    cwd: string,
    commonName: string = 'FlyEnv-Root-CA'
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      if (isMacOS()) {
        const res = await execPromise(`security find-certificate -c "${commonName}"`, {
          cwd
        })
        return {
          stdout: res.stdout,
          stderr: res.stderr
        }
      } else if (isLinux()) {
        // Linux 查找证书比较复杂，通常需要遍历目录和解析证书文件
        // 这是一个非常简化的实现，它会检查常见的CA目录中是否存在文件，
        // 并尝试使用 openssl x509 -text 来查找 Common Name
        const commonCaPaths = [
          '/etc/ssl/certs/',
          '/usr/local/share/ca-certificates/',
          '/etc/pki/ca-trust/extracted/pem/', // CentOS/RHEL/Fedora 提取的路径
          '/etc/pki/tls/certs/'
        ]

        let foundCertPath = ''

        for (const dir of commonCaPaths) {
          try {
            // 尝试列出目录中的所有 .crt 文件
            const { stdout: files } = await execPromise(
              `find "${dir}" -name "*.crt" -print 2>/dev/null`
            )
            const certFiles = files
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => !!s)

            for (const filePath of certFiles) {
              try {
                // 使用 openssl 检查证书的 Common Name
                const { stdout: certInfo } = await execPromise(
                  `openssl x509 -in "${filePath}" -text -noout`
                )
                if (certInfo.includes(`CN = ${commonName}`)) {
                  foundCertPath = filePath
                  break // 找到后跳出内层循环
                }
              } catch {}
            }
            if (foundCertPath) break // 找到后跳出外层循环
          } catch {}
        }

        if (foundCertPath) {
          return {
            stdout: `Found certificate: ${foundCertPath}\n`,
            stderr: ''
          }
        } else {
          return {
            stdout: '',
            stderr: `Certificate with CN "${commonName}" not found on Linux.`
          }
        }
      }
      return { stdout: '', stderr: '' } // 如果不是 macOS 或 Linux，返回空
    } catch (e: any) {
      return { stdout: '', stderr: `${e}` }
    }
  }

  /**
   * 刷新系统 DNS 缓存。
   * 注意：Linux 上 DNS 刷新方法因使用的 DNS 解析器而异。
   * @returns Promise<boolean> 操作成功返回 true。
   */
  async dnsRefresh(): Promise<boolean> {
    try {
      if (isMacOS()) {
        try {
          await execPromise(`dscacheutil -flushcache`)
        } catch (e) {
          console.warn(`Error flushing dscacheutil: ${e}`)
        }
        try {
          await execPromise(`killall -HUP mDNSResponder`)
        } catch (e) {
          console.warn(`Error killing mDNSResponder: ${e}`)
        }
      } else if (isLinux()) {
        // 尝试常见的 Linux DNS 刷新方法
        // 1. systemd-resolved (新版系统，如 Ubuntu 18.04+, Fedora, CentOS 7+)
        try {
          await execPromise(`sudo systemctl restart systemd-resolved.service`)
          console.log('systemd-resolved restarted.')
          return true // 如果成功，直接返回
        } catch (e) {
          console.warn(`systemd-resolved not found or restart failed: ${e}`)
        }

        // 2. nscd (Name Service Cache Daemon)
        try {
          await execPromise(`sudo systemctl restart nscd.service`)
          console.log('nscd restarted.')
          return true // 如果成功，直接返回
        } catch (e) {
          console.warn(`nscd not found or restart failed: ${e}`)
        }

        // 3. dnsmasq (如果作为本地 DNS 缓存服务)
        try {
          await execPromise(`sudo systemctl restart dnsmasq.service`)
          console.log('dnsmasq restarted.')
          return true // 如果成功，直接返回
        } catch (e) {
          console.warn(`dnsmasq not found or restart failed: ${e}`)
        }

        // 如果以上都没有成功，可能没有特定的 DNS 缓存服务或需要手动清除
        console.warn(
          'Could not determine or refresh system DNS cache on Linux. Manual intervention might be needed.'
        )
      }
    } catch {}
    return true
  }
}

export default new Manager()
