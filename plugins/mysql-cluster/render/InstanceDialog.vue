<template>
  <el-dialog v-model="show" :title="t(group ? 'edit' : 'create')" width="min(960px, 94vw)" class="mc-dialog" destroy-on-close @closed="closedFn">
    <el-scrollbar max-height="65vh">
      <el-alert :title="t(group ? 'editHint' : 'groupHint')" type="info" :closable="false" class="mb-4" />
      <el-form label-position="top" class="grid grid-cols-1 gap-x-5 md:grid-cols-2" @submit.prevent>
        <el-form-item :label="t('name')"><el-input v-model="form.name" /></el-form-item>
        <el-form-item :label="t('mode')"><el-select v-model="form.mode" :disabled="!!group"><el-option v-for="mode in modes" :key="mode" :label="t(mode)" :value="mode" /></el-select></el-form-item>
        <el-form-item :label="t('version')"><el-select v-model="engineBin" :disabled="!!group" filterable><el-option v-for="version in versions" :key="version.bin" :value="version.bin" :label="`${version.version} — ${version.path}`" /></el-select></el-form-item>
        <el-form-item v-if="form.mode !== 'standalone'" :label="t(form.mode === 'replication' ? 'replicas' : 'nodes')"><el-select v-if="form.mode === 'group-replication'" v-model="form.count" :disabled="!!group"><el-option v-for="n in [3,5,7,9]" :key="n" :value="n" :label="String(n)" /></el-select><el-input-number v-else v-model="form.count" :min="1" :max="15" :disabled="!!group" /></el-form-item>
        <el-form-item :label="t('startPort')"><el-input-number v-model="form.startPort" :min="1" :max="65535" :disabled="!!group" /></el-form-item>
        <el-form-item :label="t('rootDir')"><el-input v-model="form.rootDir" :disabled="!!group" /></el-form-item>
        <el-form-item v-if="!group" :label="t('password')"><el-input v-model="form.password" type="password" show-password autocomplete="new-password" /></el-form-item>
      </el-form>
      <el-alert v-if="form.mode === 'group-replication'" :title="t('grHint')" type="warning" :closable="false" class="mb-4" />
      <p class="mb-3 text-xs opacity-70">{{ t('initialPortHint') }}</p>
      <el-card v-for="member in members" :key="member.id" class="mb-3" shadow="never">
        <el-form label-position="top" class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item :label="t('name')"><el-input v-model="member.name" /></el-form-item>
          <el-form-item :label="t('port')"><el-input-number v-model="member.port" :min="1" :max="65535" /></el-form-item>
          <el-form-item :label="t(isWindows ? 'pipe' : 'socket')"><el-input v-model="member.socket" /></el-form-item>
          <el-form-item v-if="form.mode === 'group-replication'" :label="t('groupPort')"><el-input-number v-model="member.groupPort" :min="1" :max="65535" /></el-form-item>
          <el-form-item :label="t('dataDir')" class="md:col-span-2"><el-input v-model="member.dataDir" :disabled="!!group" /></el-form-item>
        </el-form>
      </el-card>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
    </el-scrollbar>
    <template #footer><el-button @click="show = false">{{ t('cancel') }}</el-button><el-button type="primary" :loading="busy" :disabled="!members.length" @click="submit">{{ t(group ? 'save' : 'create') }}</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { BrewStore } from '@/store/brew'
  import { join } from '@/util/path-browserify'
  import { MysqlClusterManager as manager } from './manager'
  import { createDraftRequest } from './form'
  import { validateCreateRequest } from '../policy'
  import type { ClusterSpec, ClusterMode, EngineRef, InstanceSpec } from '../shared'
  import { t } from './lang'
  const props = defineProps<{ group?: ClusterSpec }>()
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const modes: ClusterMode[] = ['standalone', 'replication', 'group-replication']
  const isWindows = !!window.Server.isWindows
  const platform = isWindows ? 'Windows' : window.Server.isMacOS ? 'macOS' : 'Linux'
  const versions = computed(() => BrewStore().module('mysql').installed.filter(i => i.version && i.bin))
  const existing = props.group ? manager.catalog.instances.filter(i => props.group!.memberIds.includes(i.id)) : []
  const id = props.group?.id ?? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const uuid = props.group?.groupUuid ?? crypto.randomUUID()
  const form = reactive({ name: props.group?.name ?? 'MySQL', mode: props.group?.mode ?? 'standalone' as ClusterMode, count: props.group?.mode === 'replication' ? existing.length - 1 : props.group?.mode === 'group-replication' ? existing.length : 1, startPort: 13306, rootDir: join(window.Server.MysqlDir!, 'mysql-cluster', 'data'), password: '' })
  const engineBin = ref(existing[0]?.engine.bin ?? versions.value[0]?.bin ?? '')
  const members = ref<InstanceSpec[]>(JSON.parse(JSON.stringify(existing))), error = ref('')
  const busy = computed(() => !!manager.operations[id]?.busy)
  watch(() => form.mode, mode => { if (!props.group) form.count = mode === 'group-replication' ? 3 : 1 })
  watch(() => [engineBin.value, form.mode, form.count, form.startPort, form.rootDir], () => {
    if (props.group) return
    const version = versions.value.find(i => i.bin === engineBin.value)
    if (!version) { members.value = []; return }
    const engine: EngineRef = { version: version.version, path: version.path, bin: version.bin, source: version.source }
    members.value = createDraftRequest({ ...form, engine, id, uuid }, platform).instances
  }, { immediate: true })
  async function submit() {
    error.value = ''
    const request = { cluster: { id, name: form.name, mode: form.mode, memberIds: members.value.map(i => i.id), groupUuid: uuid }, instances: JSON.parse(JSON.stringify(members.value)), credentials: Object.fromEntries(members.value.map(i => [i.id, { user: 'root', password: form.password }])) }
    try {
      validateCreateRequest(request, platform)
      if (!props.group && !form.password) throw new Error(t('password'))
      const result = props.group ? await manager.save(request) : await manager.create(request)
      if (result.status === 'completed') show.value = false
      else { error.value = result.items.map(i => i.error).filter(Boolean).join('\n'); if (manager.catalog.clusters.some(g => g.id === id)) show.value = false }
    } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  }
  defineExpose({ show, onClosed, onSubmit })
</script>
<style scoped>
  .el-select, .el-input, .el-input-number { width: 100%; max-width: none; }
</style>
