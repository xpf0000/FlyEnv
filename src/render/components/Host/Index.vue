<template>
  <div class="host-panel main-right-panel">
    <ul class="top-tab">
      <el-dropdown split-button @click="toAdd" @command="handleCommand">
        <span class="px-5"></span>{{ $t('base.add') }}<span class="px-5"></span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :disabled="!canExport" command="export">{{
              $t('base.export')
            }}</el-dropdown-item>
            <el-dropdown-item command="import">{{ $t('base.import') }}</el-dropdown-item>
            <el-dropdown-item divided command="newProject">
              <el-popover :show-after="600" placement="bottom" trigger="hover" width="300px">
                <template #reference>
                  <span>{{ $t('host.newProject') }}</span>
                </template>
                <template #default>
                  <p>{{ $t('host.newProjectTips') }}</p>
                </template>
              </el-popover>
            </el-dropdown-item>
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
    </ul>
    <List></List>
  </div>
</template>

<script lang="ts" setup>
  import { reactive, computed, watch } from 'vue'
  import List from './ListTable.vue'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { ElMessage } from 'element-plus'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const { statSync, existsSync, copyFileSync } = require('fs')
  const { dialog } = require('@electron/remote')
  const { join, dirname } = require('path')

  const appStore = AppStore()

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
  const handleCommand = (command: 'export' | 'import' | 'newProject') => {
    console.log('handleCommand: ', command)
    switch (command) {
      case 'export':
        doExport()
        break
      case 'import':
        doImport()
        break
      case 'newProject':
        openCreateProject()
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
  const openHosts = () => {
    import('./Hosts.vue').then((res) => {
      res.default.show().then()
    })
  }
  let EditVM: any
  import('./Edit.vue').then((res) => {
    EditVM = res.default
  })
  const toAdd = () => {
    AsyncComponentShow(EditVM).then()
  }
  const openCreateProject = () => {
    import('./CreateProject/index.vue').then((res) => {
      AsyncComponentShow(res.default).then(({ dir, rewrite }: any) => {
        console.log('openCreateProject dir: ', dir)
        AsyncComponentShow(EditVM, {
          edit: {
            root: dir,
            nginx: {
              rewrite: rewrite
            }
          }
        }).then()
      })
    })
  }
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
