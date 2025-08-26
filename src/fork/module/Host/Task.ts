import type { AppHost, SoftInstalled } from '@shared/app'
import { ForkPromise } from '@shared/ForkPromise'
import { join } from 'path'
import { existsSync, readdirSync } from 'fs'
import { setDirRole } from './Host'
import { I18nT } from '@lang/index'
import compressing from 'compressing'
import {
  downloadFile,
  execPromise,
  waitTime,
  copyFile,
  mkdirp,
  readdir,
  remove,
  writeFile,
  moveDirToDir,
  readFile
} from '../../Fn'
import { fetchHostList } from './HostFile'
import { isWindows } from '@shared/utils'

export function TaskAddRandomSite(this: any, version?: SoftInstalled, write = true, ipv6 = true) {
  return new ForkPromise(async (resolve, reject) => {
    const baseName = join(global.Server.BaseDir!, 'www')
    let host = `test.com`
    let i = 0
    let dir = `${baseName}/${host}`
    while (existsSync(dir)) {
      i += 1
      host = `test${i}.com`
      dir = `${baseName}/${host}`
    }
    await mkdirp(dir)
    const hostItem: any = {
      id: new Date().getTime(),
      name: host,
      alias: '',
      useSSL: false,
      ssl: {
        cert: '',
        key: ''
      },
      port: {
        nginx: 80,
        apache: 80,
        caddy: 80,
        nginx_ssl: 443,
        apache_ssl: 443,
        caddy_ssl: 443
      },
      nginx: {
        rewrite: ''
      },
      url: '',
      root: dir,
      mark: 'FlyEnv AI Created',
      phpVersion: undefined
    }
    if (version?.num) {
      hostItem.phpVersion = version.num
    }
    try {
      await this.handleHost(hostItem, 'add')
      await this.writeHosts(write, ipv6)
      if (version?.num) {
        const file = join(dir, 'index.php')
        await writeFile(
          file,
          `<?php
        phpinfo();
        `
        )
      } else {
        const file = join(dir, 'index.html')
        await writeFile(
          file,
          `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FlyEnv AI Created</title>
  </head>
  <body>
    FlyEnv AI Created
  </body>
</html>
`
        )
      }
      await setDirRole(dir)
      resolve({
        host,
        dir,
        version
      })
    } catch (e) {
      reject(e)
    }
  })
}

export function TaskAddPhpMyAdminSite(this: any, phpVersion?: number, write = true, ipv6 = true) {
  return new ForkPromise(async (resolve, reject, on) => {
    const zipFile = join(global.Server.Cache!, 'phpMyAdmin.zip')
    const siteDir = join(global.Server.BaseDir!, 'www/phpMyAdmin')
    let hostList: Array<AppHost> = []
    try {
      hostList = await fetchHostList()
    } catch {}
    hostList = hostList.filter((h) => !h.type || h.type === 'php')
    const find = hostList.find((h) => h.name === 'phpmyadmin.test')
    if (find) {
      resolve(true)
      return
    }

    const doMake = async () => {
      if (!existsSync(siteDir) || readdirSync(siteDir).length === 0) {
        if (!existsSync(zipFile)) {
          reject(new Error(I18nT('fork.downloadFileFail')))
          return
        }
        if (existsSync(siteDir)) {
          await remove(siteDir)
        }
        await mkdirp(siteDir)
        const tmplDir = join(global.Server.Cache!, 'phpMyAdmin-tmpl')
        try {
          await compressing.zip.uncompress(zipFile, tmplDir)
          const subDirs = await readdir(tmplDir, { withFileTypes: true })
          const subDir = subDirs.filter((f) => f.isDirectory()).pop()
          if (subDir) {
            if (isWindows()) {
              await moveDirToDir(join(tmplDir, subDir.name), siteDir)
            } else {
              await execPromise(`cd ${join(tmplDir, subDir.name)} && mv ./* ${siteDir}/`)
            }
            await waitTime(300)
            await remove(tmplDir)
          }
        } catch (e) {
          reject(e)
          return
        }
        if (readdirSync(siteDir).length === 0) {
          reject(new Error(I18nT('fork.downloadFileFail')))
          return
        }

        if (isWindows()) {
          const ini = join(siteDir, 'config.sample.inc.php')
          if (existsSync(ini)) {
            let content = await readFile(ini, 'utf-8')
            content = content.replace(
              `$cfg['Servers'][$i]['host'] = 'localhost';`,
              `$cfg['Servers'][$i]['host'] = '127.0.0.1';\n$cfg['VersionCheck'] = false;`
            )
            const cpFile = join(siteDir, 'config.inc.php')
            await writeFile(cpFile, content)
          }
        }
      }

      let useSSL = false
      let autoSSL = false
      const CARoot = join(global.Server.BaseDir!, 'CA/FlyEnv-Root-CA.crt')
      if (existsSync(CARoot)) {
        useSSL = true
        autoSSL = true
      }

      const hostItem: any = {
        id: new Date().getTime(),
        isAppPHPMyAdmin: true,
        name: 'phpmyadmin.test',
        alias: '',
        useSSL: useSSL,
        autoSSL: autoSSL,
        ssl: {
          cert: '',
          key: ''
        },
        port: {
          nginx: 80,
          apache: 80,
          caddy: 80,
          nginx_ssl: 443,
          apache_ssl: 443,
          caddy_ssl: 443
        },
        nginx: {
          rewrite: ''
        },
        url: '',
        root: siteDir,
        mark: 'PhpMyAdmin (FlyEnv Auto Created)',
        phpVersion: undefined
      }
      if (phpVersion) {
        hostItem.phpVersion = phpVersion
      }
      try {
        await this.handleHost(hostItem, 'add')
        await this.writeHosts(write, ipv6)
        await setDirRole(siteDir)
        console.log('TaskAddPhpMyAdminSite end !!!')
        resolve(true)
      } catch (e) {
        console.log('TaskAddPhpMyAdminSite error: ', e)
        reject(e)
      }
    }

    if (existsSync(zipFile)) {
      on(100)
      doMake().then()
      return
    }

    const zipTmpFile = join(global.Server.Cache!, 'phpMyAdmin-Cache')
    if (existsSync(zipTmpFile)) {
      await remove(zipTmpFile)
    }
    const url = 'https://www.phpmyadmin.net/downloads/phpMyAdmin-latest-all-languages.zip'
    downloadFile(url, zipTmpFile)
      .on(on)
      .then(async () => {
        return copyFile(zipTmpFile, zipFile)
      })
      .then(() => {
        if (existsSync(zipFile)) {
          doMake().then()
          return
        } else {
          reject(new Error(I18nT('fork.downloadFileFail')))
        }
      })
      .catch(reject)
  })
}
