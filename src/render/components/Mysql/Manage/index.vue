<template>
  <el-drawer
    v-model="show"
    size="85%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav pl-3 pr-5">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-3 truncate">{{ item.version }} - {{ item.path }}</span>
        </div>
      </div>
      <div v-loading="backuping" class="main-wapper p-3">
        <el-card class="h-full version-manager">
          <template #header>
            <div class="card-header">
              <div class="left">
                <template v-if="item.running">
                  <el-button :loading="true" link></el-button>
                </template>
                <template v-else>
                  <template v-if="item.run">
                    <el-button
                      link
                      class="status running"
                      :class="{ disabled: versionRunning }"
                      @click.stop="item.serviceDo('stop')"
                    >
                      <yb-icon :svg="import('@/svg/stop2.svg?raw')" />
                    </el-button>
                    <el-button
                      link
                      class="status refresh"
                      :class="{ disabled: versionRunning }"
                      @click.stop="item.serviceDo('restart')"
                    >
                      <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" />
                    </el-button>
                  </template>
                  <template v-else>
                    <el-button
                      link
                      class="status start current"
                      :class="{
                        disabled: versionRunning || !item.version
                      }"
                      @click.stop="item.serviceDo('start')"
                    >
                      <yb-icon :svg="import('@/svg/play.svg?raw')" />
                    </el-button>
                  </template>
                </template>
                <el-button :disabled="versionRunning" @click.stop="showAddDatabase">{{
                  I18nT('mysql.addDatabase')
                }}</el-button>
                <el-button :disabled="versionRunning" @click.stop="showRootPassword">{{
                  I18nT('mysql.rootPassword')
                }}</el-button>
                <el-button @click.stop="toPhpMyAdmin">phpMyAdmin</el-button>
                <el-dropdown
                  :disabled="backuping || !selectDatabase || selectDatabase.length === 0"
                  split-button
                  class="ml-3"
                  @click="doBackup"
                >
                  {{ I18nT('mysql.databaseBackup') }}
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click.stop="showBackupDirSet">{{
                        I18nT('mysql.backupSaveDirSet')
                      }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </template>
          <template #default>
            <template v-if="!item.run">
              <el-empty
                :description="
                  I18nT('mysql.mysqlNeedRunTips', {
                    app: item.typeFlag === 'mysql' ? 'MySQL' : 'MariaDB'
                  })
                "
              ></el-empty>
            </template>
            <template v-else>
              <Database ref="databasevm" :item="item" />
            </template>
          </template>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, onUnmounted, watch, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup, AsyncComponentShow } from '@/util/AsyncComponent'
  import type { ModuleInstalledItem } from '@/core/Module/ModuleInstalledItem'
  import { MySQLManage } from '@/components/Mysql/Manage/manage'
  import { BrewStore } from '@/store/brew'
  import Database from '@/components/Mysql/Manage/database.vue'
  import { AppHost, AppStore } from '@/store/app'
  import { shell } from '@/util/NodeFn'
  import { handleWriteHosts } from '@/util/Host'

  const props = defineProps<{
    item: ModuleInstalledItem
  }>()

  const databasevm = ref()

  const brewStore = BrewStore()

  const versionRunning = computed(() => {
    return brewStore.module(props.item.typeFlag)?.installed?.some((f) => f.running)
  })

  const selectDatabase = computed(() => {
    return databasevm?.value?.selectDatabase
  })

  const backuping = computed(() => {
    return MySQLManage.backuping?.[props.item.bin]
  })

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const doBackup = () => {
    if (backuping.value || !selectDatabase.value || selectDatabase.value.length === 0) {
      return
    }
    MySQLManage.backupDatabase(props.item, selectDatabase.value).catch()
  }

  const showRootPassword = () => {
    console.log('showRootPassword item: ', props.item)
    import('./setPassword.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item: props.item,
        user: 'root',
        showUpdateBtn: true,
        showResetBtn: true
      }).then()
    })
  }

  const showAddDatabase = () => {
    import('./addDatabase.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item: props.item
      }).then()
    })
  }

  const showBackupDirSet = () => {
    import('./setBackupDir.vue').then((res) => {
      AsyncComponentShow(res.default, {
        item: props.item
      }).then()
    })
  }

  const isRun = computed(() => {
    return props.item.run && !props.item.running
  })

  if (isRun.value) {
    MySQLManage.fetchDatabase(props.item)
      .then(() => {})
      .catch()
  }

  watch(isRun, (v) => {
    if (v) {
      MySQLManage.fetchDatabase(props.item)
        .then(() => {})
        .catch()
    }
  })

  let PhpMyAdminVM: any
  import('@/components/ServiceManager/phpMyAdmin.vue').then((res) => {
    PhpMyAdminVM = res.default
  })

  const appStore = AppStore()

  const toPhpMyAdmin = () => {
    const toOpenHost = (item: AppHost) => {
      const host = item.name
      const nginxRunning = brewStore.module('nginx').installed.find((i) => i.run)
      const apacheRunning = brewStore.module('apache').installed.find((i) => i.run)
      const caddyRunning = brewStore.module('caddy').installed.find((i) => i.run)
      let http = 'http://'
      let port = 80
      if (item.useSSL) {
        http = 'https://'
        port = 443
        if (nginxRunning) {
          port = item.port.nginx_ssl
        } else if (apacheRunning) {
          port = item.port.apache_ssl
        } else if (caddyRunning) {
          port = item.port.caddy_ssl
        }
      } else {
        if (nginxRunning) {
          port = item.port.nginx
        } else if (apacheRunning) {
          port = item.port.apache
        } else if (caddyRunning) {
          port = item.port.caddy
        }
      }

      const portStr = port === 80 || port === 443 ? '' : `:${port}`
      const url = `${http}${host}${portStr}`
      shell.openExternal(url)
    }
    const find = appStore.hosts.find((h) => h.name === 'phpmyadmin.test')
    if (find) {
      toOpenHost(find)
      return
    }

    AsyncComponentShow(PhpMyAdminVM).then(async (res) => {
      if (res) {
        await appStore.initHost()
        handleWriteHosts().then().catch()
        const url = 'http://phpmyadmin.test'
        shell.openExternal(url)
      }
    })
  }

  onUnmounted(() => {
    MySQLManage.databaseRaw.splice(0)
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
