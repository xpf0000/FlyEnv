<template>
  <el-dialog
    v-model="show"
    :title="t(group ? 'edit' : 'create')"
    width="min(960px, 94vw)"
    class="mc-dialog"
    destroy-on-close
    @closed="closedFn"
  >
    <el-scrollbar max-height="65vh">
      <el-alert
        :title="t(group ? 'editHint' : 'groupHint')"
        type="info"
        :closable="false"
        class="mb-4"
      />
      <el-form
        ref="formRef"
        :model="validationModel"
        :rules="rules"
        :validate-on-rule-change="false"
        :disabled="busy || directoryPicking"
        label-position="top"
        scroll-to-error
        @submit.prevent
      >
        <div class="grid grid-cols-1 gap-x-5 md:grid-cols-2">
          <el-form-item prop="name" required :label="t('clusterName')"
            ><el-input v-model="form.name"
          /></el-form-item>
          <el-form-item prop="mode" required :label="t('mode')"
            ><el-select v-model="form.mode" :disabled="!!group"
              ><el-option
                v-for="mode in modes"
                :key="mode"
                :label="t(mode)"
                :value="mode" /></el-select
          ></el-form-item>
          <el-form-item prop="engineBin" required :label="t('version')"
            ><el-select v-model="engineBin" :disabled="!!group" filterable
              ><el-option
                v-for="version in versions"
                :key="version.bin"
                :value="version.bin"
                :label="`${version.version} — ${version.path}`" /></el-select
          ></el-form-item>
          <el-form-item
            v-if="form.mode !== 'standalone'"
            prop="count"
            required
            :label="t(form.mode === 'replication' ? 'replicas' : 'nodes')"
            ><el-select
              v-if="form.mode === 'group-replication'"
              v-model="form.count"
              :disabled="!!group"
              ><el-option
                v-for="n in [3, 5, 7, 9]"
                :key="n"
                :value="n"
                :label="String(n)" /></el-select
            ><el-input-number v-else v-model="form.count" :min="1" :max="15" :disabled="!!group"
          /></el-form-item>
          <el-form-item prop="startPort" required :label="t('startPort')"
            ><el-input-number
              v-model="form.startPort"
              :min="1"
              :max="65535"
              :disabled="!!group"
              @input="portEdited = true"
          /></el-form-item>
          <el-form-item v-if="!group" prop="password" required :label="t('password')"
            ><el-input
              v-model="form.password"
              type="password"
              show-password
              autocomplete="new-password"
          /></el-form-item>
        </div>
        <el-alert
          v-if="form.mode === 'group-replication'"
          :title="t('grHint')"
          type="warning"
          :closable="false"
          class="mb-4"
        />
        <p class="mb-3 text-xs opacity-70">{{ t('initialPortHint') }}</p>
        <el-card v-for="(member, index) in members" :key="member.id" class="mb-3" shadow="never">
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <el-form-item :prop="`members.${index}.name`" required :label="t('instanceName')"
              ><el-input v-model="member.name"
            /></el-form-item>
            <el-form-item :prop="`members.${index}.port`" required :label="t('port')"
              ><el-input-number v-model="member.port" :min="1" :max="65535"
            /></el-form-item>
            <el-form-item
              :prop="`members.${index}.socket`"
              required
              :label="t(isWindows ? 'pipe' : 'socket')"
              ><el-input v-model="member.socket"
            /></el-form-item>
            <el-form-item
              v-if="form.mode === 'group-replication'"
              :prop="`members.${index}.groupPort`"
              required
              :label="t('groupPort')"
              ><el-input-number v-model="member.groupPort" :min="1" :max="65535"
            /></el-form-item>
            <el-form-item
              :prop="`members.${index}.dataDir`"
              required
              :label="t('dataDir')"
              class="md:col-span-2"
              ><el-input v-model="member.dataDir" :readonly="directoryLocked(member.id)">
                <template #append
                  ><el-button
                    :icon="FolderOpened"
                    :title="t('selectDataDirectory')"
                    :aria-label="t('selectDataDirectory')"
                    :disabled="directoryLocked(member.id) || busy || directoryPicking"
                    @click="chooseDirectory(member)"
                /></template>
              </el-input>
              <p v-if="directoryLocked(member.id)" class="mt-1 text-xs opacity-70">{{
                t('dataDirLockedHint')
              }}</p>
            </el-form-item>
          </div>
        </el-card>
      </el-form>
    </el-scrollbar>
    <template #footer
      ><el-button @click="show = false">{{ t('cancel') }}</el-button
      ><el-button type="primary" :loading="busy" :disabled="directoryPicking" @click="submit">{{
        t(group ? 'save' : 'create')
      }}</el-button></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
  import { computed, nextTick, reactive, ref, watch } from 'vue'
  import type { FormInstance, FormRules } from 'element-plus'
  import { FolderOpened } from '@element-plus/icons-vue'
  import { dialog } from '@/util/NodeFn'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { BrewStore } from '@/store/brew'
  import { MysqlClusterManager as manager } from './manager'
  import { createDraftRequest, defaultDataRoot, suggestStartPort } from './form'
  import { engineFromInstalled } from './engine'
  import { instanceFormErrors } from './formValidation'
  import { DuplicateNameError, validateCreateRequest, validateUniqueNames } from '../policy'
  import type { ClusterSpec, ClusterMode, EngineRef, InstanceSpec, SavedCatalog } from '../shared'
  import { t } from './lang'
  const props = defineProps<{ group?: ClusterSpec }>()
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const modes: ClusterMode[] = ['standalone', 'replication', 'group-replication']
  const isWindows = !!window.Server.isWindows
  const platform = isWindows ? 'Windows' : window.Server.isMacOS ? 'macOS' : 'Linux'
  const versions = computed(() =>
    BrewStore()
      .module('mysql')
      .installed.filter((i) => i.version && i.bin)
  )
  const existing = props.group
    ? manager.catalog.instances.filter((i) => props.group!.memberIds.includes(i.id))
    : []
  const id = props.group?.id ?? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const uuid = props.group?.groupUuid ?? crypto.randomUUID()
  const portEdited = ref(false)
  const form = reactive({
    name: props.group?.name ?? 'MySQL',
    mode: props.group?.mode ?? ('standalone' as ClusterMode),
    count:
      props.group?.mode === 'replication'
        ? existing.length - 1
        : props.group?.mode === 'group-replication'
          ? existing.length
          : 1,
    startPort:
      existing[0]?.port ?? suggestStartPort(manager.catalog.instances, 'standalone', 1) ?? 13306,
    rootDir: defaultDataRoot(window.Server.BaseDir!),
    password: ''
  })
  const engineBin = ref(
    existing[0]?.engine.installationBin ?? existing[0]?.engine.bin ?? versions.value[0]?.bin ?? ''
  )
  const members = ref<InstanceSpec[]>(JSON.parse(JSON.stringify(existing)))
  const dataDirs: Record<string, string> = {}
  const directoryLocked = (memberId: string) =>
    !!props.group &&
    (manager.catalog as SavedCatalog & { stages?: Record<string, string> }).stages?.[memberId] !==
      'prepared'
  const busy = computed(() => !!manager.operations[id]?.busy)
  const formRef = ref<FormInstance>()
  const directoryPicking = ref(false)
  const validationModel = computed(() => ({
    ...form,
    engineBin: engineBin.value,
    members: members.value
  }))
  const fieldErrors = computed(() => {
    const version = versions.value.find((i) => i.bin === engineBin.value)
    let engine: EngineRef | undefined
    try {
      engine = props.group
        ? existing[0]?.engine
        : version
          ? engineFromInstalled(version)
          : undefined
    } catch {
      /* Version field reports the unavailable engine. */
    }
    return instanceFormErrors(validationModel.value, {
      catalog: manager.catalog,
      editingGroupId: props.group?.id,
      platform,
      engine,
      t
    })
  })
  const rules = computed<FormRules>(() => {
    const keys = [
      'name',
      'mode',
      'engineBin',
      'startPort',
      ...(!props.group ? ['password'] : []),
      ...(form.mode !== 'standalone' ? ['count'] : [])
    ]
    members.value.forEach((_, index) => {
      for (const field of [
        'name',
        'port',
        'socket',
        'dataDir',
        ...(form.mode === 'group-replication' ? ['groupPort'] : [])
      ])
        keys.push(`members.${index}.${field}`)
    })
    return Object.fromEntries(
      keys.map((key) => [
        key,
        [
          {
            trigger: ['change', 'blur'],
            validator: (_rule: unknown, _value: unknown, callback: (error?: Error) => void) =>
              callback(fieldErrors.value[key] ? new Error(fieldErrors.value[key]) : undefined)
          }
        ]
      ])
    )
  })
  watch(fieldErrors, () => {
    const invalid = formRef.value?.fields
      .filter((field) => field.validateState === 'error')
      .map((field) => field.propString)
    if (invalid?.length) void formRef.value?.validateField(invalid).catch(() => undefined)
  })
  async function chooseDirectory(member: InstanceSpec) {
    if (busy.value || directoryPicking.value || directoryLocked(member.id)) return
    directoryPicking.value = true
    try {
      const result = await dialog.showOpenDialog({
        defaultPath: member.dataDir,
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      if (
        result.canceled ||
        !result.filePaths.length ||
        !show.value ||
        directoryLocked(member.id) ||
        !members.value.includes(member)
      )
        return
      member.dataDir = result.filePaths[0]
      await nextTick()
      await formRef.value
        ?.validateField(`members.${members.value.indexOf(member)}.dataDir`)
        .catch(() => undefined)
    } catch (error) {
      manager.reportFormError(error)
    } finally {
      directoryPicking.value = false
    }
  }
  watch(
    () => form.mode,
    (mode) => {
      if (!props.group) form.count = mode === 'group-replication' ? 3 : 1
    }
  )
  watch(
    () => [form.mode, form.count, manager.catalog.instances],
    () => {
      if (props.group || portEdited.value) return
      const port = suggestStartPort(manager.catalog.instances, form.mode, form.count)
      if (port !== undefined) form.startPort = port
    }
  )
  watch(
    () => [engineBin.value, form.mode, form.count, form.startPort, form.rootDir],
    () => {
      if (props.group) return
      for (const member of members.value) dataDirs[member.id] = member.dataDir
      const version = versions.value.find((i) => i.bin === engineBin.value)
      if (!version) {
        members.value = []
        return
      }
      let engine: EngineRef
      try {
        engine = engineFromInstalled(version)
      } catch {
        members.value = []
        return
      }
      members.value = createDraftRequest(
        { ...form, engine, id, uuid, dataDirs },
        platform
      ).instances
    },
    { immediate: true }
  )
  async function submit() {
    if (busy.value || directoryPicking.value) return
    if (!(await formRef.value?.validate().catch(() => false))) return
    const request = {
      cluster: {
        id,
        name: form.name,
        mode: form.mode,
        memberIds: members.value.map((i) => i.id),
        groupUuid: uuid
      },
      instances: JSON.parse(JSON.stringify(members.value)),
      credentials: Object.fromEntries(
        members.value.map((i) => [i.id, { user: 'root', password: form.password }])
      )
    }
    try {
      if (
        !props.group &&
        !portEdited.value &&
        suggestStartPort(manager.catalog.instances, form.mode, form.count) === undefined
      )
        throw new Error(t('noAvailablePorts'))
      validateCreateRequest(request, platform)
      validateUniqueNames(request, manager.catalog, props.group?.id)
      const result = props.group ? await manager.save(request) : await manager.create(request)
      if (result.status !== 'completed') await formRef.value?.validate().catch(() => false)
      if (result.status === 'completed') show.value = false
      else if (manager.catalog.clusters.some((g) => g.id === id)) show.value = false
    } catch (e) {
      manager.reportFormError(
        e instanceof DuplicateNameError
          ? new Error(
              t(e.scope === 'cluster' ? 'duplicateClusterName' : 'duplicateInstanceName') + e.value
            )
          : e
      )
    }
  }
  defineExpose({ show, onClosed, onSubmit })
</script>
<style scoped>
  .el-select,
  .el-input,
  .el-input-number {
    width: 100%;
    max-width: none;
  }
</style>
