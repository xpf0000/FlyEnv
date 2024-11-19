<template>
  <div class="soft-index-panel main-right-panel">
    <ul class="top-tab">
      <el-dropdown class="mr-3" @command="setTab">
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
    <ListJava v-show="HostStore.tab === 'java'"></ListJava>
    <ListNode v-show="HostStore.tab === 'node'"></ListNode>
    <ListGo v-show="HostStore.tab === 'go'"></ListGo>
    <ListPython v-show="HostStore.tab === 'python'"></ListPython>
    <ListTomcat v-show="HostStore.tab === 'tomcat'"></ListTomcat>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch, onMounted } from 'vue'
  import List from './ListTable.vue'
  import { AppStore } from '@web/store/app'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '@web/fn'
  import { More, ArrowDown } from '@element-plus/icons-vue'
  import { MessageSuccess } from '@/util/Element'
  import type { AppHost } from '@shared/app'
  import { type HostProjectType, HostStore } from './store'
  import ListJava from './Java/ListTable.vue'
  import ListNode from './Node/ListTable.vue'
  import ListGo from './Go/ListTable.vue'
  import ListPython from './Python/ListTable.vue'
  import ListTomcat from './Tomcat/ListTable.vue'
  import VhostTmpl from '@web/components/Host/VhostTmpl/index.vue'

  const appStore = AppStore()

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

  watch(hostWrite, () => {
    hostsWrite()
  })

  const hostsWrite = (showTips = true) => {
    showTips && MessageSuccess(I18nT('base.success'))
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
        MessageSuccess(I18nT('base.copySuccess'))
        break
      case 'hostsOpen':
        break
    }
  }
  const doExport = () => {}
  const doImport = () => {}

  let HostsVM: any
  import('./Hosts.vue').then((res) => {
    HostsVM = res.default
  })
  const openHosts = () => {
    AsyncComponentShow(HostsVM).then()
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

  onMounted(() => {
    hostsWrite(false)
  })
</script>
