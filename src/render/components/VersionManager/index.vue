<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ cardHeadTitle }} </span>
          <template v-if="!brewRunning">
            <el-select v-model="libSrc" style="margin-left: 8px" :disabled="currentType.getListing">
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
  import { brewInfo, brewCheck, portInfo } from '@/util/Brew'
  import IPC from '@/util/IPC'
  import XTerm from '@/util/XTerm'
  import { chmod } from '@shared/file'
  import installedVersions from '@/util/InstalledVersions'
  import { AppSofts, AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  const { join } = require('path')
  const { existsSync, unlinkSync, copyFileSync, readFileSync, writeFileSync } = require('fs')
  const LibUse: { [k: string]: string } = reactive({})
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
            'shivammathur/php/php@8.1',
            'shivammathur/php/php@8.2',
            'shivammathur/php/php@8.3'
          ],
          memcached: ['memcached'],
          mysql: ['mysql', 'mysql@8.0', 'mysql@5.7', 'mysql@5.6'],
          mariadb: [
            'mariadb',
            'mariadb@11.0',
            'mariadb@10.11',
            'mariadb@10.10',
            'mariadb@10.9',
            'mariadb@10.8',
            'mariadb@10.7',
            'mariadb@10.6',
            'mariadb@10.5',
            'mariadb@10.4',
            'mariadb@10.3',
            'mariadb@10.2'
          ],
          redis: ['redis', 'redis@3.2', 'redis@4.0', 'redis@6.2'],
          mongodb: [
            'mongodb/brew/mongodb-community',
            'mongodb/brew/mongodb-community@6.0',
            'mongodb/brew/mongodb-community@5.0',
            'mongodb/brew/mongodb-community@4.4',
            'mongodb/brew/mongodb-community@4.2',
            'mongodb/brew/mongodb-enterprise',
            'mongodb/brew/mongodb-enterprise@6.0',
            'mongodb/brew/mongodb-enterprise@5.0',
            'mongodb/brew/mongodb-enterprise@4.4',
            'mongodb/brew/mongodb-enterprise@4.2'
          ]
        }
      }
    },
    computed: {
      libSrc: {
        get() {
          const v =
            LibUse?.[this.typeFlag] ??
            (this.checkBrew() ? 'brew' : this.checkPort() ? 'port' : undefined)
          console.log('libSrc get: ', v, LibUse, this.typeFlag, LibUse?.[this.typeFlag])
          return v
        },
        set(v: string) {
          LibUse[this.typeFlag] = v
          console.log('LibUse: ', LibUse, this.typeFlag, v)
        }
      },
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
      },
      logLength() {
        return this.log.length
      },
      showLog() {
        return this.showInstallLog || this.showNextBtn
      }
    },
    watch: {
      libSrc(v) {
        console.log('watch libSrc: ', v)
        if (v) {
          this.reGetData()
        }
      },
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
      checkBrew() {
        return !!global.Server.BrewCellar
      },
      checkPort() {
        return !!global.Server.MacPorts
      },
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
        const getInfo = this.libSrc === 'brew' ? brewInfo(arr) : portInfo(flag)
        getInfo
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
        if (this.brewRunning || this.currentType.getListing || !this.libSrc) {
          return
        }
        const list = this.currentType.list
        if (Object.keys(list).length === 0) {
          this.currentType.getListing = true
          brewCheck()
            .then(() => {
              console.log('getData !!!')
              if (this.typeFlag === 'php') {
                if (this.libSrc === 'brew') {
                  IPC.send('app-fork:brew', 'addTap', 'shivammathur/php').then((key: string) => {
                    IPC.off(key)
                    this.fetchData(list)
                  })
                } else {
                  this.fetchData(list)
                }
              } else if (this.typeFlag === 'mongodb') {
                if (this.libSrc === 'brew') {
                  IPC.send('app-fork:brew', 'addTap', 'mongodb/brew').then((key: string) => {
                    IPC.off(key)
                    this.fetchData(list)
                  })
                } else {
                  this.fetchData(list)
                }
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
          brewStore.cardHeadTitle = `${this.$t('base.uninstall')} ${row.name}`
        } else {
          fn = 'install'
          brewStore.cardHeadTitle = `${this.$t('base.install')} ${row.name}`
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
          if (this.proxyStr) {
            params = `${this.proxyStr};${params}`
          }
        } else {
          const sh = join(global.Server.Static, 'sh/port-cmd.sh')
          const copyfile = join(global.Server.Cache, 'port-cmd.sh')
          if (existsSync(copyfile)) {
            unlinkSync(copyfile)
          }
          let names = [name]
          if (this.typeFlag === 'php') {
            names.push(`${name}-fpm`, `${name}-mysql`, `${name}-apache2handler`)
          } else if (this.typeFlag === 'mysql') {
            names.push(`${name}-server`)
          } else if (this.typeFlag === 'mariadb') {
            names.push(`${name}-server`)
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
          if (this.proxyStr) {
            params = `${this.proxyStr};${params}`
          }
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
