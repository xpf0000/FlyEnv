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
          <span class="ml-3 truncate"
            >{{ instance?.name }} - {{ instance?.engine.version }} -
            {{ instance?.engine.path }}</span
          >
        </div>
      </div>
      <div v-loading="backuping" class="main-wapper p-3">
        <el-card class="h-full version-manager">
          <template #header>
            <div class="card-header">
              <div class="left flex-wrap gap-y-2">
                <el-button
                  :disabled="busy || readOnly || !connected || !running"
                  @click.stop="showAddDatabase"
                  >{{ I18nT('mysql.addDatabase') }}</el-button
                >
                <el-button
                  :disabled="busy || !connected || !running"
                  @click.stop="showRootPassword"
                  >{{ I18nT('mysql.rootPassword') }}</el-button
                >
                <el-dropdown
                  :disabled="busy || !running || !connected || !selectDatabase.length"
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
                <el-button :disabled="busy" @click.stop="showBackupDirSet">{{
                  I18nT('mysql.backupSaveDirSet')
                }}</el-button>
                <el-button
                  :loading="busy && !backuping"
                  :disabled="!running || !connected"
                  @click.stop="management.refresh(id)"
                  >{{ t('refresh') }}</el-button
                >
              </div>
            </div>
          </template>
          <template #default>
            <template v-if="!running">
              <el-empty :description="I18nT('mysql.mysqlNeedRunTips', { app: 'MariaDB' })" />
            </template>
            <template v-else>
              <el-form
                v-if="!connected || !listing"
                label-position="top"
                class="mb-3 p-5"
                @submit.prevent="connect"
              >
                <el-form-item :label="t('password')" required>
                  <el-input v-model="password" type="password" show-password />
                </el-form-item>
                <div class="flex items-center gap-3">
                  <el-checkbox v-model="remember">{{ t('remember') }}</el-checkbox>
                  <el-button :loading="busy" @click="connect">{{ t('connect') }}</el-button>
                </div>
              </el-form>
              <el-alert
                v-if="readOnly"
                class="mb-3"
                :title="t('readOnly')"
                type="warning"
                :closable="false"
              />
              <Database v-if="connected && listing" :id="id" ref="databasevm" />
            </template>
          </template>
        </el-card>
      </div>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup, AsyncComponentShow } from '@/util/AsyncComponent'
  import { MariadbManagement as management } from '../manage'
  import { MariadbClusterManager as manager } from '../manager'
  import { t } from '../lang'
  import Database from './database.vue'

  const props = defineProps<{ id: string }>()
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const databasevm = ref()
  const instance = computed(() => manager.catalog.instances.find((item) => item.id === props.id))
  const busy = computed(() => management.busy(props.id))
  const running = computed(() => manager.snapshots[props.id]?.state === 'running')
  const readOnly = computed(() => management.readOnly(props.id))
  const connected = computed(() => !!manager.credentials[props.id])
  const listing = computed(() => management.lists[props.id])
  const selectDatabase = computed<string[]>(() => databasevm.value?.selectDatabase ?? [])
  const backuping = computed(() => management.actions[props.id] === 'backup')
  const password = ref(manager.credentials[props.id]?.password ?? '')
  const remember = ref(!!manager.preferences[props.id]?.rootCredential)

  const connect = () => management.connect(props.id, password.value, remember.value)
  const doBackup = () => management.backup(props.id, selectDatabase.value)
  const showRootPassword = () => {
    import('./setPassword.vue').then((res) => {
      void AsyncComponentShow(res.default, {
        id: props.id,
        user: 'root',
        host: 'localhost',
        showUpdateBtn: true,
        showResetBtn: true
      })
    })
  }
  const showAddDatabase = () => {
    import('./addDatabase.vue').then((res) => {
      void AsyncComponentShow(res.default, { id: props.id })
    })
  }
  const showBackupDirSet = () => {
    import('./setBackupDir.vue').then((res) => {
      void AsyncComponentShow(res.default, { id: props.id })
    })
  }
  watch(
    () => running.value && connected.value,
    (ready) => {
      if (ready) void management.refresh(props.id)
    },
    { immediate: true }
  )
  defineExpose({ show, onSubmit, onClosed })
</script>
