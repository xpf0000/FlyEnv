<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <span> {{ cardHeadTitle }} </span>
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
      <div ref="logs" class="logs"></div>
    </template>
    <el-table
      v-else
      :empty-text="$t('base.gettingVersion')"
      height="100%"
      :data="tableData"
      style="width: 100%"
    >
      <el-table-column prop="name" :label="$t('base.brewLibrary')"> </el-table-column>
      <el-table-column prop="version" :label="$t('base.version')"> </el-table-column>
      <el-table-column align="center" :label="$t('base.isInstalled')" width="120">
        <template #default="scope">
          <yb-icon
            v-if="scope.row.installed"
            :svg="import('@/svg/ok.svg?raw')"
            class="installed"
          ></yb-icon>
        </template>
      </el-table-column>

      <el-table-column align="center" :label="$t('base.operation')" width="150">
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

<script lang="ts">
  import { defineComponent, reactive } from 'vue'
  import { brewInfo, brewCheck } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import XTerm from '@/util/XTerm'
  import { chmod } from '@shared/file'
  import installedVersions from '@/util/InstalledVersions'
  import { AppSofts, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  const { join } = require('path')
  const { existsSync, unlinkSync, copyFileSync } = require('fs')

  export default defineComponent({
    components: {},
    props: {
      typeFlag: {
        type: String,
        default: ''
      }
    },
    data() {
      return {
        showNextBtn: false,
        searchKeys: {
          apache: ['httpd'],
          nginx: ['nginx'],
          php: [
            'php',
            'php@7.2',
            'php@7.3',
            'php@7.4',
            'php@8.0',
            'shivammathur/php/php',
            'shivammathur/php/php@5.6',
            'shivammathur/php/php@7.0',
            'shivammathur/php/php@7.1',
            'shivammathur/php/php@7.2',
            'shivammathur/php/php@7.3',
            'shivammathur/php/php@7.4',
            'shivammathur/php/php@8.0',
            'shivammathur/php/php@8.2',
            'shivammathur/php/php@8.3'
          ],
          memcached: ['memcached'],
          mysql: ['mysql', 'mysql@5.6', 'mysql@5.7'],
          redis: ['redis', 'redis@3.2', 'redis@4.0', 'redis@6.2']
        }
      }
    },
    computed: {
      proxy() {
        return AppStore().config.setup.proxy
      },
      cardHeadTitle() {
        return BrewStore().cardHeadTitle
      },
      brewRunning() {
        return BrewStore().brewRunning
      },
      showInstallLog() {
        return BrewStore().showInstallLog
      },
      log() {
        return BrewStore().log
      },
      proxyStr() {
        if (!this?.proxy?.on) {
          return undefined
        }
        return this.proxy.proxy
      },
      currentType() {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        return BrewStore()[flag]
      },
      tableData() {
        const arr = []
        const list = this.currentType.list
        for (let name in list) {
          const value = list[name]
          arr.push({
            name,
            version: value.version,
            installed: value.installed
          })
        }
        return arr
      },
      logLength() {
        return this.log.length
      },
      showLog() {
        return this.showInstallLog || this.showNextBtn
      }
    },
    watch: {
      showLog: {
        handler(val) {
          this.$nextTick().then(() => {
            if (val) {
              const dom = this.$refs.logs
              this.xterm = new XTerm()
              this.xterm.mount(dom)
            } else {
              this.xterm && this.xterm.destory()
              this.xterm = null
            }
          })
        },
        immediate: true
      },
      brewRunning(val) {
        if (!val) {
          this.getData()
        }
      },
      typeFlag() {
        this.reGetData()
      },
      logLength() {
        if (this.showInstallLog) {
          this.$nextTick(() => {
            let container: HTMLElement = this.$refs['logs'] as HTMLElement
            if (container) {
              container.scrollTop = container.scrollHeight
            }
          })
        }
      }
    },
    created: function () {
      console.log('created typeFlag: ', this.typeFlag)
      this.getData()
      if (!this.brewRunning) {
        BrewStore().cardHeadTitle = this.$t('base.currentVersionLib')
      }
    },
    unmounted() {
      this.xterm && this.xterm.destory()
      this.xterm = null
    },
    methods: {
      reGetData() {
        const list = this.currentType.list
        for (let k in list) {
          delete list[k]
        }
        this.getData()
      },
      fetchData(list: any) {
        const flag: keyof typeof AppSofts = this.typeFlag as any
        const arr = this.searchKeys[flag]
        for (const k in list) {
          delete list[k]
        }
        brewInfo(arr)
          .then((res: any) => {
            for (const name in res) {
              list[name] = reactive(res[name])
            }
            this.currentType.getListing = false
          })
          .catch(() => {
            this.currentType.getListing = false
          })
      },
      getData() {
        if (this.brewRunning || this.currentType.getListing) {
          return
        }
        const list = this.currentType.list
        if (Object.keys(list).length === 0) {
          this.currentType.getListing = true
          brewCheck()
            .then(() => {
              console.log('getData !!!')
              if (this.typeFlag === 'php') {
                IPC.send('app-fork:host', 'githubFix').then((key: string) => {
                  IPC.off(key)
                  IPC.send('app-fork:brew', 'addTap', 'shivammathur/php').then((key: string) => {
                    IPC.off(key)
                    this.fetchData(list)
                  })
                })
              } else {
                this.fetchData(list)
              }
            })
            .catch(() => {
              this.currentType.getListing = false
            })
        }
      },
      handleEdit(index: number, row: any) {
        console.log(index, row)
        if (this.brewRunning) {
          return
        }
        this.log.splice(0)
        const brewStore = BrewStore()
        brewStore.showInstallLog = true
        brewStore.brewRunning = true
        let fn = ''
        if (row.installed) {
          fn = 'uninstall'
          brewStore.cardHeadTitle = `Brew ${this.$t('base.uninstall')} ${row.name}`
        } else {
          fn = 'install'
          brewStore.cardHeadTitle = `Brew ${this.$t('base.install')} ${row.name}`
        }

        const arch = global.Server.isAppleSilicon ? '-arm64' : '-x86_64'
        const name = row.name
        const sh = join(global.Server.Static, 'sh/brew-cmd.sh')
        const copyfile = join(global.Server.Cache, 'brew-cmd.sh')
        if (existsSync(copyfile)) {
          unlinkSync(copyfile)
        }
        copyFileSync(sh, copyfile)
        chmod(copyfile, '0777')

        let params = [copyfile, arch, fn, name].join(' ')
        if (this.proxyStr) {
          params = `${this.proxyStr};${params}`
        }
        XTerm.send(`${params};exit 0;`, true).then((key: string) => {
          IPC.off(key)
          this.showNextBtn = true
          brewStore.showInstallLog = false
          brewStore.brewRunning = false
          this.currentType.installedInited = false
          this.reGetData()
          const flag: keyof typeof AppSofts = this.typeFlag as any
          installedVersions.allInstalledVersions([flag])
        })
      },
      toNext() {
        this.showNextBtn = false
        BrewStore().cardHeadTitle = this.$t('base.currentVersionLib')
      }
    }
  })
</script>

<style lang="scss">
  @keyframes fa-spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .fa-spin {
    animation: fa-spin 1s 0s infinite linear;
  }

  .version-manager {
    display: flex;
    flex-direction: column;
    max-height: 100%;
    padding: 20px;
    height: 100%;

    &.el-card {
      display: flex;
      flex-direction: column;

      .el-card__header {
        flex-shrink: 0;

        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
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
      }
    }

    .refresh-icon {
      width: 24px;
      height: 24px;
    }

    .installed {
      width: 18px;
      height: 18px;
      color: #01cc74;
    }
  }
</style>
