<template>
  <el-drawer
    v-model="show"
    size="80%"
    :destroy-on-close="true"
    :with-header="false"
    :close-on-click-modal="false"
    @closed="onDrawerClosed"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="close">
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
        <el-card class="version-manager">
          <template #header>
            <div class="card-header">
              <span> {{ headerTitle }} </span>
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
          <div v-if="currentExtend" ref="logs" class="logs cli-to-html">
            {{ logs.join('') }}
          </div>
          <el-table v-else height="100%" :data="showTableData" size="medium" style="width: 100%">
            <el-table-column prop="name" :label="$t('base.name')"> </el-table-column>
            <el-table-column align="center" :label="$t('base.status')">
              <template #default="scope">
                <yb-icon
                  v-if="scope.row.status"
                  :svg="import('@/svg/ok.svg?raw')"
                  class="installed"
                ></yb-icon>
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
                  :disabled="brewRunning"
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

<script lang="ts">
  import { defineComponent } from 'vue'
  import IPC from '@/util/IPC'
  import { getAllFile } from '@shared/file'
  import { execAsync } from '@shared/utils'
  import { reloadService } from '@/util/Service'
  import { VueExtend } from '@/core/VueExtend'
  import { BrewStore, SoftInstalled } from '@/store/brew'
  import { TaskStore } from '@/store/task'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'

  const { join } = require('path')
  const { clipboard } = require('@electron/remote')
  const { shell } = require('@electron/remote')
  const { existsSync } = require('fs')

  export default defineComponent({
    show(data: any) {
      return new Promise(() => {
        let dom: HTMLElement | null = document.createElement('div')
        document.body.appendChild(dom)
        let vm = VueExtend(this, data)
        const intance = vm.mount(dom)
        intance.onClosed = () => {
          dom && dom.remove()
          dom = null
          console.log('intance.onClosed !!!!!!')
        }
      })
    },
    components: {},
    props: {
      version: {
        type: Object,
        default() {
          return {}
        }
      }
    },
    data() {
      return {
        installExtensionDir: '',
        showNextBtn: false,
        typeFlag: 'php',
        tableData: [
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
        ],
        showTableData: [],
        show: true
      }
    },
    computed: {
      brewRunning() {
        return BrewStore().brewRunning
      },
      taskPhp() {
        return TaskStore().php
      },
      serverRunning() {
        return this.version?.run
      },
      logs() {
        return this.taskPhp.log
      },
      extendRunning() {
        return this.taskPhp.extendRunning
      },
      currentExtend() {
        return this.taskPhp.currentExtend
      },
      extendAction() {
        return this.taskPhp.extendAction
      },
      extendRefreshing() {
        return this.taskPhp.extendRefreshing
      },
      headerTitle() {
        if (this.currentExtend) {
          return `${this.extendAction} ${this.currentExtend}`
        } else if (this?.version?.version) {
          return this.$t('php.availableExtensions')
        } else {
          return this.$t('base.selectPhpVersion')
        }
      },
      versionNumber() {
        if (this.version?.version) {
          let versionNums = this.version.version.split('.')
          versionNums.splice(2)
          versionNums = versionNums.join('.')
          return parseFloat(versionNums)
        }
        return 0
      },
      logLength() {
        return this.logs.length
      }
    },
    watch: {
      'version.version': {
        handler() {
          this.taskPhp.extendRefreshing = false
          this.getTableData()
        },
        immediate: true
      },
      logLength() {
        this.$nextTick(() => {
          let container: HTMLElement = this.$refs['logs'] as HTMLElement
          if (container) {
            container.scrollTop = container.scrollHeight
          }
        })
      }
    },
    created: function () {
      if (!this.taskPhp.extendRunning) {
        this.taskPhp.currentExtend = ''
        this.taskPhp.extendAction = ''
      }
    },
    unmounted() {},
    methods: {
      openDir() {
        if (!this.installExtensionDir) {
          return
        }
        if (existsSync(this.installExtensionDir)) {
          shell.openPath(this.installExtensionDir)
        } else {
          ElMessage.warning(I18nT('php.noExtensionsDir'))
        }
      },
      close() {
        this.show = false
        this.$destroy()
        this.onClosed()
      },
      onDrawerClosed() {
        this.onClosed()
      },
      getTableData() {
        if (this.extendRefreshing) {
          return
        }
        this.taskPhp.extendRefreshing = true
        this.showTableData = JSON.parse(JSON.stringify(this.tableData))
        this.checkStatus()
      },
      checkStatus() {
        if (this.version?.version) {
          let pkconfig = join(this.version.path, 'bin/php-config')
          execAsync(pkconfig, ['--extension-dir']).then((res) => {
            this.installExtensionDir = res
            let all = getAllFile(this.installExtensionDir, false)
            all = all.filter((s) => {
              return s.indexOf('.so') >= 0 || s.indexOf('.dar') >= 0
            })
            console.log('all: ', all)
            this.showTableData.forEach((item: any) => {
              item.installed = all.indexOf(item.soname) >= 0
              item.status = item.installed
              item.soPath = join(this.installExtensionDir, item.soname)
            })
            this.taskPhp.extendRefreshing = false
          })
        }
      },
      handleEdit(index: number, row: any) {
        console.log(index, row)
        if (this.extendRunning) {
          return
        }
        this.logs.splice(0)
        this.taskPhp.extendRunning = true
        this.taskPhp.currentExtend = row.name
        this.taskPhp.extendAction = row.status ? this.$t('base.uninstall') : this.$t('base.install')
        const fn = row.status ? 'unInstallExtends' : 'installExtends'
        const args = JSON.parse(
          JSON.stringify({
            version: this.version,
            versionNumber: this.versionNumber,
            extend: row.name,
            installExtensionDir: this.installExtensionDir
          })
        )
        IPC.send('app-fork:php', fn, args).then((key: string, res: any) => {
          console.log(res)
          if (res.code === 0) {
            IPC.off(key)
            this.taskPhp.extendRunning = false
            if (this.serverRunning) {
              reloadService('php', this.version as SoftInstalled)
            }
            ElMessage.success(I18nT('base.success'))
            this.getTableData()
            this.toNext()
          } else if (res.code === 1) {
            IPC.off(key)
            this.logs.push(res.msg)
            this.taskPhp.extendRunning = false
            this.showNextBtn = true
            ElMessage.error(I18nT('base.fail'))
            this.getTableData()
          } else if (res.code === 200) {
            this.logs.push(res.msg)
          }
        })
      },
      toNext() {
        this.showNextBtn = false
        this.taskPhp.currentExtend = ''
        this.taskPhp.extendAction = ''
      },
      copyLink(index: number, row: any) {
        console.log(index, row)
        const pre = row?.extendPre ?? 'extension='
        const txt = `${pre}${row.soPath}`
        clipboard.writeText(txt)
        ElMessage.success(I18nT('php.extensionCopySuccess'))
      },
      copyXDebugTmpl(index: number, row: any) {
        console.log(index, row)
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
        ElMessage.success(I18nT('php.xdebugConfCopySuccess'))
      }
    }
  })
</script>
<style lang="scss">
  .host-vhost {
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
    }
  }
</style>
