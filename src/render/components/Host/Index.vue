<template>
  <div class="host-panel main-right-panel">
    <ul class="top-tab">
      <el-dropdown split-button @click="drawer = true" @command="handleCommand">
        <span class="px-5"></span>{{ $t('base.add') }}<span class="px-5"></span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :disabled="!canExport" command="export">{{
              $t('base.export')
            }}</el-dropdown-item>
            <el-dropdown-item command="import">{{ $t('base.import') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-popover :show-after="600" placement="bottom" trigger="hover" width="300px">
        <template #reference>
          <li style="width: auto; padding: 0 15px; margin-left: 20px">
            <span style="margin-right: 10px">hosts: </span>
            <el-switch v-model="hostsSet.write"></el-switch>
          </li>
        </template>
        <template #default>
          <p>{{ $t('base.hostsWriteTips') }}</p>
        </template>
      </el-popover>
      <li class="no-hover" style="width: auto; padding: 0 15px">
        <el-button @click="openHosts">{{ $t('base.openHosts') }}</el-button>
      </li>
    </ul>
    <mo-host-list></mo-host-list>
    <el-drawer
      ref="host-edit-drawer"
      v-model="drawer"
      size="460px"
      :close-on-click-modal="false"
      :destroy-on-close="true"
      class="host-edit-drawer"
      :with-header="false"
    >
      <mo-host-edit ref="host-edit"></mo-host-edit>
    </el-drawer>

    <el-drawer v-model="logshow" size="60%" :destroy-on-close="true" :with-header="false">
      <mo-host-logs ref="host-logs"></mo-host-logs>
    </el-drawer>
  </div>
</template>

<script lang="ts">
  import { defineComponent, reactive } from 'vue'
  import Edit from './Edit.vue'
  import List from './ListTable.vue'
  import Logs from './Logs.vue'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { EventBus } from '@/global'
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'

  const { statSync, existsSync, copyFileSync } = require('fs')
  const { dialog } = require('@electron/remote')
  const { join, dirname } = require('path')

  export default defineComponent({
    name: 'MoHostPanel',
    components: {
      [Edit.name]: Edit,
      [List.name]: List,
      [Logs.name]: Logs
    },
    props: {},
    data() {
      return {
        current_tab: 0,
        tabs: ['添加'],
        drawer: false,
        logshow: false
      }
    },
    computed: {
      hostsSet() {
        return AppStore().config.setup.hosts
      },
      hosts() {
        return AppStore().hosts
      },
      canExport() {
        return this?.hosts?.length > 0
      }
    },
    watch: {
      'hostsSet.write': {
        handler() {
          this.hostsWrite()
          AppStore().saveConfig()
        }
      }
    },
    created: function () {
      EventBus.on('Host-Edit-Close', this.HostEditClose)
      EventBus.on('Host-Edit-Item', this.HostEditItem)
      EventBus.on('Host-Logs-Item', this.HostLogsItem)
    },
    unmounted() {
      EventBus.off('Host-Edit-Close', this.HostEditClose)
      EventBus.off('Host-Edit-Item', this.HostEditItem)
      EventBus.off('Host-Logs-Item', this.HostLogsItem)
    },
    methods: {
      hostsWrite() {
        IPC.send('app-fork:host', 'writeHosts', this.hostsSet.write).then((key: string) => {
          IPC.off(key)
          ElMessage.success(I18nT('base.success'))
        })
      },
      handleCommand(command: 'export' | 'import') {
        console.log('handleCommand: ', command)
        switch (command) {
          case 'export':
            this.doExport()
            break
          case 'import':
            this.doImport()
            break
        }
      },
      doExport() {
        let opt = ['showHiddenFiles', 'createDirectory', 'showOverwriteConfirmation']
        dialog
          .showSaveDialog({
            properties: opt,
            defaultPath: 'hosts-custom.json',
            filters: [
              {
                extensions: ['json']
              }
            ]
          })
          .then(({ canceled, filePath }: any) => {
            if (canceled || !filePath) {
              return
            }
            const nginxVPath = join(global.Server.BaseDir, 'vhost/nginx')
            const apacheVPath = join(global.Server.BaseDir, 'vhost/apache')
            const rewriteVPath = join(global.Server.BaseDir, 'vhost/rewrite')
            writeFileAsync(filePath, JSON.stringify(this.hosts)).then(() => {
              const saveDir = dirname(filePath)
              this.hosts.forEach((h) => {
                const name = `${h.name}.conf`
                const dict: { [key: string]: string } = {}
                dict[join(apacheVPath, name)] = join(saveDir, `${h.name}.apache.conf`)
                dict[join(nginxVPath, name)] = join(saveDir, `${h.name}.nginx.conf`)
                dict[join(rewriteVPath, name)] = join(saveDir, `${h.name}.rewrite.conf`)
                for (const old in dict) {
                  if (existsSync(old)) {
                    copyFileSync(old, dict[old])
                  }
                }
              })
              this.$message.success(this.$t('base.success'))
            })
          })
      },
      doImport() {
        let opt = ['openFile', 'showHiddenFiles']
        dialog
          .showOpenDialog({
            properties: opt,
            filters: [
              {
                extensions: ['json']
              }
            ]
          })
          .then(({ canceled, filePaths }: any) => {
            if (canceled || filePaths.length === 0) {
              return
            }
            const file = filePaths[0]
            const state = statSync(file)
            if (state.size > 5 * 1024 * 1024) {
              this.$message.error(this.$t('base.fileBigErr'))
              return
            }
            readFileAsync(file).then((conf) => {
              let arr = []
              try {
                arr = JSON.parse(conf)
              } catch (e) {
                this.$message.error(this.$t('base.fail'))
                return
              }
              const keys = ['id', 'name', 'alias', 'useSSL', 'ssl', 'port', 'nginx', 'root']
              const check = arr.every((a: any) => {
                const aKeys = Object.keys(a)
                return keys.every((k) => aKeys.includes(k))
              })
              if (!check) {
                this.$message.error(this.$t('base.fail'))
                return
              }
              arr = arr.map((a: any) => reactive(a))
              this.hosts.splice(0)
              this.hosts.push(...arr)
              writeFileAsync(join(global.Server.BaseDir, 'host.json'), conf)
              const baseDir = dirname(file)
              const nginxVPath = join(global.Server.BaseDir, 'vhost/nginx')
              const apacheVPath = join(global.Server.BaseDir, 'vhost/apache')
              const rewriteVPath = join(global.Server.BaseDir, 'vhost/rewrite')
              arr.forEach((h: any) => {
                const name = `${h.name}.conf`
                const dict: { [key: string]: string } = {}
                dict[join(baseDir, `${h.name}.apache.conf`)] = join(apacheVPath, name)
                dict[join(baseDir, `${h.name}.nginx.conf`)] = join(nginxVPath, name)
                dict[join(baseDir, `${h.name}.rewrite.conf`)] = join(rewriteVPath, name)
                for (const old in dict) {
                  if (existsSync(old)) {
                    copyFileSync(old, dict[old])
                  }
                }
              })
              this.hostsWrite()
            })
          })
      },
      HostLogsItem(data: any) {
        this.logshow = true
        this.$nextTick(() => {
          let ref = this.$refs['host-logs'] as any
          ref.name = data.name
          ref.type = 'nginx-access'
          ref.init()
          ref.initType(ref.type)
        })
      },
      HostEditItem(data: any) {
        this.drawer = true
        this.$nextTick(() => {
          let ref = this.$refs['host-edit'] as any
          let item = Object.assign(ref.item, JSON.parse(JSON.stringify(data)))
          ref.item = item
          ref.edit = JSON.parse(JSON.stringify(item))
          ref.isEdit = true
        })
      },
      HostEditClose() {
        console.log('HostEditClose !!!!!!')
        this.drawer = false
      },
      openHosts() {
        import('./Hosts.vue').then((res) => {
          res.default.show().then()
        })
      }
    }
  })
</script>

<style lang="scss">
  .el-drawer {
    outline: none;
    .el-drawer__body {
      height: 100%;
    }
  }
  .host-edit-drawer {
    z-index: 5050 !important;
  }
  .host-panel {
    height: 100%;
    overflow: hidden;
    line-height: 1.75;
    padding: 30px 18px;
    display: flex;
    flex-direction: column;
    > .top-tab {
      width: 100%;
      display: flex;
      align-items: center;
      margin-bottom: 20px;
      flex-shrink: 0;
      > li {
        user-select: none;
        cursor: pointer;
        min-width: 100px;
        padding: 0 12px;
        height: 36px;
        margin-right: 20px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        &:hover {
          background-color: #3e4257;
        }
        &.active {
          background: #3e4257;
        }
        &.no-hover:hover {
          background: transparent;
        }
      }
    }
    .main-block {
      flex: 1;
      width: 100%;
      overflow: hidden;
    }
  }
</style>
