<template>
  <el-drawer
    v-model="show"
    :title="`${instance?.name ?? id} — ${t(view)}`"
    size="85%"
    destroy-on-close
    @closed="closedFn"
  >
    <div class="flex h-full min-h-0 flex-col gap-4">
      <template v-if="view === 'manage'">
        <el-alert :title="t('adminHint')" type="info" :closable="false" />
        <el-form label-position="top" class="grid grid-cols-1 gap-3 md:grid-cols-3" @submit.prevent>
          <el-form-item :label="t('password')"
            ><el-input v-model="password" type="password" show-password
          /></el-form-item>
          <el-form-item :label="t('credentials')"
            ><div class="flex items-center gap-3"
              ><el-checkbox v-model="remember">{{ t('remember') }}</el-checkbox
              ><el-button :loading="busy" @click="connect">{{ t('connect') }}</el-button></div
            ></el-form-item
          >
          <el-form-item :label="t('backupDir')"
            ><span class="truncate mr-3">{{ manager.preferences[id]?.backupDir || '—' }}</span
            ><el-button
              link
              :loading="management.directoryBusy(id)"
              @click="management.chooseBackupDirectory(id)"
              >{{ t('edit') }}</el-button
            ></el-form-item
          >
        </el-form>
        <el-alert v-if="readOnly" :title="t('readOnly')" type="warning" :closable="false" />
        <div class="flex flex-wrap gap-2"
          ><el-button :disabled="busy || readOnly || !connected" @click="addOpen = true">{{
            t('addDatabase')
          }}</el-button
          ><el-button
            :disabled="busy || !selected.length"
            @click="management.backup(id, selected)"
            >{{ t('backup') }}</el-button
          ><el-button :loading="busy" @click="management.refresh(id)">{{
            t('refresh')
          }}</el-button></div
        >
        <el-tabs class="min-h-0 flex-1">
          <el-tab-pane :label="t('databases')">
            <el-table
              :data="listing.databases"
              show-overflow-tooltip
              @selection-change="selectDatabases"
            >
              <el-table-column type="selection" width="46" /><el-table-column
                prop="name"
                :label="t('database')"
              /><el-table-column :label="t('users')"
                ><template #default="{ row }">{{
                  row.users.join(', ') || '—'
                }}</template></el-table-column
              >
              <el-table-column :label="t('mark')"
                ><template #default="{ row }"
                  ><el-input
                    :model-value="manager.preferences[id]?.marks?.[row.name] || ''"
                    @change="saveMark(row.name, $event)" /></template
              ></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="t('users')">
            <el-table :data="listing.users" show-overflow-tooltip
              ><el-table-column prop="User" :label="t('user')" /><el-table-column
                prop="Host"
                :label="t('host')"
              /><el-table-column :label="t('savedPassword')"
                ><template #default="{ row }"
                  ><el-input
                    v-if="manager.preferences[id]?.passwords?.[`${row.User}@${row.Host}`]"
                    :model-value="manager.preferences[id].passwords[`${row.User}@${row.Host}`]"
                    type="password"
                    show-password
                    readonly /></template></el-table-column
              ><el-table-column :label="t('actions')" width="160"
                ><template #default="{ row }"
                  ><el-button link :disabled="busy || readOnly" @click="openPassword(row)">{{
                    t('changePassword')
                  }}</el-button></template
                ></el-table-column
              ></el-table
            >
          </el-tab-pane>
        </el-tabs>
      </template>
      <template v-else>
        <div class="flex items-center gap-3"
          ><el-button :loading="busy" @click="loadText">{{ t('refresh') }}</el-button
          ><el-button v-if="view === 'config'" type="primary" :loading="busy" @click="saveConfig">{{
            t('save')
          }}</el-button
          ><span v-if="view === 'config'" class="text-xs opacity-70">{{
            t('configHint')
          }}</span></div
        >
        <el-input
          v-if="view === 'config'"
          v-model="text"
          type="textarea"
          :rows="25"
          spellcheck="false"
          class="font-mono"
        />
        <el-scrollbar v-else class="min-h-0 flex-1">
          <pre class="whitespace-pre-wrap break-all font-mono text-xs">{{
            text || t('noLog')
          }}</pre>
        </el-scrollbar>
      </template>
      <el-alert
        v-if="manager.operations[id]?.error"
        :title="manager.operations[id].error"
        type="error"
        :closable="false"
      />
    </div>
    <el-dialog v-model="addOpen" :title="t('addDatabase')" width="540px" append-to-body>
      <el-form label-position="top"
        ><el-form-item :label="t('database')"><el-input v-model="database.database" /></el-form-item
        ><el-form-item :label="t('user')"><el-input v-model="database.user" /></el-form-item
        ><el-form-item :label="t('password')"
          ><el-input v-model="database.password" type="password" show-password /></el-form-item
        ><el-form-item :label="t('charset')"
          ><el-select v-model="database.charset" class="w-full"
            ><el-option
              v-for="v in ['utf8mb4', 'utf8', 'latin1', 'ascii']"
              :key="v"
              :label="v"
              :value="v" /></el-select></el-form-item
        ><el-text type="info">{{ t('reuseUser') }}</el-text></el-form
      >
      <template #footer
        ><el-button @click="addOpen = false">{{ t('cancel') }}</el-button
        ><el-button type="primary" :loading="busy" @click="addDatabase">{{
          t('confirm')
        }}</el-button></template
      >
    </el-dialog>
    <el-dialog v-model="passwordOpen" :title="t('changePassword')" width="500px" append-to-body
      ><el-form label-position="top"
        ><el-form-item :label="`${passwordUser.User}@${passwordUser.Host}`"
          ><el-input v-model="newPassword" type="password" show-password /></el-form-item
        ><el-checkbox v-model="rememberUser">{{ t('rememberPassword') }}</el-checkbox></el-form
      ><template #footer
        ><el-button @click="passwordOpen = false">{{ t('cancel') }}</el-button
        ><el-button type="primary" :loading="busy" @click="changePassword">{{
          t('confirm')
        }}</el-button></template
      ></el-dialog
    >
  </el-drawer>
</template>
<script setup lang="ts">
  import { computed, reactive, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { MysqlClusterManager as manager } from './manager'
  import { MysqlManagement as management } from './manage'
  import { t } from './lang'
  const props = defineProps<{ id: string; view: 'manage' | 'config' | 'errorLog' | 'slowLog' }>()
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const instance = computed(() => manager.catalog.instances.find((i) => i.id === props.id))
  const busy = computed(() => !!manager.operations[props.id]?.busy)
  const readOnly = computed(() => {
    const group = manager.groupFor(props.id)
    return group?.mode === 'replication'
      ? group.memberIds[0] !== props.id
      : group?.mode === 'group-replication'
        ? manager.snapshots[props.id]?.replication?.role !== 'PRIMARY' ||
          manager.snapshots[props.id]?.replication?.state !== 'online'
        : false
  })
  const connected = computed(() => !!manager.credentials[props.id])
  const listing = computed(() => management.lists[props.id] ?? { databases: [], users: [] })
  const password = ref(manager.credentials[props.id]?.password ?? ''),
    remember = ref(!!manager.preferences[props.id]?.rootCredential)
  const selected = ref<string[]>([]),
    text = ref(''),
    addOpen = ref(false),
    passwordOpen = ref(false),
    newPassword = ref(''),
    rememberUser = ref(false)
  const passwordUser = ref({ User: '', Host: 'localhost' })
  const database = reactive({ database: '', user: '', password: '', charset: 'utf8mb4' })
  async function connect() {
    if (await manager.setCredential(props.id, password.value, remember.value)) {
      await manager.refresh()
      await management.refresh(props.id)
    }
  }
  async function loadText() {
    text.value =
      (await manager.command<string>(
        props.id,
        props.view === 'config' ? 'readConfig' : 'readLog',
        props.view === 'config' ? [] : [props.view === 'slowLog' ? 'slow' : 'error']
      )) ?? text.value
  }
  async function saveConfig() {
    await manager.command(props.id, 'saveConfig', [text.value], true)
  }
  async function addDatabase() {
    if (await management.add(props.id, { ...database })) addOpen.value = false
  }
  async function changePassword() {
    if (
      await management.password(
        props.id,
        passwordUser.value.User,
        passwordUser.value.Host,
        newPassword.value,
        rememberUser.value
      )
    ) {
      passwordOpen.value = false
      password.value = manager.credentials[props.id]?.password ?? ''
    }
  }
  async function saveMark(name: string, value: string) {
    await manager.savePreferences(props.id, {
      marks: { ...manager.preferences[props.id]?.marks, [name]: value }
    })
  }
  function selectDatabases(rows: { name: string }[]) {
    selected.value = rows.map((row) => row.name)
  }
  function openPassword(user: { User: string; Host: string }) {
    passwordUser.value = user
    newPassword.value = ''
    rememberUser.value = false
    passwordOpen.value = true
  }
  if (props.view === 'manage') {
    if (connected.value) management.refresh(props.id).catch(() => undefined)
  } else loadText().catch(() => undefined)
  defineExpose({ show, onClosed, onSubmit })
</script>
