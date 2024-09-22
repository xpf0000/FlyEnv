<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ cardHeadTitle }} </span>
          <template v-if="!brewRunning && !showNextBtn">
            <el-select v-model="libSrc" style="margin-left: 8px">
              <el-option :disabled="!checkBrew()" value="brew" label="Homebrew"></el-option>
              <template v-if="typeFlag !== 'tomcat'">
                <el-option :disabled="!checkPort()" value="port" label="MacPorts"></el-option>
              </template>
              <template v-if="typeFlag === 'php'">
                <el-option value="static" label="static-php"></el-option>
              </template>
              <template v-else-if="typeFlag === 'caddy'">
                <el-option value="static" label="static-caddy"></el-option>
              </template>
              <template v-else-if="typeFlag === 'java'">
                <el-option value="static" label="static-java"></el-option>
              </template>
              <template v-else-if="typeFlag === 'tomcat'">
                <el-option value="static" label="static-tomcat"></el-option>
              </template>
            </el-select>
          </template>
        </div>
        <el-button v-if="showNextBtn" type="primary" @click="toNext">{{
          I18nT('base.confirm')
        }}</el-button>
        <el-button
          v-else
          class="button"
          :disabled="currentType.getListing || brewRunning"
          link
          @click="reGetData"
        >
          <yb-icon
            :svg="import('@/svg/icon_refresh.svg?raw')"
            class="refresh-icon"
            :class="{ 'fa-spin': currentType.getListing || brewRunning }"
          ></yb-icon>
        </el-button>
      </div>
    </template>
    <template v-if="showLog">
      <div class="log-wapper">
        <div ref="logs" class="logs"></div>
      </div>
    </template>
    <el-table v-else height="100%" :data="tableData" :border="false" style="width: 100%">
      <template #empty>
        <template v-if="!checkBrew() && !checkPort() && !['php', 'caddy'].includes(typeFlag)">
          <div class="no-lib-found" v-html="I18nT('util.noLibFound')"></div>
        </template>
        <template v-else-if="currentType.getListing">
          {{ I18nT('base.gettingVersion') }}
        </template>
        <template v-else>
          {{ I18nT('util.noVerionsFoundInLib') }}
        </template>
      </template>
      <el-table-column prop="name">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('base.brewLibrary')
          }}</span>
        </template>
        <template #default="scope">
          <span style="padding: 2px 12px 2px 24px; display: block">{{ scope.row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="version" :label="I18nT('base.version')" width="150"> </el-table-column>
      <el-table-column align="center" :label="I18nT('base.isInstalled')" width="120">
        <template #default="scope">
          <div class="cell-status">
            <yb-icon
              v-if="scope.row.installed"
              :svg="import('@/svg/ok.svg?raw')"
              class="installed"
            ></yb-icon>
          </div>
        </template>
      </el-table-column>
      <template v-if="libSrc === 'static'">
        <el-table-column :label="null">
          <template #default="scope">
            <div class="cell-progress">
              <el-progress v-if="scope.row.downing" :percentage="scope.row.progress"></el-progress>
            </div>
          </template>
        </el-table-column>
        <el-table-column align="center" :label="I18nT('base.operation')" width="150">
          <template #default="scope">
            <el-button
              type="primary"
              link
              :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
              :loading="scope.row.downing"
              :disabled="scope.row.downing"
              @click="handleEditDown(scope.$index, scope.row, scope.row.installed)"
              >{{
                scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install')
              }}</el-button
            >
          </template>
        </el-table-column>
      </template>
      <template v-else>
        <el-table-column align="center" :label="I18nT('base.operation')" width="120">
          <template #default="scope">
            <el-button
              type="primary"
              link
              :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
              :disabled="brewRunning"
              @click="handleEdit(scope.$index, scope.row)"
              >{{
                scope.row.installed ? I18nT('base.uninstall') : I18nT('base.install')
              }}</el-button
            >
          </template>
        </el-table-column>
      </template>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, ComputedRef, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
  import { brewInfo, brewCheck, portInfo, fetchVerion } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import XTerm from '@/util/XTerm'
  import { chmod } from '@shared/file'
  import { AppStore } from '@/store/app'
  import { AppSoftInstalledItem, BrewStore } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import installedVersions from '@/util/InstalledVersions'
  import Base from '@/core/Base'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import type { AllAppModule } from '@/core/type'

  const { join } = require('path')
  const { removeSync } = require('fs-extra')
  const { existsSync, unlinkSync, copyFileSync, readFileSync, writeFileSync } = require('fs')

  const props = defineProps<{
    typeFlag: AllAppModule
  }>()

  const showNextBtn = ref(false)
  const logs = ref()
  let xterm: XTerm | null = null

  const appStore = AppStore()
  const brewStore = BrewStore()

  const proxy = computed(() => {
    return appStore.config.setup.proxy
  })
  const cardHeadTitle = computed(() => {
    return brewStore.cardHeadTitle
  })
  const brewRunning = computed(() => {
    return brewStore.brewRunning
  })
  const showInstallLog = computed(() => {
    return brewStore.showInstallLog
  })
  const log = computed(() => {
    return brewStore.log
  })
  const proxyStr = computed(() => {
    if (!proxy?.value.on) {
      return undefined
    }
    return proxy?.value?.proxy
  })
  const currentType: ComputedRef<AppSoftInstalledItem> = computed(() => {
    return brewStore.module(props.typeFlag)
  })

  const tableData = computed(() => {
    if (!libSrc?.value) {
      return []
    }
    const arr = []
    const list = currentType.value.list?.[libSrc.value]
    for (const name in list) {
      const value = list[name]
      const nums = value.version.split('.').map((n: string, i: number) => {
        if (i > 0) {
          let num = parseInt(n)
          if (isNaN(num)) {
            return '00'
          }
          if (num < 10) {
            return `0${num}`
          }
          return num
        }
        return n
      })
      const num = parseInt(nums.join(''))
      Object.assign(value, {
        name,
        version: value.version,
        installed: value.installed,
        num,
        flag: value.flag
      })
      arr.push(value)
    }
    arr.sort((a, b) => {
      return b.num - a.num
    })
    return arr
  })
  const logLength = computed(() => {
    return log?.value?.length
  })
  const showLog = computed(() => {
    return showInstallLog?.value || showNextBtn?.value
  })

  const checkBrew = () => {
    return !!global.Server.BrewCellar
  }
  const checkPort = () => {
    return !!global.Server.MacPorts
  }
  const libSrc = computed({
    get(): 'brew' | 'port' | 'static' | undefined {
      return (
        brewStore.LibUse[props.typeFlag] ??
        (checkBrew()
          ? 'brew'
          : checkPort()
            ? 'port'
            : ['php', 'caddy', 'tomcat'].includes(props.typeFlag)
              ? 'static'
              : undefined)
      )
    },
    set(v: 'brew' | 'port' | 'static') {
      brewStore.LibUse[props.typeFlag] = v
    }
  })
  let fetchFlag: Set<string> = new Set()
  const fetchData = (src: 'brew' | 'port' | 'static') => {
    fetchFlag.add(src)
    const currentItem = currentType.value
    const list = currentItem.list?.[src] ?? {}
    let getInfo: Promise<any>
    if (src === 'brew') {
      getInfo = brewInfo(props.typeFlag)
    } else if (src === 'port') {
      getInfo = portInfo(props.typeFlag)
    } else {
      getInfo = fetchVerion(props.typeFlag)
    }

    getInfo
      .then((res: any) => {
        for (const k in list) {
          delete list?.[k]
        }
        for (const name in res) {
          list[name] = reactive(res[name])
        }
        if (src === libSrc.value) {
          currentItem.getListing = false
        }
        fetchFlag.delete(src)
      })
      .catch(() => {
        if (src === libSrc.value) {
          currentItem.getListing = false
        }
        fetchFlag.delete(src)
      })
  }
  const getData = () => {
    const currentItem = currentType.value
    const src = libSrc.value

    if (brewRunning?.value || !src || fetchFlag.has(src)) {
      return
    }

    const list = currentItem.list?.[src]
    if (list && Object.keys(list).length === 0) {
      currentItem.getListing = true
      if (src === 'brew') {
        brewCheck()
          .then(() => {
            if (props.typeFlag === 'php') {
              if (src === 'brew' && !appStore?.config?.setup?.phpBrewInited) {
                /**
                 * 先获取已安装的 php, 同时安装shivammathur/php库, 安装成功后, 再刷新数据
                 * 避免国内用户添加库非常慢, 导致已安装数据也无法获取
                 */
                IPC.send('app-fork:brew', 'addTap', 'shivammathur/php').then(
                  (key: string, res: any) => {
                    IPC.off(key)
                    appStore.config.setup.phpBrewInited = true
                    appStore.saveConfig()
                    if (res?.data === 2) {
                      fetchData('brew')
                    }
                  }
                )
              }
            } else if (
              props.typeFlag === 'mongodb' &&
              !appStore?.config?.setup?.mongodbBrewInited
            ) {
              if (src === 'brew') {
                IPC.send('app-fork:brew', 'addTap', 'mongodb/brew').then(
                  (key: string, res: any) => {
                    IPC.off(key)
                    appStore.config.setup.mongodbBrewInited = true
                    appStore.saveConfig()
                    if (res?.data === 2) {
                      fetchData('brew')
                    }
                  }
                )
              }
            }
          })
          .catch(() => {
            if (src === libSrc.value) {
              currentItem.getListing = false
            }
            fetchFlag.delete(src)
          })
      }
      fetchData(src)
    }
  }
  const reGetData = () => {
    if (!libSrc?.value) {
      return
    }
    const list = currentType.value.list?.[libSrc.value]
    for (let k in list) {
      delete list[k]
    }
    getData()
  }

  const regetInstalled = () => {
    brewStore.showInstallLog = false
    brewStore.brewRunning = false
    currentType.value.installedInited = false
    reGetData()
    installedVersions.allInstalledVersions([props.typeFlag])
  }

  const handleEditDown = (index: number, row: any, installed: boolean) => {
    console.log('row: ', row, installed)
    if (!installed) {
      if (row.downing) {
        return
      }
      row.downing = true
      row.type = props.typeFlag
      IPC.send(`app-fork:${props.typeFlag}`, 'installSoft', JSON.parse(JSON.stringify(row))).then(
        (key: string, res: any) => {
          console.log('res: ', res)
          if (res?.code === 200) {
            Object.assign(row, res.msg)
          } else if (res?.code === 0) {
            IPC.off(key)
            if (res?.data) {
              regetInstalled()
            }
            row.downing = false
          }
        }
      )
    } else {
      Base._Confirm(I18nT('base.delAlertContent'), undefined, {
        customClass: 'confirm-del',
        type: 'warning'
      })
        .then(() => {
          try {
            if (existsSync(row.appDir)) {
              removeSync(row.appDir)
            }
            row.installed = false
            regetInstalled()
            MessageSuccess(I18nT('base.success'))
          } catch (e) {
            MessageError(I18nT('base.fail'))
          }
        })
        .catch(() => {})
    }
  }

  const handleEdit = (index: number, row: any) => {
    if (brewRunning?.value) {
      return
    }
    brewStore.log.splice(0)
    brewStore.showInstallLog = true
    brewStore.brewRunning = true
    let fn = ''
    if (row.installed) {
      fn = 'uninstall'
      brewStore.cardHeadTitle = `${I18nT('base.uninstall')} ${row.name}`
    } else {
      fn = 'install'
      brewStore.cardHeadTitle = `${I18nT('base.install')} ${row.name}`
    }

    const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
    const name = row.name
    let params = []
    if (row.flag === 'brew') {
      const sh = join(global.Server.Static, 'sh/brew-cmd.sh')
      const copyfile = join(global.Server.Cache, 'brew-cmd.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      copyFileSync(sh, copyfile)
      chmod(copyfile, '0777')
      params = [`${copyfile} ${arch} ${fn} ${name}; exit 0`]
      if (proxyStr?.value) {
        params.unshift(proxyStr?.value)
      }
    } else {
      let names = [name]
      if (props.typeFlag === 'php') {
        names.push(`${name}-fpm`, `${name}-mysql`, `${name}-apache2handler`, `${name}-iconv`)
      } else if (props.typeFlag === 'mysql') {
        names.push(`${name}-server`)
      } else if (props.typeFlag === 'mariadb') {
        names.push(`${name}-server`)
      }
      if (['php52', 'php53', 'php54', 'php55', 'php56'].includes(name) && fn === 'install') {
        const sh = join(global.Server.Static, 'sh/port-cmd-user.sh')
        const copyfile = join(global.Server.Cache, 'port-cmd-user.sh')
        if (existsSync(copyfile)) {
          unlinkSync(copyfile)
        }
        const libs = names.join(' ')
        const arrs = [
          `echo "arch ${arch} sudo port clean -v ${libs}"`,
          `arch ${arch} sudo -S port clean -v ${libs}`
        ]
        names.forEach((name) => {
          arrs.push(
            `echo "arch ${arch} sudo port install -v ${name} configure.compiler=macports-clang-10"`
          )
          arrs.push(
            `arch ${arch} sudo -S port install -v ${name} configure.compiler=macports-clang-10`
          )
        })
        let content = readFileSync(sh, 'utf-8')
        content = content.replace('##CONTENT##', arrs.join('\n'))
        writeFileSync(copyfile, content)
        chmod(copyfile, '0777')
        params = [`sudo -S ${copyfile}; exit 0`]
        params.push(global.Server.Password!)
      } else {
        const sh = join(global.Server.Static, 'sh/port-cmd.sh')
        const copyfile = join(global.Server.Cache, 'port-cmd.sh')
        if (existsSync(copyfile)) {
          unlinkSync(copyfile)
        }
        if (fn === 'uninstall') {
          fn = 'uninstall --follow-dependents'
        }
        let content = readFileSync(sh, 'utf-8')
        content = content
          .replace(new RegExp('##PASSWORD##', 'g'), global.Server.Password)
          .replace(new RegExp('##ARCH##', 'g'), arch)
          .replace(new RegExp('##ACTION##', 'g'), fn)
          .replace(new RegExp('##NAME##', 'g'), names.join(' '))
        writeFileSync(copyfile, content)
        chmod(copyfile, '0777')
        params = [`sudo -S ${copyfile}; exit 0`]
        params.push(global.Server.Password!)
      }
      if (proxyStr?.value) {
        params.unshift(proxyStr?.value)
      }
    }

    XTerm.send(params, true).then((key: string) => {
      IPC.off(key)
      showNextBtn.value = true
      regetInstalled()
    })
  }

  const toNext = () => {
    showNextBtn.value = false
    BrewStore().cardHeadTitle = I18nT('base.currentVersionLib')
  }

  watch(libSrc, (v) => {
    if (v) {
      console.log('watch libSrc', v, fetchFlag.has(v))
      if (fetchFlag.has(v)) {
        currentType.value.getListing = true
        return
      }
      const list = currentType.value.list?.[v] ?? {}
      if (list && Object.keys(list).length === 0) {
        reGetData()
        return
      }
      currentType.value.getListing = false
    }
  })

  watch(
    showLog,
    (val) => {
      nextTick().then(() => {
        if (val) {
          const dom = logs?.value
          xterm = new XTerm()
          xterm.mount(dom)
        } else {
          xterm && xterm.destory()
          xterm = null
        }
      })
    },
    {
      immediate: true
    }
  )
  watch(brewRunning, (val) => {
    if (!val) {
      getData()
    }
  })
  watch(
    () => props.typeFlag,
    () => {
      fetchFlag.clear()
      reGetData()
    }
  )
  watch(logLength, () => {
    if (showInstallLog?.value) {
      nextTick(() => {
        let container: HTMLElement = logs?.value as any
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    }
  })

  getData()
  if (!brewRunning?.value) {
    brewStore.cardHeadTitle = I18nT('base.currentVersionLib')
  }

  onUnmounted(() => {
    xterm && xterm.destory()
    xterm = null
  })
</script>
