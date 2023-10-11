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
          <li style="width: auto; padding: 0 15px; margin-left: 20px; margin-right: 10px">
            <span style="margin-right: 10px">hosts: </span>
            <el-switch v-model="hostsSet.write"></el-switch>
          </li>
        </template>
        <template #default>
          <p>{{ $t('base.hostsWriteTips') }}</p>
        </template>
      </el-popover>
      <li class="no-hover" style="width: auto; padding: 0 15px; margin-right: 10px">
        <el-button @click="openHosts">{{ $t('base.openHosts') }}</el-button>
      </li>
      <el-popover :show-after="600" placement="bottom" trigger="hover" width="300px">
        <template #reference>
          <li class="no-hover" style="width: auto; padding: 0 15px">
            <el-button @click="openCreateProject">{{ $t('host.newProject') }}</el-button>
          </li>
        </template>
        <template #default>
          <p>{{ $t('host.newProjectTips') }}</p>
        </template>
      </el-popover>
    </ul>
    <List></List>
    <el-drawer
      ref="host-edit-drawer"
      v-model="drawer"
      size="460px"
      :close-on-click-modal="false"
      :destroy-on-close="true"
      class="host-edit-drawer"
      :with-header="false"
    >
      <Edit ref="hostEdit"></Edit>
    </el-drawer>

    <el-drawer v-model="logshow" size="75%" :destroy-on-close="true" :with-header="false">
      <Logs ref="hostLogs"></Logs>
    </el-drawer>
  </div>
</template>

<script lang="ts" setup>
  import { reactive, ref, computed, watch, onUnmounted, nextTick } from 'vue'
  import Edit from './Edit.vue'
  import List from './ListTable.vue'
  import Logs from './Logs.vue'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { EventBus } from '@/global'
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const { statSync, existsSync, copyFileSync } = require('fs')
  const { dialog } = require('@electron/remote')
  const { join, dirname } = require('path')

  const appStore = AppStore()

  const hostLogs = ref()
  const hostEdit = ref()
  const drawer = ref(false)
  const logshow = ref(false)

  const hostsSet = computed(() => {
    return appStore.config.setup.hosts
  })
  const hosts = computed(() => {
    return appStore.hosts
  })
  const canExport = computed(() => {
    return hosts?.value?.length > 0
  })
  const hostWrite = computed(() => {
    return hostsSet.value.write
  })

  watch(hostWrite, () => {
    hostsWrite()
    appStore.saveConfig()
  })

  const hostsWrite = () => {
    IPC.send('app-fork:host', 'writeHosts', hostWrite.value).then((key: string) => {
      IPC.off(key)
      ElMessage.success(I18nT('base.success'))
    })
  }
  const handleCommand = (command: 'export' | 'import') => {
    console.log('handleCommand: ', command)
    switch (command) {
      case 'export':
        doExport()
        break
      case 'import':
        doImport()
        break
    }
  }
  const doExport = () => {
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
        writeFileAsync(filePath, JSON.stringify(hosts.value)).then(() => {
          const saveDir = dirname(filePath)
          hosts.value.forEach((h) => {
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
          ElMessage.success(I18nT('base.success'))
        })
      })
  }
  const doImport = () => {
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
          ElMessage.error(I18nT('base.fileBigErr'))
          return
        }
        readFileAsync(file).then((conf) => {
          let arr = []
          try {
            arr = JSON.parse(conf)
          } catch (e) {
            ElMessage.error(I18nT('base.fail'))
            return
          }
          const keys = ['id', 'name', 'alias', 'useSSL', 'ssl', 'port', 'nginx', 'root']
          const check = arr.every((a: any) => {
            const aKeys = Object.keys(a)
            return keys.every((k) => aKeys.includes(k))
          })
          if (!check) {
            ElMessage.error(I18nT('base.fail'))
            return
          }
          arr = arr.map((a: any) => reactive(a))
          hosts.value.splice(0)
          hosts.value.push(...arr)
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
          hostsWrite()
        })
      })
  }
  const HostLogsItem = (data: any) => {
    logshow.value = true
    nextTick(() => {
      let ref = hostLogs.value as any
      ref.name = data.name
      ref.type = 'nginx-access'
      ref.init()
      ref.initType(ref.type)
    })
  }
  const HostEditItem = (data: any) => {
    drawer.value = true
    nextTick(() => {
      let ref = hostEdit.value as any
      let item = Object.assign(ref.item, JSON.parse(JSON.stringify(data)))
      ref.item = item
      ref.edit = JSON.parse(JSON.stringify(item))
      ref.isEdit = true
    })
  }
  const HostEditClose = () => {
    drawer.value = false
  }
  const openHosts = () => {
    import('./Hosts.vue').then((res) => {
      res.default.show().then()
    })
  }
  const openCreateProject = () => {
    import('./CreateProject/index.vue').then((res) => {
      AsyncComponentShow(res.default).then(({ dir, rewrite }: any) => {
        console.log('openCreateProject dir: ', dir)
        drawer.value = true
        nextTick(() => {
          let ref = hostEdit.value as any
          ref.item.root = dir
          ref.item.nginx.rewrite = rewrite
        })
      })
    })
  }

  EventBus.on('Host-Edit-Close', HostEditClose)
  EventBus.on('Host-Edit-Item', HostEditItem)
  EventBus.on('Host-Logs-Item', HostLogsItem)

  onUnmounted(() => {
    EventBus.off('Host-Edit-Close', HostEditClose)
    EventBus.off('Host-Edit-Item', HostEditItem)
    EventBus.off('Host-Logs-Item', HostLogsItem)
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
