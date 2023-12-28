<template>
  <el-drawer
    v-model="show"
    size="80%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <div class="php-extensions">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/back.svg?raw')" width="24" height="24" />
          <span class="ml-15">{{ $t('php.phpExtension') }}</span>
        </div>
        <el-button
          type="primary"
          class="shrink0"
          :disabled="!installExtensionDir"
          @click="openDir"
          >{{ $t('base.open') }}</el-button
        >
      </div>
      <div class="main-wapper">
        <el-card>
          <template #header>
            <div class="card-header">
              <div class="left">
                <span> {{ headerTitle }} </span>
                <template v-if="isHomeBrew && !extendRunning">
                  <el-select
                    v-model="lib"
                    :disabled="
                      brewRunning || extendRunning || extendRefreshing || !version?.version
                    "
                    class="lib-select"
                  >
                    <el-option
                      value="phpwebstudy"
                      :label="$t('php.extensionsLibDefault')"
                    ></el-option>
                    <el-option value="homebrew" label="Homebrew"></el-option>
                  </el-select>
                </template>
                <template v-else-if="isMacPorts && !extendRunning">
                  <el-select
                    v-model="lib"
                    :disabled="
                      brewRunning || extendRunning || extendRefreshing || !version?.version
                    "
                    class="lib-select"
                  >
                    <el-option
                      value="phpwebstudy"
                      :label="$t('php.extensionsLibDefault')"
                    ></el-option>
                    <el-option value="macports" label="Macports"></el-option>
                  </el-select>
                </template>
              </div>
              <el-button v-if="showNextBtn" type="primary" @click="toNext">{{
                $t('base.confirm')
              }}</el-button>
              <el-button
                v-else
                class="button"
                :disabled="extendRefreshing || extendRunning"
                link
                @click="getTableData"
              >
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  class="refresh-icon"
                  :class="{ 'fa-spin': extendRefreshing || extendRunning }"
                ></yb-icon>
              </el-button>
            </div>
          </template>
          <div v-if="currentExtend" ref="logRef" class="logs cli-to-html">
            {{ logs?.join('') ?? '' }}
          </div>
          <el-table
            v-else
            v-loading="extendRefreshing"
            height="100%"
            :data="showTableDataFilter"
            style="width: 100%"
          >
            <el-table-column prop="name" class-name="name-cell-td" :label="$t('base.name')">
              <template #header>
                <div class="w-p100 name-cell">
                  <span>{{ $t('base.name') }}</span>
                  <el-input v-model.trim="search" placeholder="search" clearable></el-input>
                </div>
              </template>
            </el-table-column>
            <el-table-column align="center" :label="$t('base.status')">
              <template #default="scope">
                <div class="cell-status">
                  <yb-icon
                    v-if="scope.row.status"
                    :svg="import('@/svg/ok.svg?raw')"
                    class="installed"
                  ></yb-icon>
                </div>
              </template>
            </el-table-column>

            <el-table-column width="300px" align="left" :label="$t('base.operation')">
              <template v-if="version?.version" #default="scope">
                <el-button
                  v-if="scope.row.status"
                  type="primary"
                  link
                  @click="copyLink(scope.$index, scope.row)"
                  >{{ $t('base.copyLink') }}</el-button
                >
                <el-button
                  v-else
                  :disabled="brewRunning || !version?.version"
                  type="primary"
                  link
                  @click="handleEdit(scope.$index, scope.row)"
                  >{{ $t('base.install') }}</el-button
                >
                <el-button
                  v-if="scope.row.status && scope.row.name === 'xdebug'"
                  type="primary"
                  link
                  @click="copyXDebugTmpl(scope.$index, scope.row)"
                  >{{ $t('php.copyConfTemplate') }}</el-button
                >
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref, computed, watch, nextTick, Ref } from 'vue'
  import IPC from '@/util/IPC'
  import { getAllFile } from '@shared/file'
  import { execAsync } from '@shared/utils'
  import { reloadService } from '@/util/Service'
  import { BrewStore, SoftInstalled } from '@/store/brew'
  import { TaskStore } from '@/store/task'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { ExtensionHomeBrew, ExtensionMacPorts } from '@/components/PHP/store'
  import { MessageError, MessageSuccess, MessageWarning } from '@/util/Element'

  const { join } = require('path')
  const { clipboard } = require('@electron/remote')
  const { shell } = require('@electron/remote')
  const { existsSync } = require('fs')

  const props = defineProps<{
    version: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const search = ref('')
  const logRef = ref()
  const lib: Ref<'phpwebstudy' | 'macports' | 'homebrew'> = ref('phpwebstudy')
  const installExtensionDir = ref('')
  const showNextBtn = ref(false)
  const tableData = [
    {
      name: 'ionCube',
      installed: false,
      status: false,
      soname: 'ioncube.so',
      extendPre: 'zend_extension='
    },
    {
      name: 'sg11',
      installed: false,
      status: false,
      soname: 'ixed.dar'
    },
    {
      name: 'memcache',
      installed: false,
      status: false,
      soname: 'memcache.so'
    },
    {
      name: 'memcached',
      installed: false,
      status: false,
      soname: 'memcached.so'
    },
    {
      name: 'redis',
      installed: false,
      status: false,
      soname: 'redis.so'
    },
    {
      name: 'swoole',
      installed: false,
      status: false,
      soname: 'swoole.so'
    },
    {
      name: 'xdebug',
      installed: false,
      status: false,
      soname: 'xdebug.so',
      extendPre: 'zend_extension='
    },
    {
      name: 'xlswriter',
      installed: false,
      status: false,
      soname: 'xlswriter.so',
      extendPre: 'zend_extension='
    },
    {
      name: 'ssh2',
      installed: false,
      status: false,
      soname: 'ssh2.so'
    },
    {
      name: 'pdo_sqlsrv',
      installed: false,
      status: false,
      soname: 'pdo_sqlsrv.so'
    },
    {
      name: 'imagick',
      installed: false,
      status: false,
      soname: 'imagick.so'
    },
    {
      name: 'mongodb',
      installed: false,
      status: false,
      soname: 'mongodb.so'
    },
    {
      name: 'yaf',
      installed: false,
      status: false,
      soname: 'yaf.so'
    }
  ]
  const showTableData = ref([])

  const showTableDataFilter = computed(() => {
    const sortName = (a: any, b: any) => {
      return a.name - b.name
    }
    const sortStatus = (a: any, b: any) => {
      if (a.status === b.status) {
        return 0
      }
      if (a.status) {
        return -1
      }
      if (b.status) {
        return 1
      }
      return 0
    }
    if (!search.value) {
      return Array.from(showTableData.value).sort(sortName).sort(sortStatus)
    }
    return showTableData.value
      .filter((d: any) => d.name.toLowerCase().includes(search.value.toLowerCase()))
      .sort(sortName)
      .sort(sortStatus)
  })

  const brewStore = BrewStore()
  const taskStore = TaskStore()
  const brewRunning = computed(() => {
    return brewStore.brewRunning
  })
  const taskPhp = computed(() => {
    return taskStore.php
  })
  const serverRunning = computed(() => {
    return props?.version?.run
  })
  const logs = computed(() => {
    return taskPhp?.value?.log
  })
  const extendRunning = computed(() => {
    return taskPhp?.value?.extendRunning
  })
  const currentExtend = computed(() => {
    return taskPhp?.value?.currentExtend
  })
  const extendAction = computed(() => {
    return taskPhp?.value?.extendAction
  })
  const extendRefreshing = computed(() => {
    return taskPhp?.value?.extendRefreshing
  })
  const headerTitle = computed(() => {
    if (currentExtend?.value) {
      return `${extendAction?.value} ${currentExtend?.value}`
    } else if (props?.version?.version) {
      if (isHomeBrew?.value || isMacPorts?.value) {
        return I18nT('php.extensionsLib')
      }
      return I18nT('php.availableExtensions')
    } else {
      return I18nT('base.selectPhpVersion')
    }
  })
  const versionNumber = computed(() => {
    if (props?.version?.version) {
      let versionNums: any = props?.version?.version.split('.')
      versionNums.splice(2)
      return versionNums.join('.')
    }
    return 0
  })
  const logLength = computed(() => {
    return logs.value.length
  })

  const isMacPorts = computed(() => {
    return props.version?.flag === 'macports'
  })
  const isHomeBrew = computed(() => {
    return props.version?.path?.includes(global?.Server?.BrewCellar ?? '-----')
  })

  const openDir = () => {
    if (!installExtensionDir?.value) {
      return
    }
    if (existsSync(installExtensionDir?.value)) {
      shell.openPath(installExtensionDir?.value)
    } else {
      MessageWarning(I18nT('php.noExtensionsDir'))
    }
  }

  const checkStatus = () => {
    if (props?.version?.version) {
      let pkconfig = props?.version?.phpConfig ?? join(props?.version?.path, 'bin/php-config')
      execAsync(pkconfig, ['--extension-dir']).then((res: string) => {
        installExtensionDir.value = res
        let all = getAllFile(installExtensionDir.value, false)
        all = all.filter((s) => {
          return s.indexOf('.so') >= 0 || s.indexOf('.dar') >= 0
        })
        showTableData.value.forEach((item: any) => {
          item.installed = all.indexOf(item.soname) >= 0
          item.status = item.installed
          item.soPath = join(installExtensionDir.value, item.soname)
        })
        taskStore.php.extendRefreshing = false
      })
    }
  }

  const fetchAll = (fn: 'fetchAllPhpExtensions' | 'fetchAllPhpExtensionsByPort') => {
    return new Promise((resolve) => {
      if (fn === 'fetchAllPhpExtensions' && ExtensionHomeBrew?.[versionNumber.value]) {
        showTableData.value = ExtensionHomeBrew?.[versionNumber.value]
        resolve(true)
        return
      }
      if (fn === 'fetchAllPhpExtensionsByPort' && ExtensionMacPorts?.[versionNumber.value]) {
        showTableData.value = ExtensionMacPorts?.[versionNumber.value]
        resolve(true)
        return
      }
      IPC.send('app-fork:brew', fn, versionNumber.value).then((key: string, res: any) => {
        IPC.off(key)
        showTableData.value = res?.data ?? []
        if (res?.data) {
          if (fn === 'fetchAllPhpExtensions') {
            ExtensionHomeBrew[versionNumber.value] = res.data
          } else {
            ExtensionMacPorts[versionNumber.value] = res.data
          }
        }
        resolve(true)
      })
    })
  }

  const getTableData = async () => {
    if (extendRefreshing?.value) {
      return
    }
    taskStore.php.extendRefreshing = true
    showTableData.value = []
    if (lib.value === 'phpwebstudy') {
      showTableData.value = JSON.parse(JSON.stringify(tableData))
    } else if (lib.value === 'homebrew') {
      await fetchAll('fetchAllPhpExtensions')
    } else if (lib.value === 'macports') {
      await fetchAll('fetchAllPhpExtensionsByPort')
    }
    checkStatus()
  }

  const toNext = () => {
    showNextBtn.value = false
    taskStore.php.currentExtend = ''
    taskStore.php.extendAction = ''
  }

  const handleEdit = (index: number, row: any) => {
    console.log(index, row)
    if (extendRunning?.value || !props?.version?.version) {
      return
    }
    logs.value.splice(0)
    taskStore.php.extendRunning = true
    taskStore.php.currentExtend = row.name
    taskStore.php.extendAction = row.status ? I18nT('base.uninstall') : I18nT('base.install')
    const fn = row.status ? 'unInstallExtends' : 'installExtends'
    const args = JSON.parse(
      JSON.stringify({
        version: props.version,
        versionNumber: parseFloat(`${versionNumber.value}`),
        extend: row.name,
        installExtensionDir: installExtensionDir.value,
        ...row
      })
    )
    IPC.send('app-fork:php', fn, args).then((key: string, res: any) => {
      console.log(res)
      if (res.code === 0) {
        IPC.off(key)
        taskStore.php.extendRunning = false
        if (serverRunning.value) {
          reloadService('php', props.version)
        }
        MessageSuccess(I18nT('base.success'))
        getTableData().then(() => {
          toNext()
        })
      } else if (res.code === 1) {
        IPC.off(key)
        logs.value.push(res.msg)
        taskStore.php.extendRunning = false
        showNextBtn.value = true
        MessageError(I18nT('base.fail'))
        getTableData().then()
      } else if (res.code === 200) {
        logs.value.push(res.msg)
      }
    })
  }

  const copyLink = (index: number, row: any) => {
    const pre = row?.extendPre ?? 'extension='
    const txt = `${pre}${row.soPath}`
    clipboard.writeText(txt)
    MessageSuccess(I18nT('php.extensionCopySuccess'))
  }

  const copyXDebugTmpl = (index: number, row: any) => {
    const txt = `[xdebug]
;这里给出一个通用模板,需要根据自己修改具体配置项
;适用与xdebug-3.x版本, 2.x版本的请自行修改
zend_extension = "${row.soPath}"
xdebug.idekey = "PHPSTORM"
xdebug.client_host = localhost
;端口ID,phpstorm 设置须一致
xdebug.client_port = 9003
;开启xdebug支持，不同的mode的不同的用途，详细说明请看官方文档
;如果要多个模式一起开启，就用 ',' 分隔开就行
xdebug.mode = debug
xdebug.profiler_append = 0
xdebug.profiler_output_name = cachegrind.out.%p
;这里与原来不同了，原来如果要开启trace或profile,用的是enable_trace,enable_profile等字段
xdebug.start_with_request = yes
;这里就是原来的profile_trigger_value,trace_trigger_value
xdebug.trigger_value=StartProfileForMe
;输出文件路径，原来是output_profiler_dir,trace_dir分别设置,现在统一用这个设置就可以
xdebug.output_dir = /tmp`
    clipboard.writeText(txt)
    MessageSuccess(I18nT('php.xdebugConfCopySuccess'))
  }

  watch(
    () => props?.version?.version,
    () => {
      taskStore.php.extendRefreshing = false
      getTableData().then()
    },
    {
      immediate: true
    }
  )

  watch(lib, () => {
    taskStore.php.extendRefreshing = false
    getTableData().then()
  })

  watch(logLength, () => {
    nextTick().then(() => {
      let container: HTMLElement = logRef.value as any
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    })
  })

  if (!taskPhp?.value?.extendRunning) {
    taskStore.php.currentExtend = ''
    taskStore.php.extendAction = ''
  }

  console.log(
    'props.version: ',
    props.version,
    versionNumber.value,
    isMacPorts.value,
    isHomeBrew.value,
    global.Server
  )

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
<style lang="scss">
  .php-extensions {
    width: 100%;
    height: 100%;
    background: #1d2033;
    display: flex;
    flex-direction: column;
    user-select: none;
    .nav {
      height: 76px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      background: #282b3d;
      .left {
        cursor: pointer;
        display: flex;
        align-items: center;
        padding: 6px 0;
      }
    }

    .main-wapper {
      flex: 1;
      width: 100%;
      overflow: hidden;
      padding: 12px;
      color: rgba(255, 255, 255, 0.7);
      display: flex;
      flex-direction: column;

      > .block {
        width: 100%;
        flex: 1;
        overflow: hidden;
      }
      .tool {
        flex-shrink: 0;
        padding: 30px 0 20px 0;
      }
      ul.logs {
        user-select: text;
      }

      .el-card {
        display: flex;
        flex-direction: column;
        max-height: 100%;
        height: 100%;

        .el-card__header {
          flex-shrink: 0;

          .card-header {
            display: flex;
            align-items: center;
            justify-content: space-between;

            .left {
              height: 100%;
              display: flex;
              align-items: center;

              .lib-select {
                margin-left: 8px;
              }
            }

            .refresh-icon {
              width: 24px;
              height: 24px;
            }
          }
        }

        .el-card__body {
          flex: 1;
          overflow: hidden;

          .logs {
            height: 100%;
            overflow: auto;
            word-break: break-word;

            &::-webkit-scrollbar {
              display: none;
            }
          }

          .name-cell-td {
            user-select: text;
          }

          .cell-status {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .installed {
            width: 18px;
            height: 18px;
            color: #01cc74;
          }

          .name-cell {
            display: flex;
            align-items: center;

            > span {
              flex-shrink: 0;
              margin-right: 20px;
            }
            > .el-input {
              height: 26px;
              width: 188px;
            }
          }
        }
      }
    }
  }
</style>
