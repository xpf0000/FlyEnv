import { join, dirname, basename, isAbsolute, win32 } from 'path'
import { createWriteStream, existsSync } from 'fs'
import { Base } from '../Base'
import { I18nT } from '@lang/runtime'
import type { OnlineVersionItem, SoftInstalled } from '@shared/app'
import {
  AppLog,
  execPromise,
  versionBinVersion,
  versionFilterSame,
  versionFixed,
  versionSort,
  writeFile,
  readFile,
  remove,
  mkdirp,
  copyFile,
  readdir,
  zipUnpack,
  versionLocalFetch
} from '../../Fn'
import { serviceStartSpawn } from '../../util/ServiceStart'
import { ForkPromise } from '@shared/ForkPromise'
import { isReadableServiceStopRoot, processSnapshotParentMatches } from '@shared/ProcessSnapshot'
import TaskQueue from '../../TaskQueue'
import axios from 'axios'
import { StopProcessListFetch } from '@shared/StopProcessList'
import { isCommandOnlyServiceStopResult } from '@shared/ServiceStop'
import { parse as iniParse } from 'ini'
import { IniParse } from '../../../render/util/IniParse'
import { ProcessListByExactPid } from '@shared/Process'
import type { PItem } from '@shared/Process'
import { FastCgiWorkerStore } from './FastCgiWorkers'
import { timeOperation, timeOperationSync } from '@shared/OperationTiming'
import {
  logServiceStop,
  serviceStopProcessRows,
  withServiceStopDiagnostics
} from '@shared/ServiceStopDiagnostics'

class Php extends Base {
  private workerStore?: FastCgiWorkerStore

  constructor() {
    super()
    this.type = 'php'
  }

  init() {
    this.pidPath = join(global.Server.PhpDir!, 'php.pid')
  }

  private fastCgiWorkerStore() {
    const filePath = join(global.Server.PhpDir!, 'fastcgi-workers.json')
    if (!this.workerStore || this.workerStore.filePath !== filePath) {
      this.workerStore = new FastCgiWorkerStore(filePath)
    }
    return this.workerStore
  }

  getFastCgiWorkerCount(version: SoftInstalled): ForkPromise<number> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        resolve(await this.fastCgiWorkerStore().get(version.path))
      } catch (error) {
        reject(error)
      }
    })
  }

  setFastCgiWorkerCount(version: SoftInstalled, count: number): ForkPromise<number> {
    return new ForkPromise(async (resolve, reject) => {
      try {
        resolve(await this.fastCgiWorkerStore().set(version.path, count))
      } catch (error) {
        reject(error)
      }
    })
  }

  initCACertPEM() {
    return new ForkPromise(async (resolve) => {
      const capem = join(global.Server.BaseDir!, 'CA/cacert.pem')
      if (!existsSync(capem)) {
        try {
          await mkdirp(dirname(capem))
          await copyFile(join(global.Server.Static!, 'tmpl/cacert.pem'), capem)
        } catch {}
      }
      resolve(true)
    })
  }

  getIniPath(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve, reject) => {
      const ini = join(version.path, 'php.ini')
      if (existsSync(ini)) {
        resolve(ini)
        return
      }
      const initIniFile = async (file: string) => {
        let content = await readFile(file, 'utf-8')
        content = content.replace(';extension_dir = "ext"', 'extension_dir = "ext"')
        const extensions = [
          // 核心扩展
          { name: 'php_redis.dll', type: 'extension' },
          { name: 'php_xdebug.dll', type: 'zend_extension' }, // 唯一的 zend_extension
          { name: 'php_mongodb.dll', type: 'extension' },
          { name: 'php_memcache.dll', type: 'extension' },
          { name: 'php_pdo_sqlsrv.dll', type: 'extension' },
          { name: 'php_openssl.dll', type: 'extension' },
          { name: 'php_curl.dll', type: 'extension' },
          { name: 'php_gd.dll', type: 'extension' },
          { name: 'php_fileinfo.dll', type: 'extension' },
          { name: 'php_zip.dll', type: 'extension' },
          { name: 'php_mbstring.dll', type: 'extension' },
          { name: 'php_mysqli.dll', type: 'extension' },
          { name: 'php_pdo_mysql.dll', type: 'extension' },
          { name: 'php_pdo_odbc.dll', type: 'extension' },

          // 新增的必需扩展
          { name: 'php_intl.dll', type: 'extension' },
          { name: 'php_exif.dll', type: 'extension' },
          { name: 'php_simplexml.dll', type: 'extension' },
          { name: 'php_xml.dll', type: 'extension' },
          { name: 'php_dom.dll', type: 'extension' },
          { name: 'php_xmlreader.dll', type: 'extension' },
          { name: 'php_xmlwriter.dll', type: 'extension' },
          { name: 'php_json.dll', type: 'extension' }, // PHP 7.x 需要，8.0+ 内置
          { name: 'php_bcmath.dll', type: 'extension' },
          { name: 'php_sodium.dll', type: 'extension' },
          { name: 'php_soap.dll', type: 'extension' },
          { name: 'php_ldap.dll', type: 'extension' },
          { name: 'php_imap.dll', type: 'extension' },
          { name: 'php_sockets.dll', type: 'extension' },
          { name: 'php_pdo_pgsql.dll', type: 'extension' },
          { name: 'php_pdo_sqlite.dll', type: 'extension' },
          { name: 'php_sqlite3.dll', type: 'extension' },
          { name: 'php_iconv.dll', type: 'extension' },
          { name: 'php_ftp.dll', type: 'extension' },
          { name: 'php_gettext.dll', type: 'extension' },
          { name: 'php_shmop.dll', type: 'extension' }
        ]

        // 循环检查并添加存在的扩展
        extensions.forEach((ext) => {
          const dll = join(version.path, 'ext', ext.name)
          if (existsSync(dll)) {
            content += `\n${ext.type}=${ext.name}`
          }
        })

        // Set CA certificate path
        const cacertpem = join(global.Server.BaseDir!, 'CA/cacert.pem').split('\\').join('/')
        await mkdirp(dirname(cacertpem))
        if (!existsSync(cacertpem)) {
          await copyFile(join(global.Server.Static!, 'tmpl/cacert.pem'), cacertpem)
        }
        content = content.replace(';curl.cainfo =', `curl.cainfo = "${cacertpem}"`)
        content = content.replace(';openssl.cafile=', `openssl.cafile="${cacertpem}"`)

        const parse = new IniParse(content)
        parse.set('user_ini.filename', 'user_ini.filename = ', 'PHP')
        parse.set('max_execution_time', 'max_execution_time = 120', 'PHP')
        parse.set('max_input_time', 'max_input_time = 120', 'PHP')
        parse.set('memory_limit', 'memory_limit = 256M', 'PHP')
        parse.set('post_max_size', 'post_max_size = 200M', 'PHP')
        parse.set('upload_max_filesize', 'upload_max_filesize = 200M', 'PHP')

        content = parse.content

        await writeFile(ini, content)
        const iniDefault = join(version.path, 'php.ini.default')
        await writeFile(iniDefault, content)
      }

      const devIni = join(version.path, 'php.ini-development')
      if (existsSync(devIni)) {
        await initIniFile(devIni)
        if (existsSync(ini)) {
          resolve(ini)
          return
        }
      }

      const proIni = join(version.path, 'php.ini-production')
      if (existsSync(proIni)) {
        await initIniFile(proIni)
        if (existsSync(ini)) {
          resolve(ini)
          return
        }
      }

      reject(new Error(I18nT('common.error.phpiniNotFound')))
    })
  }

  getErrorLogPathFromIni(version: SoftInstalled, iniPath?: string) {
    return new ForkPromise(async (resolve) => {
      const iniFile = iniPath || (await this.getIniPath(version))
      console.log('getErrorLogPathFromIni iniFile ', iniFile)
      if (iniFile && existsSync(iniFile)) {
        const content = await readFile(iniFile, 'utf8')
        const config = iniParse(content)
        console.log('getErrorLogPathFromIni config ', config)
        resolve(config?.PHP?.error_log ?? config?.error_log ?? '')
        return
      }
      resolve('')
    })
  }

  /**
   * PHP 自己识别服务归属：实际程序路径必须是当前版本的 spawner/php-cgi，且
   * 命令行带本版本 FlyEnv 专用 ini。相对命令行不能拿来区分两个安装目录；
   * EXECUTABLE 来自系统查询，中文/空格路径按 Windows 规则比较，不依赖 PATH。
   */
  private fastCgiProcesses(version: SoftInstalled, list: PItem[], parentsOnly = false): PItem[] {
    const normalizeExe = (path: string) => win32.normalize(path).replace(/\\/g, '/').toLowerCase()
    const exes = new Set([
      normalizeExe(join(version.path, 'php-cgi-spawner.exe')),
      normalizeExe(join(version.path, 'php-cgi.exe'))
    ])
    const ini = `php.phpwebstudy.90${version.num}.ini`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const marker = new RegExp(`(?:^|[\\\\/\\s"'])${ini}(?:$|[\\s"'])`, 'i')
    return list.filter((process) => {
      // 过滤只发生在父/独立根候选阶段；缺字段或归属不匹配不影响其他有效树。
      // 完整后代随后从原列表收集，无需每个正常 worker 的命令/EXE 都可读。
      if (!isReadableServiceStopRoot(process)) return false
      // 正常路径先仅识别父节点；其 worker 在下方由进程树直接覆盖，不作单独校验。
      if (
        parentsOnly &&
        win32.basename(process.EXECUTABLE ?? '').toLowerCase() !== 'php-cgi-spawner.exe'
      ) {
        return false
      }
      if (!marker.test(process.COMMAND)) return false
      // 专用 ini 与实际安装路径一起证明归属；EXE 单独相同不足以选中其他实例。
      return exes.has(normalizeExe(process.EXECUTABLE ?? ''))
    })
  }

  /**
   * 仅为诊断保留相关 PHP 行和显式候选，包括未被归属规则选中的行；否则无法区分
   * “首次列表没有 worker”和“列表有但筛选遗漏”。完全复用现成列表，不增加系统查询。
   */
  private stopDiagnosticRows(list: PItem[], pids: string[]) {
    const included = new Set(pids)
    const byPid = new Map(list.map((item) => [item.PID, item]))
    return list
      .filter(
        (item) =>
          included.has(item.PID) ||
          /^php-cgi(?:-spawner)?\.exe$/i.test(win32.basename(item.EXECUTABLE ?? '')) ||
          /php(?:-cgi|-fpm)|php\.phpwebstudy/i.test(item.COMMAND ?? '')
      )
      .map((item) => {
        const parent = byPid.get(item.PPID)
        return {
          ...serviceStopProcessRows([item], true)[0],
          readableRoot: isReadableServiceStopRoot(item),
          parentCreated: parent?.CREATED ?? null,
          validParentEdge: parent ? processSnapshotParentMatches(item, parent) : null
        }
      })
  }

  _stopServer(version: SoftInstalled): ForkPromise<{ 'APP-Service-Stop-PID': string[] }> {
    // trace 在调用时建立，首次筛选/根派发/末次确认/补停共用，三个并行 PHP 不混日志。
    return withServiceStopDiagnostics(
      { module: this.type, version: version.version, bin: version.bin, rootPid: version.pid },
      () =>
        new ForkPromise(async (resolve, reject, on) => {
          try {
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceBegin', { service: this.type }))
            })
            await logServiceStop('php.begin', {
              installPath: version.path,
              versionNum: version.num
            })
            // 多版本 PHP 与其他服务共用 main 的首次全量查询及 650ms 缓存。
            // main 在启动/登记时撤销旧表；停止后确认仍严格重查，不能复用这份首表。
            // 分阶段观察真实停止，不替换进程表或停止执行器；用来区分全量查询、
            // 权限管道与原树退出确认的固定开销，事件中不放命令行或配置内容。
            const snapshotQueryStartedAt = new Date().toISOString()
            const all = await timeOperation('php.stop.discover-processes', () =>
              StopProcessListFetch()
            )
            const snapshotQueryCompletedAt = new Date().toISOString()
            // 文件值只作为清理候选保存；首次列表的父筛选决定实际目标。共享 app PID
            // 可指向另一版本，不能因一条不可读登记提前阻断本版本所有有效树。
            const candidates = new Set([`${version.pid ?? ''}`.trim()])
            const pidFiles: Array<{ file: string; pid: string }> = []
            for (const file of [
              this.appPidFile(),
              join(global.Server.PhpDir!, `php${version.num}.pid`)
            ]) {
              if (existsSync(file)) {
                const pid = await timeOperation('php.stop.read-pid-file', () =>
                  this.readPidFromFile(file)
                )
                candidates.add(pid)
                pidFiles.push({ file, pid })
              }
            }
            const parents = timeOperationSync('php.stop.identify-parents', () =>
              this.fastCgiProcesses(version, all, true)
            )
            // 有效 spawner 已确认当前安装路径/专用配置；其完整后代直接属于这棵服务树，
            // 不再为四个 worker 分别比较创建时间。旧残留只在不属于任何有效父树时回收。
            const covered = new Set(
              parents.flatMap(({ PID }) => ProcessListByExactPid(PID, all).map(({ PID }) => PID))
            )
            const orphans = this.fastCgiProcesses(
              version,
              all.filter(({ PID }) => !covered.has(PID))
            ).flatMap(({ PID }) => ProcessListByExactPid(PID, all).map(({ PID }) => PID))
            const arr = [...new Set([...covered, ...orphans])]
            // 持久日志明确区分文件/登记候选、确认根、父树后代、独立根和最终完整目标。
            // 相关但未选中的 PHP 行也保留，配合创建时间/路径/ini 能复核实际筛选原因。
            await logServiceStop('php.detected', {
              snapshotQueryStartedAt,
              snapshotQueryCompletedAt,
              snapshotCount: all.length,
              pidFiles,
              candidates: [...candidates],
              missingCandidates: [...candidates].filter(
                (pid) => pid && !all.some((item) => item.PID === pid)
              ),
              parentPids: parents.map(({ PID }) => PID),
              coveredPids: [...covered],
              orphanTreePids: orphans,
              targetPids: [...arr],
              processes: this.stopDiagnosticRows(all, [...arr, ...candidates])
            })
            // 模块只提供按 ini/安装路径确认的目标。正常父树和已确认的孤立根一起交给
            // 首次列表筛选/建树已形成父先子后的目标顺序；公共执行器直接委托
            // ProcessKillStrict，不再排序或校验后代身份字段。
            // quit 不追加全量确认，UI/MCP 停止仍确认；不能拿首表误判版本残留。
            // 孤立根的后代直接按同一列表收集，不逐 worker 授权或单独启动第二套 kill。
            let finalList = await timeOperation('php.stop.execute-and-confirm', () =>
              this.stopWindowsServiceProcesses(arr, all)
            )
            if (arr.length && !isCommandOnlyServiceStopResult(finalList)) {
              // 原树消失与版本残留共用公共执行器返回的停止后快照，只在内存筛选。
              let remaining = timeOperationSync('php.stop.check-version-residuals', () =>
                this.fastCgiProcesses(version, finalList)
              )
              await logServiceStop('php.after-primary', {
                requestedPids: [...arr],
                remainingPids: remaining.map(({ PID }) => PID),
                processes: this.stopDiagnosticRows(finalList, arr)
              })
              if (remaining.length) {
                // 首次列表与真正执行之间有权限管道/调度等待，spawner 此时仍可产生 worker。
                // 公共等待只证明首次 PID 集合已退出；它不能证明快照之后出现的新 worker
                // 也退出。先前这里直接报错，导致可明确证明归属的额外 worker 遗留在退出后。
                // 只在该异常分支复用现成末次列表，确认本安装实际 EXE + 专用 ini 的独立根；
                // 不能仅按 php-cgi 名称/EXE，或旧父 PPID 选中其他用户进程。
                await logServiceStop('php.recover-residuals', {
                  requested: arr,
                  remaining: remaining.map(({ PID, PPID, CREATED }) => ({
                    pid: PID,
                    ppid: PPID,
                    created: CREATED,
                    originalCreated: all.find((process) => process.PID === PID)?.CREATED ?? null,
                    originallyRequested: arr.includes(PID)
                  }))
                })
                // 已独立确认的根授权其当前完整子树，仍不逐个检测普通后代。补停也使用
                // 公共执行器：从本轮列表取创建身份、派发前复核根、走原 Helper/UAC 分流，
                // 然后严格取新列表确认退出。不能拿首次列表的旧 PID 身份授权新 worker。
                const residualPids = [
                  ...new Set(
                    remaining.flatMap(({ PID }) =>
                      ProcessListByExactPid(PID, finalList).map((process) => process.PID)
                    )
                  )
                ]
                finalList = await timeOperation('php.stop.recover-residuals', () =>
                  this.stopWindowsServiceProcesses(residualPids, finalList)
                )
                // 成功补停的 PID 合并进本次终态，登记注销与 PID 文件清理仍使用最终快照。
                // 仅补停一次，避免持续新建进程或外部重启使 FlyEnv 退出无限循环；权限、
                // 身份变化、查询和原树等待失败仍直接传播，不清文件或伪装成功。
                arr.push(...residualPids.filter((pid) => !arr.includes(pid)))
                remaining = timeOperationSync('php.stop.check-version-residuals', () =>
                  this.fastCgiProcesses(version, finalList)
                )
                await logServiceStop('php.after-recovery', {
                  requestedPids: residualPids,
                  remainingPids: remaining.map(({ PID }) => PID),
                  processes: this.stopDiagnosticRows(finalList, arr)
                })
              }
              if (remaining.length) {
                await logServiceStop('php.failed-residuals', {
                  remaining: serviceStopProcessRows(remaining, true)
                })
                throw new Error(
                  `PHP processes are still running; PIDs=${remaining.map(({ PID }) => PID).join(',')}`
                )
              }
            }
            await this.cleanupStoppedServicePidFiles([...arr, ...candidates], finalList, [
              this.appPidFile(),
              join(global.Server.PhpDir!, `php${version.num}.pid`)
            ])
            on({
              'APP-On-Log': AppLog('info', I18nT('appLog.stopServiceEnd', { service: this.type }))
            })
            await logServiceStop('php.completed', { stoppedPids: [...arr] })
            resolve({
              'APP-Service-Stop-PID': arr
            })
          } catch (error) {
            // 包括首次查询/文件读取失败和补停失败；日志收尾不能吞掉真正停止错误。
            await logServiceStop('php.failed', { error: String(error) })
            reject(error)
          }
        })
    )
  }

  #initFPM() {
    return new Promise((resolve) => {
      const fpm = join(global.Server.PhpDir!, 'php-cgi-spawner.exe')
      if (!existsSync(fpm)) {
        zipUnpack(join(global.Server.Static!, `zip/php_cgi_spawner.7z`), global.Server.PhpDir!)
          .then(resolve)
          .catch(resolve)
        return
      }
      resolve(true)
    })
  }

  startService(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      if (!existsSync(version?.bin)) {
        reject(new Error(I18nT('fork.binNotFound')))
        return
      }
      if (!version?.version) {
        reject(new Error(I18nT('fork.versionNotFound')))
        return
      }
      try {
        await this._stopServer(version)
        const res = await this._startServer(version).on(on)
        await this._resetEnablePhpConf(version)
        resolve(res)
      } catch (e) {
        reject(e)
      }
    })
  }

  _resetEnablePhpConf(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const v = version?.version?.split('.')?.slice(0, 2)?.join('') ?? ''
      const confPath = join(global.Server.NginxDir!, 'conf/enable-php.conf')
      await mkdirp(join(global.Server.NginxDir!, 'conf'))
      const tmplPath = join(global.Server.Static!, 'tmpl/enable-php.conf')
      if (existsSync(tmplPath)) {
        let content = await readFile(tmplPath, 'utf-8')
        content = content.replace('##VERSION##', v)
        await writeFile(confPath, content)
      }
      resolve(true)
    })
  }

  _startServer(version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      on({
        'APP-On-Log': AppLog(
          'info',
          I18nT('appLog.startServiceBegin', { service: `${this.type}-${version.version}` })
        )
      })
      await this.#initFPM()
      await this.getIniPath(version)
      if (!existsSync(join(version.path, 'php-cgi-spawner.exe'))) {
        await copyFile(
          join(global.Server.PhpDir!, 'php-cgi-spawner.exe'),
          join(version.path, 'php-cgi-spawner.exe')
        )
      }

      const ini = join(version.path, 'php.ini')
      const runIni = join(version.path, `php.phpwebstudy.90${version.num}.ini`)
      if (existsSync(runIni)) {
        await remove(runIni)
      }
      await copyFile(ini, runIni)

      const bin = join(version.path, 'php-cgi-spawner.exe')
      const pidPath = join(global.Server.PhpDir!, `php${version.num}.pid`)
      const workerCount = await this.fastCgiWorkerStore().get(version.path)
      const execArgs = [
        `php-cgi.exe -c php.phpwebstudy.90${version.num}.ini`,
        `90${version.num}`,
        String(workerCount)
      ]

      try {
        const res = await serviceStartSpawn({
          version,
          pidPath,
          baseDir: global.Server.PhpDir!,
          bin,
          execArgs,
          on
        })
        resolve(res)
      } catch (e: any) {
        console.log('-k start err: ', e)
        reject(e)
        return
      }
    })
  }

  doObfuscator(params: any) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const cacheDir = global.Server.Cache!
        const obfuscatorDir = join(cacheDir, 'php-obfuscator')
        await remove(obfuscatorDir)
        const zipFile = join(global.Server.Static!, 'zip/php-obfuscator.zip')
        await zipUnpack(zipFile, obfuscatorDir)
        const bin = join(obfuscatorDir, 'yakpro-po.php')
        let command = ''
        if (params.config) {
          const configFile = join(cacheDir, 'php-obfuscator.cnf')
          await writeFile(configFile, params.config)
          command = `${basename(params.bin)} "${bin}" --config-file "${configFile}" "${params.src}" -o "${params.desc}"`
        } else {
          command = `${basename(params.bin)} "${bin}" "${params.src}" -o "${params.desc}"`
        }
        await execPromise(command, {
          cwd: dirname(params.bin)
        })
        resolve(true)
      } catch (e) {
        reject(e)
      }
    })
  }

  fetchAllOnlineVersion() {
    return new ForkPromise(async (resolve) => {
      try {
        const all: OnlineVersionItem[] = await this._fetchOnlineVersion('php')
        all.forEach((a: any) => {
          const dir = join(global.Server.AppDir!, `php-${a.version}`, 'php.exe')
          const zip = join(global.Server.Cache!, `php-${a.version}.zip`)
          a.appDir = join(global.Server.AppDir!, `php-${a.version}`)
          a.zip = zip
          a.bin = dir
          a.downloaded = existsSync(zip)
          a.installed = existsSync(dir)
          a.name = `PHP-${a.version}`
        })
        resolve(all)
      } catch {
        resolve([])
      }
    })
  }

  allInstalledVersions(setup: any) {
    return new ForkPromise((resolve) => {
      let versions: SoftInstalled[] = []
      Promise.all([versionLocalFetch(setup?.php?.dirs ?? [], 'php-cgi.exe')])
        .then(async (list) => {
          versions = list.flat()
          versions = versionFilterSame(versions)
          const all = versions.map((item) => {
            const command = `"${item.bin}" -n -v`
            const reg = /(PHP )(\d+(\.\d+){1,4})( )/g
            return TaskQueue.run(versionBinVersion, item.bin, command, reg)
          })
          return Promise.all(all)
        })
        .then(async (list) => {
          list.forEach((v, i) => {
            const { error, version } = v
            const num = version
              ? Number(versionFixed(version).split('.').slice(0, 2).join(''))
              : null
            Object.assign(versions[i], {
              version: version,
              num,
              enable: version !== null,
              error
            })
          })
          resolve(versionSort(versions))
        })
        .catch(() => {
          resolve([])
        })
    })
  }

  fetchExtensionDir(version: SoftInstalled): ForkPromise<string> {
    return new ForkPromise(async (resolve) => {
      const ini = await this.getIniPath(version)
      let content: string = await readFile(ini, 'utf-8')

      let dir: string = ''
      const regex: RegExp = /^(?!\s*;)\s*extension_dir\s*=\s*"?([^"\s]+)"?/gm
      let m: any
      while ((m = regex.exec(content)) !== null) {
        if (m && m.length > 0) {
          dir = m[1].trim()
        }
      }

      if (!dir) {
        content = content.trim() + `\nextension_dir = "ext"`
        await writeFile(ini, content)
        dir = join(dirname(version.bin), 'ext')
      } else if (!isAbsolute(dir)) {
        dir = join(dirname(version.bin), dir)
      }
      if (existsSync(dir)) {
        resolve(dir)
      }
      resolve('')
    })
  }

  localExec(item: any, version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject) => {
      const ini = await this.getIniPath(version)
      let content: string = await readFile(ini, 'utf-8')
      content = content.trim()

      if (item.installed) {
        const type = item.iniStr.includes('zend_') ? 'zend_extension' : 'extension'
        const regex: RegExp = new RegExp(
          `^(?!\\s*;)\\s*${type}\\s*=\\s*"?(${item.name})(\\.dll)?"?`,
          'gm'
        )
        content = content.replace(regex, ``).trim()
        if (item.name === 'php_xdebug') {
          content = content
            .replace(/;\[FlyEnv-xdebug-ini-begin\]([\s\S]*?);\[FlyEnv-xdebug-ini-end\]/g, ``)
            .trim()
        }
      } else {
        let dll = item.iniStr
        if (!dll.includes(`.dll`)) {
          dll = dll.replace(/"/g, '').trim()
          dll += '.dll'
        }
        content += `\n${dll}`
        if (item.name === 'php_xdebug') {
          const output_dir = join(global.Server.PhpDir!, 'xdebug')
          await mkdirp(output_dir)
          content += `\n;[FlyEnv-xdebug-ini-begin]
xdebug.idekey = "PHPSTORM"
xdebug.client_host = localhost
xdebug.client_port = 9003
xdebug.mode = debug
xdebug.profiler_append = 0
xdebug.profiler_output_name = cachegrind.out.%p
xdebug.start_with_request = yes
xdebug.trigger_value=StartProfileForMe
xdebug.output_dir = "${output_dir}"
;[FlyEnv-xdebug-ini-end]`
        }
      }

      content = content.trim()
      await writeFile(ini, content)
      this.fetchLocalExtend(version).then(resolve).catch(reject)
    })
  }

  fetchLocalExtend(version: SoftInstalled) {
    return new ForkPromise(async (resolve) => {
      const ini = await this.getIniPath(version)
      let content: string = await readFile(ini, 'utf-8')

      let dir: string = ''
      let regex: RegExp = /^(?!\s*;)\s*extension_dir\s*=\s*"?([^"\s]+)"?/gm
      let m: any
      while ((m = regex.exec(content)) !== null) {
        if (m && m.length > 0) {
          dir = m[1].trim()
        }
      }

      if (!dir) {
        content = content.trim() + `\nextension_dir = "ext"`
        await writeFile(ini, content)
        dir = join(dirname(version.bin), 'ext')
      } else if (!isAbsolute(dir)) {
        dir = join(dirname(version.bin), dir)
      }

      console.log('fetchLocalExtend dir: ', dir)

      const local: any = []
      const used: any = []

      regex = /^(?!\s*;)\s*extension\s*=\s*"?([^"\s]+)"?/gm
      while ((m = regex.exec(content)) !== null) {
        if (m && m.length > 0) {
          const name = m[1].split('.').shift().trim()
          const iniStr = m[0].trim()
          used.push({
            name,
            iniStr
          })
        }
      }

      regex.lastIndex = 0
      regex = /^(?!\s*;)\s*zend_extension\s*=\s*"?([^"\s]+)"?/gm
      while ((m = regex.exec(content)) !== null) {
        if (m && m.length > 0) {
          const name = m[1].split('.').shift().trim()
          const iniStr = m[0].trim()
          used.push({
            name,
            iniStr
          })
        }
      }

      const zend = ['php_opcache', 'php_xdebug']

      if (existsSync(dir)) {
        let all: any = await readdir(dir)
        all = all
          .map((a: string) => a.split('.').shift()!)
          .map((a: string) => {
            return {
              name: a,
              iniStr: zend.includes(a.toLowerCase()) ? `zend_extension=${a}` : `extension=${a}`
            }
          })
        local.push(...all)
      }

      resolve({
        local,
        used,
        dir
      })
    })
  }

  fetchLibExtend() {
    return new ForkPromise(async (resolve) => {
      let list: any = []
      try {
        const res = await axios({
          url: 'https://api.macphpstudy.com/api/version/php_extension',
          method: 'post',
          proxy: this.getAxiosProxy()
        })
        list = res?.data?.data ?? []
      } catch {}
      resolve(list)
    })
  }

  libExec(item: any, version: SoftInstalled) {
    return new ForkPromise(async (resolve, reject, on) => {
      const ini = await this.getIniPath(version)
      let content: string = await readFile(ini, 'utf-8')
      content = content.trim()

      const name = `php_${item.name.toLowerCase()}`
      const zend = ['php_opcache', 'php_xdebug']
      const type = zend.includes(name) ? 'zend_extension' : 'extension'
      if (item.installed) {
        const regex: RegExp = new RegExp(
          `^(?!\\s*;)\\s*${type}\\s*=\\s*"?(${name})(\\.dll)?"?`,
          'gm'
        )
        content = content.replace(regex, ``).trim()
        if (name === 'php_xdebug') {
          content = content
            .replace(/;\[FlyEnv-xdebug-ini-begin\]([\s\S]*?);\[FlyEnv-xdebug-ini-end\]/g, ``)
            .trim()
        }
      } else {
        const dir: string = await this.fetchExtensionDir(version)
        const file = join(dir, `${name}.dll`)
        if (!existsSync(file)) {
          const handleImagick = async (cacheDir: string) => {
            if (name !== 'php_imagick') {
              return
            }
            const allFile = await readdir(cacheDir)
            const allDLL = allFile.filter((a) => a.toLowerCase().endsWith('.dll'))
            const destDir = version.path
            await Promise.all(allDLL.map((a) => copyFile(join(cacheDir, a), join(destDir, a))))
          }
          const install = () => {
            return new Promise(async (resolve, reject) => {
              const phpVersion = version.version!.split('.').slice(0, 2).join('.')
              const zipFile = join(global.Server.Cache!, `${name}-php${phpVersion}.zip`)
              const cacheDir = join(global.Server.Cache!, `${name}-php${phpVersion}-cache`)
              const dll = join(cacheDir, `${name}.dll`)

              if (existsSync(zipFile)) {
                try {
                  await zipUnpack(zipFile, cacheDir)
                } catch {}
                if (existsSync(dll)) {
                  await copyFile(dll, file)
                  await handleImagick(cacheDir)
                  await remove(cacheDir)
                  if (existsSync(file)) {
                    resolve(true)
                    return
                  } else {
                    reject(new Error(`${name}.dll no found`))
                    return
                  }
                }
                await remove(cacheDir)
                await remove(zipFile)
              }
              const url = item.versions[phpVersion][0].url
              axios({
                method: 'get',
                url,
                proxy: this.getAxiosProxy(),
                responseType: 'stream',
                onDownloadProgress: (progress) => {
                  if (progress.total) {
                    const percent = Math.round((progress.loaded * 100.0) / progress.total)
                    on({
                      percent,
                      state: 'downing'
                    })
                  }
                }
              })
                .then(function (response) {
                  const stream = createWriteStream(zipFile)
                  response.data.pipe(stream)
                  stream.on('error', async (e: any) => {
                    try {
                      if (existsSync(zipFile)) {
                        await remove(zipFile)
                      }
                    } catch {}
                    reject(e)
                  })
                  stream.on('finish', async () => {
                    on({
                      percent: 100,
                      state: 'downing'
                    })
                    try {
                      if (existsSync(zipFile)) {
                        await zipUnpack(zipFile, cacheDir)
                      }
                    } catch (e) {
                      reject(e)
                      return
                    }
                    if (existsSync(dll)) {
                      await copyFile(dll, file)
                      await handleImagick(cacheDir)
                      await remove(cacheDir)
                      if (existsSync(file)) {
                        resolve(true)
                        return
                      }
                    }
                    reject(new Error(`${name}.dll no found`))
                  })
                })
                .catch(reject)
            })
          }
          try {
            await install()
          } catch (e) {
            reject(e)
            return
          }
        }
        content += `\n${type}=${name}.dll`
        if (name === 'php_xdebug') {
          const output_dir = join(global.Server.PhpDir!, 'xdebug')
          await mkdirp(output_dir)
          content += `\n;[FlyEnv-xdebug-ini-begin]
xdebug.idekey = "PHPSTORM"
xdebug.client_host = localhost
xdebug.client_port = 9003
xdebug.mode = debug
xdebug.profiler_append = 0
xdebug.profiler_output_name = cachegrind.out.%p
xdebug.start_with_request = yes
xdebug.trigger_value=StartProfileForMe
xdebug.output_dir = "${output_dir}"
;[FlyEnv-xdebug-ini-end]`
        }
      }

      content = content.trim()
      await writeFile(ini, content)
      this.fetchLocalExtend(version).then(resolve).catch(reject)
    })
  }

  disableFunctionGet(version: SoftInstalled, iniPath?: string) {
    return new ForkPromise(async (resolve) => {
      const iniFile = iniPath || (await this.getIniPath(version))
      console.log('disableFunctionGet iniFile ', iniFile)
      if (iniFile && existsSync(iniFile)) {
        const content = await readFile(iniFile, 'utf8')
        const config = iniParse(content)
        console.log('disableFunctionGet config ', config)
        const funtions: string = config?.PHP?.disable_functions ?? config?.disable_functions ?? ''
        const list = funtions
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
        resolve({
          iniFile,
          list
        })
        return
      }
      resolve({})
    })
  }

  getConfigFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    const base = version?.path ? version.path : global.Server.BaseDir!
    return [
      { name: 'php.ini', path: join(base, 'php.ini') },
      { name: 'php.ini', path: join(base, 'etc', 'php.ini') }
    ]
  }

  getLogFiles(version?: SoftInstalled): Array<{ name: string; path: string }> {
    const base = version?.path ? version.path : global.Server.BaseDir!
    return [
      { name: 'php-fpm.error.log', path: join(base, 'var', 'log', 'php-fpm.log') },
      { name: 'php-fpm.access.log', path: join(base, 'var', 'log', 'fpm-access.log') }
    ]
  }
}
export default new Php()
