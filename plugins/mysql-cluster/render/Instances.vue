<template>
  <el-card class="h-full mc-instances">
    <template #header
      ><div class="flex items-center justify-between gap-3"
        ><span>{{ t('instances') }}</span
        ><div class="flex gap-2"
          ><el-button :loading="manager.refreshing" @click="refresh">{{ t('refresh') }}</el-button
          ><el-button type="primary" @click="create">{{ t('create') }}</el-button></div
        ></div
      ></template
    >
    <el-scrollbar>
      <el-empty v-if="!manager.catalog.clusters.length" :description="t('empty')" />
      <section
        v-for="group in manager.catalog.clusters"
        :key="group.id"
        class="mb-6 rounded border border-[var(--el-border-color-light)]"
      >
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--el-border-color-light)] px-4 py-3"
        >
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2"
            ><strong>{{ group.name }}</strong
            ><el-tag size="small">{{ t(group.mode) }}</el-tag
            ><template v-if="sharedEngines[group.id]">
              <el-tag size="small">MySQL {{ sharedEngines[group.id]!.version }}</el-tag>
              <span
                class="min-w-0 max-w-full cursor-pointer truncate text-yellow-500"
                :title="sharedEngines[group.id]!.path"
                @click="openPath(sharedEngines[group.id]!.path)"
                >{{ sharedEngines[group.id]!.path }}</span
              > </template
            ><el-tag v-if="manager.operations[group.id]?.busy" type="warning" size="small">{{
              manager.operations[group.id].stage
            }}</el-tag></div
          >
          <div class="flex flex-wrap items-center gap-3">
            <ActionButton
              v-for="action in groupActions(group)"
              :key="action"
              :action="action"
              :disabled="groupBusy(group)"
              @click="runGroup(group, action)"
            />
            <ActionButton
              v-if="group.mode !== 'standalone'"
              action="credentials"
              :disabled="groupBusy(group)"
              @click="credentials(group)"
            />
            <ActionButton action="edit" :disabled="groupBusy(group)" @click="edit(group)" />
            <ActionButton action="delete" :disabled="groupBusy(group)" @click="remove(group)" />
          </div>
        </div>
        <el-table :data="members(group)" show-overflow-tooltip>
          <el-table-column prop="name" :label="t('name')" min-width="130" />
          <el-table-column v-if="!sharedEngines[group.id]" :label="t('version')" width="110"
            ><template #default="{ row }">{{ row.engine.version }}</template></el-table-column
          >
          <el-table-column v-if="!sharedEngines[group.id]" :label="t('path')" min-width="220"
            ><template #default="{ row }"
              ><span class="cursor-pointer text-yellow-500" @click="openPath(row.engine.path)">{{
                row.engine.path
              }}</span></template
            ></el-table-column
          >
          <el-table-column prop="port" :label="t('port')" width="95" />
          <el-table-column
            prop="socket"
            :label="t(isWindows ? 'pipe' : 'socket')"
            min-width="220"
          />
          <el-table-column prop="dataDir" :label="t('dataDir')" min-width="220"
            ><template #default="{ row }"
              ><span class="cursor-pointer text-yellow-500" @click="openPath(row.dataDir)">{{
                row.dataDir
              }}</span></template
            ></el-table-column
          >
          <el-table-column :label="t('role')" width="125"
            ><template #default="{ row }">{{
              manager.snapshots[row.id]?.role || (group.mode === 'standalone' ? '—' : t('unknown'))
            }}</template></el-table-column
          >
          <el-table-column :label="t('state')" min-width="170"
            ><template #default="{ row }"
              ><el-tooltip
                :content="
                  manager.snapshots[row.id]?.replication?.error ||
                  manager.snapshots[row.id]?.error ||
                  ''
                "
                :disabled="
                  !manager.snapshots[row.id]?.replication?.error &&
                  !manager.snapshots[row.id]?.error
                "
                ><div class="flex items-center gap-2"
                  ><el-tag
                    :type="manager.snapshots[row.id]?.state === 'running' ? 'success' : 'info'"
                    size="small"
                    >{{ t(manager.snapshots[row.id]?.state || 'unknown') }}</el-tag
                  ><span v-if="manager.snapshots[row.id]?.replication" class="text-xs">{{
                    t(manager.snapshots[row.id].replication!.state)
                  }}</span></div
                ></el-tooltip
              ></template
            ></el-table-column
          >
          <el-table-column :label="t('lag')" width="105"
            ><template #default="{ row }">{{
              manager.snapshots[row.id]?.replication?.lag == null
                ? '—'
                : `${manager.snapshots[row.id].replication!.lag} ${t('seconds')}`
            }}</template></el-table-column
          >
          <el-table-column :label="t('actions')" fixed="right" width="155" align="center"
            ><template #default="{ row }"
              ><div class="flex items-center justify-center gap-2"
                ><ActionButton
                  :action="manager.snapshots[row.id]?.state === 'running' ? 'stop' : 'start'"
                  :loading="
                    !!manager.operations[row.id]?.busy &&
                    manager.operations[row.id]?.action !== 'restart'
                  "
                  :disabled="groupBusy(group)"
                  @click="
                    manager.runInstance(
                      row.id,
                      manager.snapshots[row.id]?.state === 'running' ? 'stop' : 'start'
                    )
                  " /><ActionButton
                  v-if="manager.snapshots[row.id]?.state === 'running'"
                  action="restart"
                  :loading="
                    !!manager.operations[row.id]?.busy &&
                    manager.operations[row.id]?.action === 'restart'
                  "
                  :disabled="groupBusy(group) || !!manager.operations[row.id]?.busy"
                  @click="manager.runInstance(row.id, 'restart')" /><InstanceActions
                  :instance="row" /></div></template
          ></el-table-column>
        </el-table>
        <el-alert
          v-if="manager.operations[group.id]?.error"
          :title="manager.operations[group.id].error"
          type="error"
          :closable="false"
        />
        <template v-for="member in members(group)" :key="member.id"
          ><el-alert
            v-if="manager.operations[member.id]?.error"
            :title="`${member.name}: ${manager.operations[member.id].error}`"
            type="error"
            :closable="false"
        /></template>
      </section>
      <el-alert
        v-if="manager.loadError"
        :title="manager.loadError"
        type="error"
        :closable="false"
      />
    </el-scrollbar>
    <el-dialog v-model="credentialOpen" :title="t('credentials')" width="520px"
      ><el-form label-position="top"
        ><el-form-item
          v-for="id in credentialGroup?.memberIds"
          :key="id"
          :label="manager.catalog.instances.find((i) => i.id === id)?.name"
          ><el-input v-model="passwords[id]" type="password" show-password /></el-form-item
        ><el-checkbox v-model="remember">{{ t('remember') }}</el-checkbox></el-form
      ><template #footer
        ><el-button @click="credentialOpen = false">{{ t('cancel') }}</el-button
        ><el-button type="primary" @click="saveCredentials">{{ t('save') }}</el-button></template
      ></el-dialog
    >
  </el-card>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { shell } from '@/util/NodeFn'
  import { BrewStore } from '@/store/brew'
  import { MysqlClusterManager as manager } from './manager'
  import type { ClusterSpec, EngineRef } from '../shared'
  import InstanceActions from './InstanceActions.vue'
  import ActionButton from './ActionButton.vue'
  import { t } from './lang'
  type LifecycleAction = 'start' | 'stop' | 'restart'
  const isWindows = !!window.Server.isWindows
  const credentialOpen = ref(false),
    credentialGroup = ref<ClusterSpec>(),
    passwords = ref<Record<string, string>>({}),
    remember = ref(false)
  const members = (group: ClusterSpec) =>
    group.memberIds.map((id) => manager.catalog.instances.find((i) => i.id === id)!).filter(Boolean)
  const sharedEngines = computed(() => {
    const engines: Record<string, EngineRef | undefined> = {}
    for (const group of manager.catalog.clusters) {
      const nodes = members(group)
      const engine = nodes[0]?.engine
      if (
        engine &&
        nodes.every(
          (node) => node.engine.version === engine.version && node.engine.path === engine.path
        )
      )
        engines[group.id] = engine
    }
    return engines
  })
  const groupActions = (group: ClusterSpec): Array<LifecycleAction> => {
    const nodes = members(group)
    if (nodes.length && nodes.every((node) => manager.snapshots[node.id]?.state === 'running'))
      return ['stop', 'restart']
    return nodes.some((node) => manager.snapshots[node.id]?.state === 'running')
      ? ['start', 'stop']
      : ['start']
  }
  const groupBusy = (group: ClusterSpec) =>
    !!manager.operations[group.id]?.busy ||
    group.memberIds.some((id) => manager.operations[id]?.busy)
  async function refresh() {
    try {
      if (!manager.initialized) await manager.load()
      else await manager.refresh()
    } catch {
      /* Singleton retains the error. */
    }
  }
  async function create() {
    const module = BrewStore().module('mysql')
    module.installedFetched = false
    await module.fetchInstalled()
    const component = await import('./InstanceDialog.vue')
    await AsyncComponentShow(component.default, {})
  }
  async function edit(group: ClusterSpec) {
    const component = await import('./InstanceDialog.vue')
    await AsyncComponentShow(component.default, { group })
  }
  async function remove(group: ClusterSpec) {
    try {
      await ElMessageBox.confirm(t('deleteHint'), t('delete'), { type: 'warning' })
    } catch {
      return
    }
    await manager.remove(group)
  }
  async function openPath(path: string) {
    await shell.openPath(path)
  }
  function credentials(group: ClusterSpec) {
    credentialGroup.value = group
    passwords.value = Object.fromEntries(
      group.memberIds.map((id) => [id, manager.credentials[id]?.password ?? ''])
    )
    credentialOpen.value = true
  }
  async function saveCredentials() {
    if (!credentialGroup.value) return
    for (const id of credentialGroup.value.memberIds)
      if (!(await manager.setCredential(id, passwords.value[id], remember.value))) return
    credentialOpen.value = false
    await manager.refresh()
  }
  function runGroup(group: ClusterSpec, action: LifecycleAction) {
    if (
      action !== 'stop' &&
      group.mode !== 'standalone' &&
      group.memberIds.some((id) => !manager.credentials[id])
    ) {
      credentials(group)
      return
    }
    manager.runGroup(group, action).catch(() => undefined)
  }
</script>
<style scoped>
  .mc-instances {
    display: flex;
    flex-direction: column;
  }
  .mc-instances :deep(.el-card__body) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
