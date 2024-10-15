<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <el-dropdown class="mr-3" @command="setTab">
        <el-button class="outline-0 focus:outline-0">
          {{ tab }} <el-icon class="el-icon--right"><arrow-down /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <template v-for="(label, value) in tabs" :key="value">
              <el-dropdown-item :command="value">{{ label }}</el-dropdown-item>
            </template>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button-group>
        <el-button style="padding-left: 30px; padding-right: 30px" @click="toAdd">{{
          I18nT('base.add')
        }}</el-button>
        <el-dropdown trigger="click" @command="handleCommand">
          <template #default>
            <el-button
              style="
                padding-left: 8px;
                padding-right: 8px;
                border-left-color: transparent !important;
              "
              :icon="More"
            ></el-button>
          </template>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :disabled="!canExport" command="export">{{
                I18nT('base.export')
              }}</el-dropdown-item>
              <el-dropdown-item command="import">{{ I18nT('base.import') }}</el-dropdown-item>
              <el-dropdown-item divided command="hostsCopy">{{
                I18nT('host.hostsCopy')
              }}</el-dropdown-item>
              <el-dropdown-item command="hostsOpen">{{ I18nT('host.hostsOpen') }}</el-dropdown-item>
              <el-dropdown-item divided command="newProject">
                <el-popover :show-after="600" placement="bottom" trigger="hover" width="auto">
                  <template #reference>
                    <span>{{ I18nT('host.newProject') }}</span>
                  </template>
                  <template #default>
                    <p>{{ I18nT('host.newProjectTips') }}</p>
                  </template>
                </el-popover>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-button-group>
      <el-popover :show-after="600" placement="bottom" trigger="hover" width="auto">
        <template #reference>
          <li style="width: auto; padding: 0 15px; margin-left: 20px; margin-right: 10px">
            <span style="margin-right: 10px">{{ I18nT('host.enable') }}: </span>
            <el-switch v-model="hostsSet.write"></el-switch>
          </li>
        </template>
        <template #default>
          <p>{{ I18nT('host.hostsWriteTips') }}</p>
        </template>
      </el-popover>
      <li class="no-hover" style="width: auto; padding: 0 15px; margin-right: 10px">
        <el-button @click="openHosts">{{ I18nT('base.openHosts') }}</el-button>
      </li>
    </ul>
    <List v-show="HostStore.tab === 'php'"></List>
  </div>
</template>

<script lang="ts" setup>
  import { reactive, computed, watch } from 'vue'
  import List from './ListTable.vue'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { More, ArrowDown } from '@element-plus/icons-vue'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import type { AppHost } from '@shared/app'
  import { HostStore } from './store'

  const { statSync, existsSync, copyFileSync } = require('fs')
  const { dialog, clipboard, shell } = require('@electron/remote')
  const { join, dirname } = require('path')

  const appStore = AppStore()

  const tabs = computed(() => {
    return {
      php: I18nT('host.projectPhp'),
      java: I18nT('host.projectJava'),
      node: I18nT('host.projectNode'),
      go: I18nT('host.projectGo'),
      python: I18nT('host.projectPython'),
      html: I18nT('host.projectHtml')
    }
  })

  const tab = computed(() => {
    const v: any = tabs.value
    return v[HostStore.tab]
  })

  const setTab = (tab: string) => {
    HostStore.tab = tab
  }

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
      MessageSuccess(I18nT('base.success'))
    })
  }
  const hostAlias = (item: AppHost) => {
    const alias = item.alias
      ? item.alias.split('\n').filter((n) => {
          return n && n.length > 0
        })
      : []
    return [item.name, ...alias].join(' ')
  }
  const handleCommand = (
    command: 'export' | 'import' | 'newProject' | 'hostsCopy' | 'hostsOpen'
  ) => {
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
      case 'hostsCopy':
        const host = []
        for (const item of hosts.value) {
          const alias = hostAlias(item)
          host.push(`127.0.0.1     ${alias}`)
        }
        clipboard.writeText(host.join('\n'))
        MessageSuccess(I18nT('base.copySuccess'))
        break
      case 'hostsOpen':
        const file = join(global.Server.BaseDir, 'app.hosts.txt')
        shell.showItemInFolder(file)
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
          MessageSuccess(I18nT('base.success'))
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
          MessageError(I18nT('base.fileBigErr'))
          return
        }
        readFileAsync(file).then((conf) => {
          let arr = []
          try {
            arr = JSON.parse(conf)
          } catch (e) {
            MessageError(I18nT('base.fail'))
            return
          }
          const keys = ['id', 'name', 'alias', 'useSSL', 'ssl', 'port', 'nginx', 'root']
          const check = arr.every((a: any) => {
            const aKeys = Object.keys(a)
            return keys.every((k) => aKeys.includes(k))
          })
          if (!check) {
            MessageError(I18nT('base.fail'))
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
