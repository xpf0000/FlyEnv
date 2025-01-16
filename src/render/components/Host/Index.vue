<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab mt-3 flex items-center gap-2.5">
      <el-dropdown @command="setTab">
        <el-button class="outline-0 focus:outline-0">
          {{ tab }} <el-icon class="el-icon--right"><arrow-down /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <template v-for="(item, index) in tabs" :key="index">
              <el-dropdown-item :disabled="true">
                <div class="text-sm" :class="{ 'mt-2': index > 0 }">{{ item.label }}</div>
              </el-dropdown-item>
              <template v-for="(label, value) in item.sub" :key="value">
                <el-dropdown-item :command="value">{{ label }}</el-dropdown-item>
              </template>
            </template>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button-group>
        <template v-if="isLock">
          <el-tooltip placement="right" :content="I18nT('host.licenseTips')">
            <el-button
              :icon="Lock"
              style="padding-left: 30px; padding-right: 30px"
              @click="toLicense"
              >{{ I18nT('base.add') }}</el-button
            >
          </el-tooltip>
        </template>
        <template v-else>
          <el-button style="padding-left: 30px; padding-right: 30px" @click="toAdd">{{
            I18nT('base.add')
          }}</el-button>
        </template>
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
              <el-dropdown-item divided>
                <VhostTmpl />
              </el-dropdown-item>
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
      <el-button @click="openHosts">{{ I18nT('base.openHosts') }}</el-button>
      <el-popover :show-after="600" placement="bottom" trigger="hover" width="auto">
        <template #reference>
          <div class="inline-flex items-center gap-3 ml-2">
            <span>{{ I18nT('host.enable') }}: </span>
            <el-switch v-model="hostsSet.write"></el-switch>
          </div>
        </template>
        <template #default>
          <p>{{ I18nT('host.hostsWriteTips') }}</p>
        </template>
      </el-popover>
      <template v-if="hostsSet.write">
        <div class="inline-flex items-center gap-3">
          <span>IPV6: </span>
          <el-switch v-model="ipv6"></el-switch>
        </div>
      </template>
    </ul>
    <List v-show="HostStore.tab === 'php'"></List>
    <ListJava v-show="HostStore.tab === 'java'"></ListJava>
    <ListNode v-show="HostStore.tab === 'node'"></ListNode>
    <ListGo v-show="HostStore.tab === 'go'"></ListGo>
    <ListPython v-show="HostStore.tab === 'python'"></ListPython>
    <ListTomcat v-show="HostStore.tab === 'tomcat'"></ListTomcat>
  </div>
</template>

<script lang="ts" setup>
  import { reactive, computed, watch, onMounted } from 'vue'
  import List from './ListTable.vue'
  import IPC from '@/util/IPC'
  import { AppStore } from '@/store/app'
  import { readFileAsync, writeFileAsync } from '@shared/file'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { More, ArrowDown, Lock } from '@element-plus/icons-vue'
  import { MessageError, MessageSuccess } from '@/util/Element'
  import type { AppHost } from '@shared/app'
  import { type HostProjectType, HostStore } from './store'
  import ListJava from './Java/ListTable.vue'
  import ListNode from './Node/ListTable.vue'
  import ListGo from './Go/ListTable.vue'
  import ListPython from './Python/ListTable.vue'
  import ListTomcat from './Tomcat/ListTable.vue'
  import VhostTmpl from './VhostTmpl/index.vue'
  import { SetupStore } from '@/components/Setup/store'
  import Router from '@/router'

  const { statSync, existsSync, copyFileSync } = require('fs')
  const { dialog, clipboard, shell } = require('@electron/remote')
  const { join, dirname } = require('path')

  const appStore = AppStore()
  const setupStore = SetupStore()

  const isLock = computed(() => {
    return !setupStore.isActive && appStore.hosts.length > 2
  })

  const tabs = computed(() => {
    return [
      {
        label: I18nT('host.projectAGroup'),
        value: 'a',
        sub: {
          php: I18nT('host.projectPhp'),
          tomcat: I18nT('host.projectTomcat')
        }
      },
      {
        label: I18nT('host.projectBGroup'),
        value: 'b',
        sub: {
          java: I18nT('host.projectJava'),
          node: I18nT('host.projectNode'),
          go: I18nT('host.projectGo'),
          python: I18nT('host.projectPython')
        }
      }
    ]
  })

  const tab = computed(() => {
    const dict: any = {}
    tabs.value.forEach((v) => {
      Object.assign(dict, v.sub)
    })
    return dict[HostStore.tab]
  })

  const setTab = (tab: HostProjectType) => {
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

  const ipv6 = computed({
    get() {
      return hostsSet?.value?.ipv6 !== false
    },
    set(v) {
      appStore.config.setup.hosts.ipv6 = v
    }
  })

  watch(
    hostsSet,
    () => {
      hostsWrite()
      appStore.saveConfig()
    },
    {
      deep: true
    }
  )

  const hostsWrite = (showTips = true) => {
    IPC.send('app-fork:host', 'writeHosts', hostWrite.value, ipv6.value).then((key: string) => {
      IPC.off(key)
      showTips && MessageSuccess(I18nT('base.success'))
    })
  }
  const hostAlias = (item: AppHost) => {
    const alias = item.alias
      ? item.alias.split('\n').filter((n) => {
          return n && n.length > 0
        })
      : []
    if (item?.name) {
      alias.unshift(item.name)
    }
    return alias.join(' ')
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
          const alias = hostAlias(item as any)
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
    if (HostStore.tab === 'php') {
      AsyncComponentShow(EditVM).then()
    } else if (HostStore.tab === 'java') {
      import('./Java/Edit.vue').then((res) => {
        AsyncComponentShow(res.default).then()
      })
    } else if (HostStore.tab === 'node') {
      import('./Node/Edit.vue').then((res) => {
        AsyncComponentShow(res.default).then()
      })
    } else if (HostStore.tab === 'go') {
      import('./Go/Edit.vue').then((res) => {
        AsyncComponentShow(res.default).then()
      })
    } else if (HostStore.tab === 'python') {
      import('./Python/Edit.vue').then((res) => {
        AsyncComponentShow(res.default).then()
      })
    } else if (HostStore.tab === 'tomcat') {
      import('./Tomcat/Edit.vue').then((res) => {
        AsyncComponentShow(res.default).then()
      })
    }
  }
  const toLicense = () => {
    setupStore.tab = 'licenses'
    appStore.currentPage = '/setup'
    Router.push({
      path: '/setup'
    })
      .then()
      .catch()
  }
  const openCreateProject = () => {
    import('./CreateProject/new.vue').then((res) => {
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

  onMounted(() => {
    if (appStore.hosts.length === 0) {
      appStore.initHost()
    }
    hostsWrite(false)
  })
</script>
