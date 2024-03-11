<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ cardHeadTitle }} </span>
          <template v-if="!brewRunning && !showNextBtn">
            <el-select v-model="libSrc" style="margin-left: 8px">
              <el-option :disabled="!checkBrew()" value="brew" label="Homebrew"></el-option>
              <el-option :disabled="!checkPort()" value="port" label="MacPorts"></el-option>
            </el-select>
          </template>
        </div>
        <el-button v-if="showNextBtn" type="primary" @click="toNext">{{
          $t('base.confirm')
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
    <el-table
      v-else
      :empty-text="$t('base.gettingVersion')"
      height="100%"
      :data="tableData"
      :border="false"
      style="width: 100%"
    >
      <el-table-column prop="name">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            $t('base.brewLibrary')
          }}</span>
        </template>
        <template #="scope">
          <span style="padding: 2px 12px 2px 24px; display: block">{{ scope.row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="version" :label="$t('base.version')" width="150"> </el-table-column>
      <el-table-column align="center" :label="$t('base.isInstalled')" width="120">
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
      <el-table-column align="center" :label="$t('base.operation')" width="120">
        <template #default="scope">
          <el-button
            type="primary"
            link
            :style="{ opacity: scope.row.version !== undefined ? 1 : 0 }"
            :disabled="brewRunning"
            @click="handleEdit(scope.$index, scope.row)"
            >{{ scope.row.installed ? $t('base.uninstall') : $t('base.install') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, ComputedRef, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
  import { brewInfo, brewCheck, portInfo } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import XTerm from '@/util/XTerm'
  import { chmod } from '@shared/file'
  import { AppStore } from '@/store/app'
  import { AppSoftInstalledItem, BrewStore } from '@/store/brew'
  import { I18nT } from '@shared/lang'
  import installedVersions from '@/util/InstalledVersions'
  const { join } = require('path')
  const { existsSync, unlinkSync, copyFileSync, readFileSync, writeFileSync } = require('fs')

  const props = defineProps<{
    typeFlag:
      | 'nginx'
      | 'caddy'
      | 'apache'
      | 'memcached'
      | 'mysql'
      | 'mariadb'
      | 'redis'
      | 'php'
      | 'mongodb'
      | 'pure-ftpd'
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
    return brewStore?.[props.typeFlag] as any
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
      arr.push({
        name,
        version: value.version,
        installed: value.installed,
        num,
        flag: value.flag
      })
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
    get(): 'brew' | 'port' | undefined {
      return (
        brewStore.LibUse[props.typeFlag] ??
        (checkBrew() ? 'brew' : checkPort() ? 'port' : undefined)
      )
    },
    set(v: 'brew' | 'port') {
      brewStore.LibUse[props.typeFlag] = v
    }
  })
  const fetchData = (src: 'brew' | 'port') => {
    const currentItem = currentType.value
    const list = currentItem.list?.[src]
    const getInfo = libSrc?.value === 'brew' ? brewInfo(props.typeFlag) : portInfo(props.typeFlag)
    getInfo
      .then((res: any) => {
        for (const k in list) {
          delete list?.[k]
        }
        for (const name in res) {
          list[name] = reactive(res[name])
        }
        currentItem.getListing = false
      })
      .catch(() => {
        currentItem.getListing = false
      })
  }
  const getData = () => {
    const currentItem = currentType.value
    if (brewRunning?.value || !libSrc?.value) {
      return
    }
    const src = libSrc.value
    const list = currentItem.list?.[src]
    if (Object.keys(list).length === 0) {
      currentItem.getListing = true
      brewCheck()
        .then(() => {
          if (props.typeFlag === 'php') {
            if (src === 'brew') {
              /**
               * 先获取已安装的 php, 同时安装shivammathur/php库, 安装成功后, 再刷新数据
               * 避免国内用户添加库非常慢, 导致已安装数据也无法获取
               */
              IPC.send('app-fork:brew', 'addTap', 'shivammathur/php').then(
                (key: string, res: any) => {
                  IPC.off(key)
                  if (res?.data === 2) {
                    fetchData('brew')
                  }
                }
              )
            }
          } else if (props.typeFlag === 'mongodb') {
            if (src === 'brew') {
              IPC.send('app-fork:brew', 'addTap', 'mongodb/brew').then((key: string, res: any) => {
                IPC.off(key)
                if (res?.data === 2) {
                  fetchData('brew')
                }
              })
            }
          }
          fetchData(src)
        })
        .catch(() => {
          currentItem.getListing = false
        })
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
    let params = ''
    if (row.flag === 'brew') {
      const sh = join(global.Server.Static, 'sh/brew-cmd.sh')
      const copyfile = join(global.Server.Cache, 'brew-cmd.sh')
      if (existsSync(copyfile)) {
        unlinkSync(copyfile)
      }
      copyFileSync(sh, copyfile)
      chmod(copyfile, '0777')
      params = [copyfile, arch, fn, name].join(' ')
      if (proxyStr?.value) {
        params = `${proxyStr?.value};${params}`
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
          `echo "${global.Server.Password}" | arch ${arch} sudo -S port clean -v ${libs}`
        ]
        names.forEach((name) => {
          arrs.push(
            `echo "arch ${arch} sudo port install -v ${name} configure.compiler=macports-clang-10"`
          )
          arrs.push(
            `echo "${global.Server.Password}" | arch ${arch} sudo -S port install -v ${name} configure.compiler=macports-clang-10`
          )
        })
        let content = readFileSync(sh, 'utf-8')
        content = content.replace('##CONTENT##', arrs.join('\n'))
        writeFileSync(copyfile, content)
        chmod(copyfile, '0777')
        params = [copyfile].join(' ')
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
        params = [copyfile].join(' ')
      }
      if (proxyStr?.value) {
        params = `${proxyStr?.value};${params}`
      }
    }

    XTerm.send(`${params};exit 0;`, true).then((key: string) => {
      IPC.off(key)
      showNextBtn.value = true
      brewStore.showInstallLog = false
      brewStore.brewRunning = false
      currentType.value.installedInited = false
      reGetData()
      installedVersions.allInstalledVersions([props.typeFlag])
    })
  }

  const toNext = () => {
    showNextBtn.value = false
    BrewStore().cardHeadTitle = I18nT('base.currentVersionLib')
  }

  watch(libSrc, (v) => {
    if (v) {
      reGetData()
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
